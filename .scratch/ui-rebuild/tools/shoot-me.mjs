// 「我的」页面场景截图：每个场景独立命名，并检查横向溢出与页面报错。
// 用法：node shoot-me.mjs [--w=1440,390] [--only=名称片段]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const widthArg = args.find((arg) => arg.startsWith('--w='));
const widths = widthArg ? widthArg.slice(4).split(',').map(Number) : [1440, 1024, 768, 390, 350];
const only = args.find((arg) => arg.startsWith('--only='))?.slice(7);
const OUT = resolve('.scratch/ui-rebuild/evidence/prototype');
mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:4180/.scratch/ui-rebuild/prototype/index.html';

// [名称, 路由, 动作列表]；动作：{ click } / { hover } / { fill: [选择器, 值] } / { guest: true } / { full: true }
const SCENES = [
  ['me-designs', '#/me', []],
  ['me-designs-hover', '#/me', [{ hover: '.design-card' }]],
  ['me-card-menu', '#/me', [{ click: '[data-card-menu]' }]],
  ['me-rename', '#/me', [{ click: '[data-card-menu]' }, { click: '[data-act="rename"]' }]],
  ['me-delete', '#/me', [{ click: '[data-card-menu]' }, { click: '[data-act="delete"]' }]],
  ['me-sort', '#/me', [{ click: '[data-sort-menu]:visible' }]],
  ['me-list', '#/me/designs?view=list', []],
  ['me-search-empty', '#/me/designs?q=兔子', []],
  ['me-stitching', '#/me/designs?status=stitching', []],
  ['me-empty', '#/me/designs?empty=1', []],
  ['me-storage', '#/me/designs?storage=full', []],
  ['me-guest', '#/me', [{ guest: true }]],
  ['me-public', '#/me/public', [{ full: true }]],
  ['me-likes', '#/me/likes', []],
  ['me-likes-empty', '#/me/likes?empty=1', []],
  ['me-palettes', '#/me/palettes', [{ full: true }]],
  ['me-palette-view', '#/me/palettes', [{ click: '[data-open-palette="mard-291"]' }]],
  ['me-palette-edit', '#/me/palettes', [{ click: '[data-new-palette]' }]],
  ['me-settings', '#/me/settings', [{ full: true }]],
  ['me-settings-full', '#/me/settings?storage=full&section=storage', []],
  ['me-password', '#/me/settings', [{ click: '[data-change-password]' }, { fill: ['#pw-next', 'abc'] }, { fill: ['#pw-confirm', 'abcd'] }, { click: '[data-submit]' }]],
  ['me-delete-account', '#/me/settings', [{ click: '[data-delete-account]' }]],
  ['author-official', '#/u/official', [{ full: true }]],
  ['author-lu', '#/u/lu', []],
];

const browser = await chromium.launch();
const errors = [];
const problems = [];
for (const width of widths) {
  const mobile = width < 768;
  for (const [name, route, actions] of SCENES) {
    if (only && !name.includes(only)) continue;
    const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
    const guest = actions.some((action) => action.guest);
    await context.addInitScript((g) => { sessionStorage.setItem('proto-consent', 'yes'); if (g) sessionStorage.setItem('proto-guest', '1'); }, guest);
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(`${width} ${name} ${error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`${width} ${name} console: ${message.text()}`); });
    await page.goto(`${BASE}${route}`);
    await page.waitForTimeout(800);
    for (const action of actions) {
      if (action.click) { const target = page.locator(action.click).first(); if (await target.count()) { await target.click(); await page.waitForTimeout(450); } else problems.push(`${width} ${name}: 找不到 ${action.click}`); }
      if (action.hover) { await page.locator(action.hover).first().hover(); await page.waitForTimeout(300); }
      if (action.fill) { await page.locator(action.fill[0]).fill(action.fill[1]); }
    }
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) problems.push(`${width} ${name}: 横向溢出 ${overflow}px`);
    const primaries = await page.evaluate(() => [...document.querySelectorAll('.btn-primary')].filter((node) => { const r = node.getBoundingClientRect(); return r.width && r.bottom > 0 && r.top < innerHeight && getComputedStyle(node).visibility !== 'hidden'; }).map((node) => node.textContent.trim()));
    const file = `${name}-${width}.png`;
    await page.screenshot({ path: resolve(OUT, file), fullPage: actions.some((action) => action.full) });
    console.log('shot', file, primaries.length > 1 ? `主按钮×${primaries.length}: ${primaries.join(' / ')}` : '');
    await context.close();
  }
}
await browser.close();
if (problems.length) console.log('PROBLEMS:\n' + problems.join('\n'));
if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].join('\n'));
else console.log('页面报错：0');
