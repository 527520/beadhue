// 票 09 视觉对照（实现侧）：跟拼模式与手机编辑器，文件名对应原型的 evidence/prototype/ce-<状态>-<宽>.png。
// 用法：node shoot-09.mjs [状态…]；IMPL_BASE 默认 http://127.0.0.1:3101。
// 先用示例「橘猫团子」按 58 宽、8 色生成一张图纸（与原型 d-rainbow 同为 2×2 块板），跟拼状态再连点「完成本行」造出进度。
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const IMPL = process.env.IMPL_BASE ?? 'http://127.0.0.1:3101';
const OUT = new URL('../evidence/impl/09/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);

const more = ['role', 'button', '更多'];
const STATES = {
  stitch: { widths: [1440, 1024, 768, 390, 350], stitch: true, steps: [] },
  'stitch-more': { widths: [1440], stitch: true, steps: [more] },
  editor: { widths: [768, 390, 350], steps: [] },
  'm-colors': { widths: [390, 350], steps: [['role', 'button', /^当前色 .*打开颜色$/]] },
  'm-more': { widths: [390], steps: [more] },
  'm-adjust': { widths: [390], steps: [more, ['role', 'button', '调整']] },
  'm-info': { widths: [390], steps: [more, ['role', 'button', '信息与采购清单']] },
  'm-export': { widths: [390], steps: [more, ['role', 'button', '导出']] },
  'm-ref': { widths: [390, 350], steps: [['role', 'button', '打开原图参照']] },
  'm-brush': { widths: [390], steps: [['role', 'button', '画笔']] },
  'm-publish': { widths: [390], steps: [more, ['role', 'button', /^公开到豆社/]] },
  'm-stitch-sheet': { widths: [390], stitch: true, steps: [['capsule']] },
  'm-recrop': { widths: [390], steps: [more, ['role', 'button', '调整'], ['role', 'button', '重新裁剪']] },
  recrop: { widths: [1440], steps: [['role', 'tab', '调整'], ['role', 'button', '重新裁剪']] },
};

async function createDesign(page) {
  await page.goto(`${IMPL}/app`);
  await page.waitForTimeout(1500);
  const refuse = page.getByRole('button', { name: '不同意', exact: true });
  if (await refuse.count()) await refuse.click().catch(() => {});
  await page.getByRole('button', { name: '用示例「橘猫团子」新建图纸' }).click();
  const dialog = page.getByRole('dialog', { name: '新建图纸' });
  await dialog.waitFor();
  await dialog.getByRole('button', { name: /^2 板/ }).click();
  await dialog.getByRole('slider').focus();
  for (let i = 0; i < 40; i += 1) await page.keyboard.press('ArrowLeft');
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowRight');
  await dialog.getByRole('button', { name: '生成图纸', exact: true }).click();
  await page.waitForURL(/\/app\?id=/, { timeout: 40_000 });
  await page.getByLabel(/图纸编辑画布/).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1200);
}

async function enterStitch(page) {
  await page.getByRole('group', { name: '模式' }).getByRole('button', { name: '跟拼', exact: true }).click();
  await page.waitForTimeout(400);
  const complete = page.getByRole('button', { name: '完成本行', exact: true }).first();
  for (let i = 0; i < 34; i += 1) await complete.click();
  await page.waitForTimeout(600);
}

const browser = await chromium.launch();
for (const [name, state] of Object.entries(STATES)) {
  if (only.length && !only.includes(name)) continue;
  for (const width of state.widths) {
    const mobile = width < 768;
    const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await createDesign(page);
      if (state.stitch) await enterStitch(page);
      for (const [kind, a, b] of state.steps) {
        if (kind === 'role') await page.getByRole(a, { name: b, exact: typeof b === 'string' }).first().click();
        if (kind === 'capsule') await page.locator('button[aria-haspopup="dialog"]', { hasText: '%' }).first().click();
        await page.waitForTimeout(500);
      }
      await page.screenshot({ path: `${OUT}impl-${name}-${width}.png` });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (overflow > 0) console.log(`横向溢出 ${name} ${width}: ${overflow}px`);
      console.log('shot', `impl-${name}-${width}.png`);
    } catch (error) {
      console.log(`失败 ${name} ${width}: ${error.message.split('\n')[0]}`);
      await page.screenshot({ path: `${OUT}impl-${name}-${width}-failed.png` }).catch(() => {});
    }
    if (errors.length) console.log(`页面报错 ${name} ${width}: ${[...new Set(errors)].join(' | ')}`);
    await context.close();
  }
}
await browser.close();
