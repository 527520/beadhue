// 票 11 通知中心截图：实现侧（铃铛徽标、桌面弹出层、手机底部面板、空状态）与原型同组件语言的参照（头像菜单弹出层、排序底部面板）。
// 用法：IMPL_BASE=http://127.0.0.1:3131 node .scratch/ui-rebuild/tools/shoot-notifications.mjs [seed|impl|proto]
// 打开弹层会把露出的通知标为已读：每轮 impl 前先 seed 造新通知（open-1440 截到未读圆点）。
// 实现侧用 E2E 种子账号：e2e-user 有启动期写入的通知（投稿通过、收到评论），e2e-moderator 没有通知（空状态）。
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const target = process.argv[2] ?? 'impl';
const OUT = resolve('.scratch/ui-rebuild/evidence/impl/11');
mkdirSync(OUT, { recursive: true });
const IMPL = process.env.IMPL_BASE ?? 'http://127.0.0.1:3131';
const PROTO = 'http://127.0.0.1:4180/.scratch/ui-rebuild/prototype/index.html';

const browser = await chromium.launch();
const [onlyName, onlyWidths] = process.argv.slice(3);
async function shoot(name, width, run, { email, proto = false } = {}) {
  if ((onlyName && onlyName !== name) || (onlyWidths && !onlyWidths.split(',').includes(String(width)))) return;
  const mobile = width < 768;
  const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  if (proto) {
    await context.addInitScript(() => { sessionStorage.setItem('proto-consent', 'yes'); sessionStorage.setItem('proto-intro-closed', '1'); });
  } else {
    await context.addCookies([{ name: 'beadhue_analytics_consent', value: 'denied', domain: new URL(IMPL).hostname, path: '/' }]);
    await context.addInitScript(() => localStorage.setItem('beadhue:intro-closed', '1'));
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  if (!proto && email) {
    await page.goto(`${IMPL}/login`);
    const status = await page.evaluate(async (email) => (await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'E2e-pass-123!' }) })).status, email);
    if (status !== 200) console.log('登录失败', email, status);
  }
  await run(page);
  await page.waitForTimeout(900);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await page.screenshot({ path: resolve(OUT, `${target}-${name}-${width}.png`) });
  console.log('shot', name, width, `overflow=${overflow}`, errors.length ? `错误：${errors.join(' | ')}` : '');
  await context.close();
}

const home = async (page) => {
  await page.goto(`${IMPL}/`);
  await page.waitForFunction(() => document.documentElement.dataset.beadhueHydrated === 'true', undefined, { timeout: 60_000 });
  await page.waitForTimeout(1200);
};
const openBell = async (page) => {
  await home(page);
  await page.locator('[data-notifications]:visible').first().click();
  await page.getByRole('dialog', { name: '通知' }).waitFor();
  await page.locator('[data-slot="skeleton"]').first().waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {});
};

/** 造几条新的未读通知给 e2e-user：两件新投稿（一通过、一驳回带原因）+ 管理员评论一条。 */
async function seed() {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${IMPL}/login`);
  const call = (url, body, method = 'POST', headers = {}) => page.evaluate(async ({ url, body, method, headers }) => {
    const response = await fetch(url, { method, headers: { 'content-type': 'application/json', 'idempotency-key': String(Math.random()), ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    return { status: response.status, type: response.headers.get('content-type'), body: await response.json().catch(() => null) };
  }, { url, body, method, headers });
  const login = (email) => call('/api/auth/login', { email, password: 'E2e-pass-123!' });
  await login('e2e-user@example.com');
  const design = (await page.evaluate(async () => (await (await fetch('/api/designs')).json()).items.find((item) => item.name === 'E2E 私人设计')));
  const drafts = [];
  for (const title of ['窗边的小花', '像素奶茶杯']) {
    const response = await call('/api/community/works', { designId: design.id, expectedDesignRevision: design.revision, title, licenseVersion: 'limited-platform-license-v1-draft' });
    if (response.status !== 201) throw new Error(`投稿失败 ${response.status} ${JSON.stringify(response.body)}`);
    const created = response.body;
    await page.evaluate(async (revisionId) => {
      const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAgAB/wdYqHkAAAAASUVORK5CYII='), (char) => char.charCodeAt(0));
      await fetch(`/api/community/revisions/${revisionId}/original`, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: bytes });
    }, created.revisionId);
    const submitted = (await call(`/api/community/revisions/${created.revisionId}/submit`, { expectedVersion: created.version })).body;
    drafts.push({ ...created, title, version: submitted.version });
  }
  const report = (label, result) => console.log(label, result.status, result.body?.error?.code ?? '', result.type);
  report('admin-login', await login('e2e-admin@example.com'));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${IMPL}/admin/reviews`);
  // 后台审核走真实界面（与 E2E 相同的路径）。
  const decide = async (title, action, label, reason, confirm) => {
    await page.getByRole('button', { name: new RegExp(title) }).first().click();
    if (action === '通过并发布') for (const box of await page.getByRole('group', { name: '原创与许可核对' }).getByRole('checkbox').all()) await box.click();
    await page.getByRole('button', { name: action, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(label).fill(reason);
    await dialog.getByRole('button', { name: confirm }).click();
    await dialog.waitFor({ state: 'detached' });
    console.log('decided', title, action);
  };
  await decide(drafts[0].title, '通过并发布', '审核理由', '截图夹具：原创清楚', '通过并发布');
  await decide(drafts[1].title, '驳回', '驳回理由', '标题里有联系方式，请删掉后重新提交', '驳回并通知作者');
  report('comment', await call(`/api/community/works/${drafts[0].workId}/comments`, { body: '颜色搭得真好看，已经照着拼了一个' }));
  await context.close();
}

if (target === 'seed') await seed();
else if (target === 'impl') {
  for (const width of [1440, 1024, 768, 390, 350]) await shoot('badge', width, home, { email: 'e2e-user@example.com' });
  for (const width of [1440, 1024, 768, 390, 350]) await shoot('open', width, openBell, { email: 'e2e-user@example.com' });
  for (const width of [1440, 390]) await shoot('empty', width, openBell, { email: 'e2e-moderator@example.com' });
  for (const width of [1440, 390]) await shoot('guest', width, home);
} else {
  const protoGo = (hash, click) => async (page) => {
    await page.goto(`${PROTO}${hash}`);
    await page.addStyleTag({ content: '.proto-tool{display:none!important}' });
    await page.waitForTimeout(900);
    if (click) await page.locator(click).first().click();
  };
  await shoot('account-menu', 1440, protoGo('#/', '[data-account]'), { proto: true });
  await shoot('sort-sheet', 390, protoGo('#/', '[data-open-sort]'), { proto: true });
  await shoot('empty-comments', 1440, protoGo('#/components'), { proto: true });
}
await browser.close();
