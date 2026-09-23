// 现状走查截图：对本地种子库补样例作品后，按桌面 1440 / 手机 390 逐页逐状态截图。
// 用法：先以 DOUPU_E2E_SEED=1 在 3100 端口启动 dev（见 README），再 node .scratch/ui-rebuild/tools/capture-current.mjs [only...]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { BEADS, MOTIF_IDS, motifTitle, rasterize } from '../prototype/motifs.js';

const BASE = 'http://127.0.0.1:3100';
const OUT = resolve('.scratch/ui-rebuild/evidence/current');
const PASSWORD = 'E2e-pass-123!';
const ONLY = new Set(process.argv.slice(2));
mkdirSync(OUT, { recursive: true });

const log = (...args) => console.log('[capture]', ...args);
const want = (key) => ONLY.size === 0 || ONLY.has(key);

async function api(page, method, url, body, headers = {}) {
  return page.evaluate(async ({ method, url, body, headers }) => {
    const init = { method, headers: { ...headers } };
    if (body !== undefined) {
      if (body && body.__bytes) {
        init.body = Uint8Array.from(atob(body.__bytes), (c) => c.charCodeAt(0));
        init.headers['content-type'] = body.type;
      } else {
        init.body = JSON.stringify(body);
        init.headers['content-type'] = 'application/json';
      }
    }
    if (method !== 'GET') init.headers['idempotency-key'] = crypto.randomUUID();
    const response = await fetch(url, init);
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* 非 JSON */ }
    return { status: response.status, json, text: text.slice(0, 400) };
  }, { method, url, body, headers });
}

async function waitHydrated(page) {
  await page.waitForFunction(() => document.readyState === 'complete');
  await page.waitForFunction(() => {
    const data = document.documentElement.dataset;
    return data.beadhueHydrated === 'true' || data.doupuHydrated === 'true';
  }, undefined, { timeout: 30_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

async function settle(page, ms = 450) {
  await page.waitForTimeout(ms);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
}

async function login(page, email, next = '/') {
  await page.goto(`${BASE}/login?next=${encodeURIComponent(next)}`);
  await waitHydrated(page);
  await page.getByLabel('邮箱').first().fill(email);
  await page.getByLabel('密码').first().fill(PASSWORD);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL((url) => new URL(url).pathname === next, { timeout: 30_000 });
  await waitHydrated(page);
}

async function dismissConsent(page) {
  const reject = page.getByRole('button', { name: '拒绝', exact: true });
  if (await reject.count()) await reject.first().click().catch(() => {});
}

let shotCount = 0;
async function shot(page, name, { fullPage = true, locator = null } = {}) {
  await settle(page);
  const path = resolve(OUT, `${name}.png`);
  if (locator) await locator.screenshot({ path });
  else await page.screenshot({ path, fullPage });
  shotCount += 1;
  log('shot', name);
}

async function step(name, fn) {
  try { await fn(); } catch (error) { log('FAILED', name, String(error).split('\n')[0]); }
}

function toSnapshot(id, size, base) {
  const keys = rasterize(id, size);
  const used = [...new Set(keys.filter(Boolean))];
  return {
    version: 1,
    engineVersion: base.engineVersion,
    boardProfile: '5mm-29',
    paletteSelection: { palette: { kind: 'custom', colors: used.map((key) => ({ code: BEADS[key].code, hex: BEADS[key].hex })) }, kitTier: 0 },
    params: { ...base.params, targetWidth: size, targetColorCount: Math.max(2, used.length) },
    pattern: { width: size, height: size, cells: keys.map((key) => key ? { hex: BEADS[key].hex, code: BEADS[key].code, transparent: false } : { hex: null, code: null, transparent: true }) },
  };
}

const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAgAB/wdYqHkAAAAASUVORK5CYII=';

async function seed(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(BASE);
  const listed = await api(page, 'GET', '/api/community/works?sort=latest');
  if ((listed.json?.items?.length ?? 0) >= 8) { log('seed: already seeded'); await context.close(); return; }
  await login(page, 'e2e-admin@example.com', '/admin');
  const seedWork = listed.json.items[0];
  const detail = await api(page, 'GET', `/api/community/works/${seedWork.id}`);
  const base = detail.json.snapshot;
  const motifs = MOTIF_IDS;
  const batch = await api(page, 'POST', '/api/admin/batches', { itemCount: motifs.length, defaultParams: base.params, engineVersion: base.engineVersion, reason: '界面走查样例作品' });
  if (batch.status >= 300) throw new Error(`batch ${batch.status} ${batch.text}`);
  const revisionIds = [];
  for (const [index, id] of motifs.entries()) {
    const size = [29, 29, 32, 24, 29, 32, 36, 29, 29, 32, 29, 32][index % 12];
    const draft = await api(page, 'POST', `/api/admin/batches/${batch.json.id}/drafts`, { title: motifTitle(id), snapshot: toSnapshot(id, size, base), reason: '界面走查样例作品' });
    if (draft.status >= 300) { log('draft failed', id, draft.status, draft.text); continue; }
    const original = await api(page, 'PUT', `/api/community/revisions/${draft.json.revisionId}/original`, { __bytes: TINY_PNG, type: 'image/png' });
    if (original.status >= 300) log('original failed', id, original.status, original.text);
    revisionIds.push(draft.json.revisionId);
  }
  const current = await api(page, 'GET', '/api/admin/batches');
  const version = current.json?.items?.find((item) => item.id === batch.json.id)?.version ?? batch.json.version;
  const published = await api(page, 'POST', `/api/admin/batches/${batch.json.id}/publish`, { revisionIds, expectedVersion: version, reason: '界面走查样例作品' });
  log('publish', published.status, published.status >= 300 ? published.text : '');

  const works = await api(page, 'GET', '/api/admin/community/works?size=50');
  const tagPlan = { 草莓小甜心: ['水果', '可爱'], 夏日西瓜: ['水果', '夏天'], 橘猫团子: ['动物', '猫咪'], 熊猫滚滚: ['动物'], 呱呱青蛙: ['动物'], 小黄鸡: ['动物', '可爱'], 星星人: ['星星人', '可爱'], 云朵彩虹: ['天气'], 春日樱花: ['花草', '春天'], 双球冰淇淋: ['甜品', '夏天'], 红伞蘑菇: ['植物'] };
  for (const item of works.json?.items ?? []) {
    const title = item.title ?? item.currentTitle ?? item.revision?.title;
    const tags = tagPlan[title];
    if (!tags) continue;
    const result = await api(page, 'PUT', `/api/admin/community/works/${item.id}/tags`, { expectedVersion: item.version ?? item.workVersion ?? 1, tags });
    if (result.status >= 300) log('tag failed', title, result.status, result.text);
  }
  await context.close();

  const userContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const userPage = await userContext.newPage();
  await login(userPage, 'e2e-user@example.com', '/designs');
  const publicWorks = (await api(userPage, 'GET', '/api/community/works?sort=latest')).json?.items ?? [];
  for (const work of publicWorks.slice(0, 7)) await api(userPage, 'PUT', `/api/community/works/${work.id}/like`);
  const now = new Date();
  for (const [index, id] of ['cat', 'sakura', 'panda', 'icecream'].entries()) {
    const size = [48, 40, 36, 44][index];
    const snapshot = toSnapshot(id, size, base);
    const project = {
      format: 'beadhue-project', version: 3, engineVersion: base.engineVersion, boardProfile: '5mm-29', name: `${motifTitle(id)} · 草稿`,
      createdAt: new Date(now.getTime() - (index + 1) * 36e5).toISOString(), updatedAt: new Date(now.getTime() - index * 18e5).toISOString(),
      paletteSelection: snapshot.paletteSelection, params: snapshot.params, pattern: snapshot.pattern,
    };
    const result = await api(userPage, 'PUT', `/api/designs/${crypto.randomUUID()}`, { name: project.name, project, baseRevision: 0 });
    if (result.status >= 300) log('design failed', id, result.status, result.text);
  }
  await userContext.close();
  log('seed: done');
}

async function renderPhoto(browser) {
  const path = resolve(OUT, '../photo-cat.png');
  if (existsSync(path)) return path;
  const svg = execSync('git show feat/beadhue-redesign:.scratch/beadhue-redesign/prototype/assets/cat.svg', { encoding: 'utf8' });
  const page = await browser.newPage({ viewport: { width: 720, height: 720 } });
  await page.setContent(`<html><body style="margin:0;background:linear-gradient(160deg,#e9f1f7,#f7efe6)">${svg.replace('<svg ', '<svg width="720" height="720" ')}</body></html>`);
  await page.screenshot({ path });
  await page.close();
  return path;
}

async function capture(browser, device) {
  const mobile = device === 'mobile';
  const contextOptions = mobile
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
  const tag = mobile ? '390' : '1440';
  const photo = await renderPhoto(browser);

  // ---- 匿名访客 ----
  const anon = await browser.newContext(contextOptions);
  const page = await anon.newPage();
  const works = (await (await fetch(`${BASE}/api/community/works?sort=latest`)).json()).items;
  const featured = works.find((item) => item.title === '橘猫团子') ?? works[0];

  if (want('home')) await step('home', async () => {
    await page.goto(BASE); await waitHydrated(page);
    await shot(page, `a01-home-first-visit-${tag}`, { fullPage: false });
    await dismissConsent(page);
    await shot(page, `a02-home-full-${tag}`);
  });
  if (want('community')) await step('community', async () => {
    await page.goto(`${BASE}/community`); await waitHydrated(page); await dismissConsent(page);
    await shot(page, `a03-community-${tag}`);
    await page.goto(`${BASE}/community?q=${encodeURIComponent('不存在的作品名')}`); await waitHydrated(page);
    await shot(page, `a04-community-empty-search-${tag}`);
    await page.goto(`${BASE}/community`); await waitHydrated(page);
    const search = page.getByRole('searchbox').first();
    if (await search.count()) { await search.click(); await search.fill('猫'); await shot(page, `a05-community-search-focus-${tag}`, { fullPage: false }); }
    const filterButton = page.getByRole('button', { name: /筛选|更多筛选|高级/ }).first();
    if (await filterButton.count()) { await filterButton.click(); await shot(page, `a06-community-filters-open-${tag}`, { fullPage: false }); await page.keyboard.press('Escape'); }
    const sort = page.getByRole('button', { name: /排序/ }).first();
    if (await sort.count()) { await sort.click(); await shot(page, `a07-community-sort-open-${tag}`, { fullPage: false }); await page.keyboard.press('Escape'); }
    const tagFilter = page.getByRole('combobox', { name: '按标签筛选' });
    if (await tagFilter.count()) { await tagFilter.click(); await shot(page, `a08-community-tag-filter-open-${tag}`, { fullPage: false }); await page.keyboard.press('Escape'); }
  });
  if (want('detail')) await step('detail-anon', async () => {
    await page.goto(`${BASE}/community/${featured.id}`); await waitHydrated(page); await dismissConsent(page);
    await shot(page, `a09-detail-anonymous-${tag}`);
  });
  if (want('app')) await step('app-anon', async () => {
    await page.goto(`${BASE}/app`); await waitHydrated(page); await dismissConsent(page);
    await shot(page, `a10-create-entry-${tag}`);
  });
  if (want('palettes')) await step('palettes', async () => {
    await page.goto(`${BASE}/palettes`); await waitHydrated(page);
    await shot(page, `a11-palettes-${tag}`);
  });
  if (want('auth')) await step('auth', async () => {
    await page.goto(`${BASE}/login`); await waitHydrated(page);
    await shot(page, `a12-login-${tag}`);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await shot(page, `a13-login-validation-${tag}`, { fullPage: false });
    await page.goto(`${BASE}/register`); await waitHydrated(page);
    await shot(page, `a14-register-${tag}`);
  });
  if (want('help')) await step('help', async () => {
    await page.goto(`${BASE}/help`); await waitHydrated(page);
    await shot(page, `a15-help-${tag}`);
  });
  if (want('upload')) await step('upload-flow', async () => {
    await page.goto(`${BASE}/app`); await waitHydrated(page);
    await page.locator('input[type=file]').first().setInputFiles(photo);
    await settle(page, 3000);
    await shot(page, `a16-create-after-pick-${tag}`, { fullPage: false });
    const generate = page.getByRole('button', { name: /生成图纸|开始生成|确认裁剪|生成/ }).first();
    if (await generate.count() && await generate.isVisible()) await generate.click();
    await page.locator('canvas').first().waitFor({ timeout: 60_000 });
    await settle(page, 4000);
    await shot(page, `a17-create-generated-${tag}`, { fullPage: false });
    const reference = page.getByRole('button', { name: /原图参照/ }).first();
    if (await reference.count() && await reference.isVisible()) { await reference.click(); await settle(page, 800); await shot(page, `a18-reference-toggled-${tag}`, { fullPage: false }); }
  });
  if (want('overflow')) await step('overflow', async () => {
    await page.goto(`${BASE}/community`); await waitHydrated(page);
    const more = page.getByRole('button', { name: '更多入口' }).first();
    if (await more.count()) { await more.click(); await shot(page, `a19-header-overflow-open-${tag}`, { fullPage: false }); await page.keyboard.press('Escape'); }
  });
  await anon.close();

  // ---- 普通用户 ----
  const user = await browser.newContext(contextOptions);
  const upage = await user.newPage();
  await login(upage, 'e2e-user@example.com', '/designs');
  await dismissConsent(upage);
  if (want('designs')) await step('designs', async () => {
    await upage.goto(`${BASE}/designs`); await waitHydrated(upage); await settle(upage, 1500);
    await shot(upage, `u01-my-designs-${tag}`);
  });
  if (want('detail')) await step('detail-user', async () => {
    await upage.goto(`${BASE}/community/${featured.id}`); await waitHydrated(upage); await settle(upage, 1200);
    await shot(upage, `u02-detail-signed-in-${tag}`);
  });
  if (want('mine')) await step('mine', async () => {
    await upage.goto(`${BASE}/community/mine`); await waitHydrated(upage);
    await shot(upage, `u03-my-submissions-${tag}`);
    await upage.goto(`${BASE}/community/submit`); await waitHydrated(upage);
    await shot(upage, `u04-submit-${tag}`);
  });
  if (want('account')) await step('account', async () => {
    await upage.goto(`${BASE}/account`); await waitHydrated(upage);
    await shot(upage, `u05-account-${tag}`);
  });
  if (want('editor')) await step('editor', async () => {
    const list = await api(upage, 'GET', '/api/designs');
    const items = list.json?.items ?? list.json?.designs ?? [];
    const target = items.find((item) => String(item.name).includes('冰淇淋')) ?? items[0];
    await upage.goto(`${BASE}/app?id=${encodeURIComponent(target.id)}&mode=edit`);
    await waitHydrated(upage); await settle(upage, 2500);
    await shot(upage, `u06-editor-${tag}`, { fullPage: !mobile });
    const preview = upage.getByRole('tab', { name: '预览' }).first();
    if (await preview.count() && await preview.isVisible()) { await preview.click(); await shot(upage, `u07-editor-preview-tab-${tag}`, { fullPage: !mobile }); }
    const stitch = upage.getByRole('tab', { name: '跟拼' }).first();
    if (await stitch.count() && await stitch.isVisible()) { await stitch.click(); await settle(upage, 1200); await shot(upage, `u08-stitch-${tag}`, { fullPage: !mobile }); }
    const exportButton = upage.getByRole('button', { name: /导出|下载 PNG/ }).first();
    if (await exportButton.count() && await exportButton.isVisible()) { await exportButton.click(); await shot(upage, `u09-export-open-${tag}`, { fullPage: false }); await upage.keyboard.press('Escape'); }
    const publish = upage.getByRole('button', { name: /公开|发布到豆社|投稿/ }).first();
    if (await publish.count() && await publish.isVisible()) { await publish.click(); await shot(upage, `u10-publish-open-${tag}`, { fullPage: false }); await upage.keyboard.press('Escape'); }
    const share = upage.getByRole('button', { name: /分享/ }).first();
    if (await share.count() && await share.isVisible()) { await share.click(); await shot(upage, `u11-share-open-${tag}`, { fullPage: false }); await upage.keyboard.press('Escape'); }
  });
  await user.close();

  // ---- 空状态账号（版主：没有设计也没有投稿）----
  if (want('empty')) await step('empty', async () => {
    const empty = await browser.newContext(contextOptions);
    const epage = await empty.newPage();
    await login(epage, 'e2e-moderator@example.com', '/designs');
    await dismissConsent(epage);
    await settle(epage, 1500);
    await shot(epage, `e01-my-designs-empty-${tag}`);
    await epage.goto(`${BASE}/community/mine`); await waitHydrated(epage);
    await shot(epage, `e02-my-submissions-empty-${tag}`);
    await empty.close();
  });

  // ---- 管理后台 ----
  if (want('admin')) await step('admin', async () => {
    const admin = await browser.newContext(contextOptions);
    const apage = await admin.newPage();
    await login(apage, 'e2e-admin@example.com', '/admin');
    const routes = mobile ? ['/admin', '/admin/reviews', '/admin/works'] : ['/admin', '/admin/reviews', '/admin/works', '/admin/batches', '/admin/users', '/admin/tags', '/admin/comments', '/admin/analytics', '/admin/logs', '/admin/system'];
    for (const route of routes) {
      await step(route, async () => {
        await apage.goto(`${BASE}${route}`); await waitHydrated(apage); await settle(apage, 1200);
        await shot(apage, `m-${route.slice(1).replace(/\//g, '-') || 'admin'}-${tag}`);
      });
    }
    await admin.close();
  });
}

const browser = await chromium.launch();
try {
  if (want('seed') || ONLY.size === 0) await seed(browser);
  for (const device of ['desktop', 'mobile']) {
    if (ONLY.has('desktop-only') && device === 'mobile') continue;
    await capture(browser, device);
  }
} finally {
  await browser.close();
}
writeFileSync(resolve(OUT, '_index.txt'), `captured ${shotCount} shots at ${new Date().toISOString()}\n`);
log('done', shotCount);
