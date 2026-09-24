// 票 06「我的」实现侧截图：与 shoot-me.mjs（原型）同名场景，输出到 evidence/impl/06/。
// 用法：先起开发服务（IMPL_BASE，默认 http://127.0.0.1:3121，BEADHUE_E2E_SEED=1），再
//   node .scratch/ui-rebuild/tools/shoot-me-06.mjs [--w=1440,390] [--only=名称片段]
// 首次运行给 e2e-user 补 4 份云端设计与 1 套自定义色板（已存在则跳过）。
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { BEADS, motifTitle, rasterize } from '../prototype/motifs.js';

const args = process.argv.slice(2);
const widthArg = args.find((arg) => arg.startsWith('--w='));
const widths = widthArg ? widthArg.slice(4).split(',').map(Number) : [1440, 1024, 768, 390, 350];
const only = args.find((arg) => arg.startsWith('--only='))?.slice(7);
const BASE = process.env.IMPL_BASE ?? 'http://127.0.0.1:3121';
const OUT = resolve('.scratch/ui-rebuild/evidence/impl/06');
mkdirSync(OUT, { recursive: true });

async function api(page, method, url, body) {
  return page.evaluate(async ({ method, url, body }) => {
    const init = { method, headers: { 'content-type': 'application/json' } };
    if (body !== undefined) init.body = JSON.stringify(body);
    const response = await fetch(url, init);
    return { status: response.status, json: await response.json().catch(() => null) };
  }, { method, url, body });
}

function project(id, size, name, updatedAt) {
  const keys = rasterize(id, size);
  const used = [...new Set(keys.filter(Boolean))];
  return {
    format: 'beadhue-project', version: 3, engineVersion: '2.0.0', boardProfile: '5mm-29', name, createdAt: updatedAt, updatedAt,
    paletteSelection: { palette: { kind: 'custom', colors: used.map((key) => ({ code: BEADS[key].code, hex: BEADS[key].hex })) }, kitTier: 0 },
    params: { targetWidth: size, targetColorCount: Math.max(2, used.length), dithering: false, mode: 'dominant', brightness: 0, contrast: 0, backgroundRemoval: false, bgTolerance: 8 },
    pattern: { width: size, height: size, cells: keys.map((key) => (key ? { hex: BEADS[key].hex, code: BEADS[key].code, transparent: false } : { hex: null, code: null, transparent: true })) },
  };
}

async function login(context) {
  const page = await context.newPage();
  await page.goto(BASE);
  await api(page, 'POST', '/api/auth/login', { email: 'e2e-user@example.com', password: 'E2e-pass-123!' });
  return page;
}

async function seed(browser) {
  const context = await browser.newContext();
  const page = await login(context);
  const list = await api(page, 'GET', '/api/designs');
  if ((list.json?.items ?? []).filter((item) => !item.deleted).length < 4) {
    const now = Date.now();
    for (const [index, id] of ['cat', 'rainbow', 'strawberry', 'panda'].entries()) {
      const name = motifTitle(id) ?? id;
      await api(page, 'PUT', `/api/designs/${crypto.randomUUID()}`, { name, project: project(id, [48, 58, 29, 36][index], name, new Date(now - index * 36e5).toISOString()), baseRevision: 0 });
    }
  }
  const palettes = await api(page, 'GET', '/api/palettes');
  if (!(palettes.json?.items ?? []).length) {
    await api(page, 'PUT', `/api/palettes/${crypto.randomUUID()}`, { name: '夏日水果', colors: Object.values(BEADS).slice(0, 18).map((bead) => ({ code: bead.code, hex: bead.hex })), baseRevision: 0 });
  }
  await context.storageState({ path: resolve(OUT, 'login-state.json') });
  await context.close();
}

// [名称, 路径, 动作]；动作：['click', 选择器] / ['fill', 选择器, 值]；guest 为游客；full 为整页。
const SCENES = [
  ['me-designs', '/me', []],
  ['me-card-menu', '/me', [['click', '[data-slot=design-card] button[aria-label$="的更多操作"]']]],
  ['me-rename', '/me', [['click', '[data-slot=design-card] button[aria-label$="的更多操作"]'], ['click', '[role=menuitem]:has-text("重命名"), button:has-text("重命名")']]],
  ['me-delete', '/me', [['click', '[data-slot=design-card] button[aria-label$="的更多操作"]'], ['click', '[role=menuitem]:has-text("删除"), [role=group] button:has-text("删除")']]],
  ['me-sort', '/me', [['click', 'button[aria-label^="排序："]']]],
  ['me-list', '/me?view=list', []],
  ['me-search-empty', '/me?q=兔子', []],
  ['me-stitching', '/me?status=stitching', []],
  ['me-guest', '/me', [], { guest: true }],
  ['me-public', '/me/public', [], { full: true }],
  ['me-likes', '/me/likes', []],
  ['me-palettes', '/me/palettes', [], { full: true }],
  ['me-palette-view', '/me/palettes', [['click', 'button[aria-label^="查看「MARD（豆色绘经典"]']]],
  ['me-palette-edit', '/me/palettes', [['click', 'button:has-text("新建色板")']]],
  ['me-settings', '/me/settings', [], { full: true }],
  ['me-password', '/me/settings', [['click', 'button:has-text("修改密码")'], ['fill', 'input[autocomplete=new-password] >> nth=0', 'abc'], ['click', '[role=dialog] button[type=submit]']]],
  ['me-delete-account', '/me/settings', [['click', 'section#danger button:has-text("注销账号")']]],
  ['palettes-public', '/palettes', [], { guest: true, full: true }],
];

const browser = await chromium.launch();
await seed(browser);
const problems = [];
for (const width of widths) {
  const mobile = width < 768;
  for (const [name, path, actions, options = {}] of SCENES) {
    if (only && !name.includes(only)) continue;
    const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, storageState: options.guest ? undefined : resolve(OUT, 'login-state.json') });
    await context.addCookies([{ name: 'beadhue_analytics_consent', value: 'denied', domain: new URL(BASE).hostname, path: '/' }]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${BASE}${path}`);
    await page.waitForFunction(() => document.documentElement.dataset.beadhueHydrated === 'true', undefined, { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(2500);
    for (const [kind, selector, value] of actions) {
      const node = page.locator(selector).first();
      if (!(await node.count())) { problems.push(`${width} ${name}: 找不到 ${selector}`); continue; }
      if (kind === 'click') await node.click({ timeout: 3000 }).catch(() => node.dispatchEvent('click'));
      if (kind === 'fill') await node.fill(value);
      await page.waitForTimeout(700);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) problems.push(`${width} ${name}: 横向溢出 ${overflow}px`);
    if (errors.length) problems.push(`${width} ${name}: ${errors.join(' | ')}`);
    await page.screenshot({ path: resolve(OUT, `${name}-${width}.png`), fullPage: Boolean(options.full) });
    console.log('shot', `${name}-${width}.png`);
    await context.close();
  }
}
await browser.close();
console.log(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : '无溢出、无页面报错');
