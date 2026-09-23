// 评审页截图：node shoot-review.mjs <screenId...>（默认 discover），视口 1680×1050。
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';

const ids = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const old = process.argv.includes('--old');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
for (const id of ids.length ? ids : ['discover']) {
  await page.goto(`http://127.0.0.1:4180/.scratch/ui-rebuild/prototype/review.html#${id}`);
  await page.waitForTimeout(2200);
  if (old) { await page.locator('#show-old').check(); await page.waitForTimeout(400); }
  const path = resolve(`.scratch/ui-rebuild/evidence/prototype/review-${id}${old ? '-old' : ''}.png`);
  await page.screenshot({ path, fullPage: true });
  console.log('shot', path);
}
await browser.close();
if (errors.length) console.log('ERRORS', errors);
