// 原型截图：node shoot-prototype.mjs [--full] [--w=1440,390] "#/" "#/works/w-cat" ...
// 需先在仓库根目录运行 python3 -m http.server 4180。输出到 evidence/prototype/。
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const full = args.includes('--full');
const widthArg = args.find((arg) => arg.startsWith('--w='));
const widths = widthArg ? widthArg.slice(4).split(',').map(Number) : [1440, 390];
const actionArg = args.find((arg) => arg.startsWith('--click='));
const routes = args.filter((arg) => arg.startsWith('#'));
const OUT = resolve('.scratch/ui-rebuild/evidence/prototype');
mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:4180/.scratch/ui-rebuild/prototype/index.html';

const browser = await chromium.launch();
const errors = [];
for (const width of widths) {
  const mobile = width < 768;
  const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  await context.addInitScript(() => { sessionStorage.setItem('proto-consent', 'yes'); });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${width} ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`${width} console: ${message.text()}`); });
  for (const route of routes) {
    await page.goto(`${BASE}${route}`);
    await page.waitForTimeout(900);
    if (actionArg) {
      for (const selector of actionArg.slice(8).split('|')) {
        const target = page.locator(selector).first();
        if (await target.count()) { await target.click(); await page.waitForTimeout(500); }
      }
    }
    const name = `${route.replace(/[#/?=&]+/g, '-').replace(/^-|-$/g, '') || 'home'}${actionArg ? '-state' : ''}-${width}.png`;
    await page.screenshot({ path: resolve(OUT, name), fullPage: full });
    console.log('shot', name);
  }
  await context.close();
}
await browser.close();
if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].join('\n'));
