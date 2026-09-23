// 最终验收：关键屏 × 桌面 1440 / 手机 390 截图，并检查报错、横向溢出、视区内可见主按钮数量。
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve('.scratch/ui-rebuild/evidence/prototype-final');
mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:4180/.scratch/ui-rebuild/prototype/index.html';
const SCREENS = [
  ['01-discover', '#/'],
  ['02-search', '#/search?q=猫'],
  ['03-search-empty', '#/search?q=恐龙'],
  ['04-filter', '#/?cat=动物', ['[data-open-filter]']],
  ['05-detail', '#/works/w-cat'],
  ['06-detail-guest', '#/works/w-star', [], true],
  ['07-create', '#/create'],
  ['08-create-new', '#/create?pick=w-cat'],
  ['09-editor', '#/editor/d-cat'],
  ['10-editor-export', '#/editor/d-cat', ['[data-export]']],
  ['11-editor-noorig', '#/editor/d-heart?tab=adjust'],
  ['12-stitch', '#/editor/d-rainbow?mode=stitch'],
  ['13-me', '#/me'],
  ['14-me-empty', '#/me/designs?empty=1'],
  ['15-me-palettes', '#/me/palettes'],
  ['16-me-settings', '#/me/settings'],
  ['17-author', '#/u/official'],
  ['18-login', '#/', ['[data-login]', '[data-login-form] button[type="submit"]'], true],
  ['19-admin', '#/admin'],
  ['20-admin-works', '#/admin/works', ['[data-row]']],
  ['21-admin-reviews', '#/admin/reviews'],
  ['22-components', '#/components'],
];

const browser = await chromium.launch();
const report = [];
for (const width of [1440, 390]) {
  const mobile = width < 768;
  for (const [name, route, clicks = [], guest = false] of SCREENS) {
    const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
    await context.addInitScript((isGuest) => { sessionStorage.setItem('proto-consent', 'yes'); sessionStorage.setItem('proto-intro-closed', '1'); sessionStorage.setItem('proto-guest', isGuest ? '1' : '0'); }, guest);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${BASE}${route}`);
    await page.waitForTimeout(1100);
    for (const selector of clicks) {
      const target = page.locator(selector).first();
      if (await target.count()) { await target.click({ trial: false }).catch(() => target.dispatchEvent('click')); await page.waitForTimeout(550); }
    }
    const checks = await page.evaluate(() => {
      const overflow = document.documentElement.scrollWidth - window.innerWidth;
      const visible = (node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight && style.visibility !== 'hidden' && style.display !== 'none' && !node.closest('[hidden]');
      };
      const overlay = document.querySelector('.overlay, .popover');
      const scope = overlay ?? document;
      const primaries = [...scope.querySelectorAll('.btn-primary')].filter(visible).map((node) => node.textContent.trim().slice(0, 12));
      return { overflow, primaries };
    });
    await page.screenshot({ path: resolve(OUT, `${name}-${width}.png`) });
    report.push({ name, width, errors, ...checks });
    await context.close();
  }
}
await browser.close();
writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
for (const item of report) {
  const flags = [];
  if (item.errors.length) flags.push(`errors=${item.errors.length}: ${item.errors[0].slice(0, 90)}`);
  if (item.overflow > 0) flags.push(`overflow=${item.overflow}px`);
  if (item.primaries.length > 1) flags.push(`primaries=${item.primaries.length} [${item.primaries.join(' | ')}]`);
  console.log(`${item.name.padEnd(18)} ${String(item.width).padEnd(5)} ${flags.length ? flags.join('; ') : 'ok'}`);
}
