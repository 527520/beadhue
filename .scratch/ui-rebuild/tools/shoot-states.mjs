// 带名字的状态截图：node shoot-states.mjs "名字|#/路由|宽度|点击选择器1;;点击选择器2|full|按键"
// 点击选择器可写 key:A 表示按键。输出到 evidence/prototype/，并打印页面报错与横向溢出。
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve('.scratch/ui-rebuild/evidence/prototype');
mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:4180/.scratch/ui-rebuild/prototype/index.html';
const jobs = process.argv.slice(2).map((arg) => { const [name, route, width, clicks = '', full = ''] = arg.split('|'); return { name, route, width: Number(width), clicks: clicks ? clicks.split(';;') : [], full: full === 'full' }; });
const browser = await chromium.launch();
const errors = [];
for (const job of jobs) {
  const mobile = job.width < 768;
  const context = await browser.newContext({ viewport: { width: job.width, height: mobile ? 844 : 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  await context.addInitScript(() => { sessionStorage.setItem('proto-consent', 'yes'); });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${job.name} ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`${job.name} console: ${message.text()}`); });
  await page.goto(`${BASE}${job.route}`);
  await page.waitForTimeout(800);
  for (const step of job.clicks) {
    if (step.startsWith('key:')) await page.keyboard.press(step.slice(4));
    else if (step.startsWith('hover:')) await page.locator(step.slice(6)).first().hover();
    else if (step.startsWith('type:')) { const [sel, text] = step.slice(5).split('='); await page.locator(sel).first().fill(text); }
    else { const target = page.locator(step).first(); if (await target.count()) await target.click(); else errors.push(`${job.name} 找不到 ${step}`); }
    await page.waitForTimeout(450);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) errors.push(`${job.name} 横向溢出 ${overflow}px`);
  await page.screenshot({ path: resolve(OUT, `${job.name}.png`), fullPage: job.full });
  console.log('shot', job.name);
  await context.close();
}
await browser.close();
if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].join('\n'));
