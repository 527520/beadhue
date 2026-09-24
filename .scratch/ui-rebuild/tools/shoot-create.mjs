// 票 07 视觉对照：创作入口、拖入态、新建图纸弹窗、空白画布弹窗；原型与实现同状态、五个宽度。
// 用法：node shoot-create.mjs proto|impl [状态…]；PROTO_BASE 默认 http://127.0.0.1:4181，IMPL_BASE 默认 http://127.0.0.1:3101。
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const side = process.argv[2] ?? 'impl';
const only = process.argv.slice(3);
const PROTO = process.env.PROTO_BASE ?? 'http://127.0.0.1:4181';
const IMPL = process.env.IMPL_BASE ?? 'http://127.0.0.1:3101';
const OUT = new URL('../evidence/impl/07/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const WIDTHS = [1440, 1024, 768, 390, 350];

const proto = (hash) => `${PROTO}/.scratch/ui-rebuild/prototype/index.html#${hash}`;
const STATES = {
  entry: { proto: proto('/create'), impl: `${IMPL}/app` },
  drag: { proto: proto('/create?drag=1'), impl: `${IMPL}/app?drag=1` },
  new: { proto: proto('/create?pick=w-cat'), impl: `${IMPL}/app`, open: 'sample' },
  blank: { proto: proto('/create?blank=1'), impl: `${IMPL}/app`, open: 'blank' },
};

const browser = await chromium.launch();
for (const [name, state] of Object.entries(STATES)) {
  if (only.length && !only.includes(name)) continue;
  for (const width of WIDTHS) {
    const mobile = width < 768;
    const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile });
    const page = await context.newPage();
    await page.goto(side === 'proto' ? state.proto : state.impl);
    await page.waitForTimeout(side === 'proto' ? 900 : 1800);
    if (side === 'impl') {
      const refuse = page.getByRole('button', { name: '不同意', exact: true });
      if (await refuse.count()) await refuse.click().catch(() => {});
      if (state.open === 'sample') {
        await page.getByRole('button', { name: '用示例「橘子小猫」新建图纸' }).click();
        await page.getByRole('dialog', { name: '新建图纸' }).waitFor();
        await page.waitForTimeout(1500);
      }
      if (state.open === 'blank') {
        await page.getByRole('button', { name: /从空白画布开始/ }).click();
        await page.getByRole('dialog', { name: '从空白画布开始' }).waitFor();
        await page.waitForTimeout(600);
      }
    } else if (state.open) await page.waitForTimeout(900);
    const full = !state.open;
    await page.screenshot({ path: `${OUT}${side}-${name}-${width}.png`, fullPage: full });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (overflow > 0) console.log(`横向溢出 ${side} ${name} ${width}: ${overflow}px`);
    await context.close();
  }
}
await browser.close();
