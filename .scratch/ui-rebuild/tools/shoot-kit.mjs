// 票 01 视觉对照：原型 #/components 与实现 /dev/ui 在同宽度下整页截图，输出到 evidence/impl/01/。
// 用法：node .scratch/ui-rebuild/tools/shoot-kit.mjs [--proto] [--impl] [--w=1440,1024,768,390,350] [--app=http://127.0.0.1:3100]
// 原型需先在仓库根目录运行 python3 -m http.server 4180；实现需先启动开发服务。
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const widthArg = args.find((arg) => arg.startsWith('--w='));
const widths = widthArg ? widthArg.slice(4).split(',').map(Number) : [1440, 1024, 768, 390, 350];
const appArg = args.find((arg) => arg.startsWith('--app='));
const APP = appArg ? appArg.slice(6) : 'http://127.0.0.1:3100';
const both = !args.includes('--proto') && !args.includes('--impl');
const targets = [];
if (both || args.includes('--proto')) targets.push(['proto', 'http://127.0.0.1:4180/.scratch/ui-rebuild/prototype/index.html#/components']);
if (both || args.includes('--impl')) targets.push(['impl', `${APP}/dev/ui`]);
const OUT = resolve('.scratch/ui-rebuild/evidence/impl/01');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];
for (const width of widths) {
  const mobile = width < 768;
  for (const [name, url] of targets) {
    const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
    await context.addInitScript(() => { try { sessionStorage.setItem('proto-consent', 'yes'); } catch {} });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(`${name} ${width} ${error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`${name} ${width} console: ${message.text()}`); });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    // 原型右下角的评审工具条不属于组件，截图前隐藏。
    await page.addStyleTag({ content: '.proto-tool{display:none!important}' }).catch(() => {});
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    // 各区块在整页截图中的位置（两边都用 data-kit-sec 标记），供 compare-kit.py 逐块并排。
    const sections = await page.evaluate(() => [...document.querySelectorAll('[data-kit-sec]')].map((node) => {
      const rect = node.getBoundingClientRect();
      return { id: node.dataset.kitSec, top: Math.round(rect.top + window.scrollY), height: Math.round(rect.height) };
    }));
    const head = await page.evaluate(() => { const node = document.querySelector('[data-kit-sec]'); return node ? Math.round(node.getBoundingClientRect().top + window.scrollY) : 0; });
    writeFileSync(resolve(OUT, `${name}-${width}.json`), JSON.stringify({ width, dpr: mobile ? 2 : 1, head, sections }, null, 1));
    await page.screenshot({ path: resolve(OUT, `${name}-${width}.png`), fullPage: true });
    console.log(`${name} ${width} overflow=${overflow} sections=${sections.length}`);
    await context.close();
  }
}
await browser.close();
if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].join('\n'));
