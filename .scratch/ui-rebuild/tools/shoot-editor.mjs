// 票 08 视觉对照：编辑器桌面编辑模式（原型与实现同状态），1440 / 1024（可加 768）。
// 用法：node shoot-editor.mjs proto|impl [状态…]；PROTO_BASE 默认 http://127.0.0.1:4181，IMPL_BASE 默认 http://127.0.0.1:3101。
// 实现侧先用示例「橘猫团子」按 48 宽、8 色生成一张图纸（与原型 d-cat 同尺寸），再进入各状态。
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const side = process.argv[2] ?? 'impl';
const only = process.argv.slice(3);
const PROTO = process.env.PROTO_BASE ?? 'http://127.0.0.1:4181';
const IMPL = process.env.IMPL_BASE ?? 'http://127.0.0.1:3101';
const OUT = new URL('../evidence/impl/08/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const WIDTHS = (process.env.WIDTHS ?? '1440,1024').split(',').map(Number);

const proto = (hash) => `${PROTO}/.scratch/ui-rebuild/prototype/index.html#${hash}`;
// 每个状态：原型路由 + 原型步骤；实现步骤（在已生成的编辑器里执行）。
const STATES = {
  editor: { proto: proto('/editor/d-cat'), steps: [] },
  export: { proto: proto('/editor/d-cat'), protoSteps: [['click', '[data-export]']], steps: [['role', 'button', '导出']] },
  share: { proto: proto('/editor/d-cat'), protoSteps: [['click', '[data-share]']], steps: [['role', 'button', '分享']] },
  more: { proto: proto('/editor/d-cat'), protoSteps: [['click', '[data-act="more"]']], steps: [['role', 'button', '更多']] },
  adjust: { proto: proto('/editor/d-cat?tab=adjust'), steps: [['role', 'tab', '调整']] },
  info: { proto: proto('/editor/d-cat?tab=info'), steps: [['role', 'tab', '信息']] },
  png: { proto: proto('/editor/d-cat'), protoSteps: [['click', '[data-export]'], ['click', '[data-act="export-png"]']], steps: [['role', 'button', '导出'], ['role', 'menuitem', '下载 PNG…']] },
  pdf: { proto: proto('/editor/d-cat'), protoSteps: [['click', '[data-export]'], ['click', '[data-act="export-pdf"]']], steps: [['role', 'button', '导出'], ['role', 'menuitem', '打印 PDF…']] },
  ref: { proto: proto('/editor/d-cat?ref=1'), steps: [['role', 'button', '打开原图参照']] },
  noorig: { proto: proto('/editor/d-heart?tab=adjust'), blank: true, steps: [['role', 'tab', '调整']] },
  missing: { proto: proto('/editor/d-heart'), protoSteps: [['click', '[data-act="ref-missing"]']], blank: true, steps: [['role', 'button', /原图/]] },
  brush: { proto: proto('/editor/d-cat'), protoSteps: [['click', '.ed-tools [data-tool="brush"]']], steps: [['role', 'button', '画笔'], ['role', 'button', '画笔']] },
  replace: { proto: proto('/editor/d-cat'), protoSteps: [['hover', '.ed-used-row:nth-child(2)'], ['click', '.ed-used-row:nth-child(2) [data-act="replace-color"]']], steps: [['hoverList', 1], ['replace', 1]] },
  publish: { proto: proto('/editor/d-cat'), protoSteps: [['click', '[data-share]'], ['click', '[data-act="publish"]']], steps: [['role', 'button', '分享'], ['role', 'menuitem', /公开到豆社/]] },
  shortcuts: { proto: proto('/editor/d-cat'), protoSteps: [['click', '[data-act="more"]'], ['click', '[data-act="shortcuts"]']], steps: [['role', 'button', '更多'], ['role', 'menuitem', /快捷键说明/]] },
  panel: { proto: proto('/editor/d-cat?panel=0'), steps: [['role', 'button', '收起右侧面板']] },
};

async function createImplDesign(page, blank) {
  await page.goto(`${IMPL}/app`);
  await page.waitForTimeout(1500);
  const refuse = page.getByRole('button', { name: '不同意', exact: true });
  if (await refuse.count()) await refuse.click().catch(() => {});
  if (blank) {
    await page.getByRole('button', { name: /从空白画布开始/ }).click();
    const dialog = page.getByRole('dialog', { name: '从空白画布开始' });
    await dialog.getByRole('button', { name: '自定义' }).click().catch(() => {});
    await dialog.getByRole('spinbutton', { name: '宽（格）' }).fill('24').catch(() => {});
    await dialog.getByRole('spinbutton', { name: '高（格）' }).fill('24').catch(() => {});
    await dialog.getByRole('button', { name: '创建画布' }).click();
  } else {
    await page.getByRole('button', { name: '用示例「橘猫团子」新建图纸' }).click();
    const dialog = page.getByRole('dialog', { name: '新建图纸' });
    await dialog.waitFor();
    await dialog.getByRole('button', { name: '自定义' }).click().catch(() => {});
    await dialog.getByRole('spinbutton', { name: '自定义宽度（格）' }).fill('48');
    await dialog.getByRole('slider').focus();
    for (let i = 0; i < 40; i += 1) await page.keyboard.press('ArrowLeft');
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowRight');
    await dialog.getByRole('button', { name: '生成图纸', exact: true }).click();
  }
  await page.waitForURL(/\/app\?id=/, { timeout: 40_000 });
  await page.getByLabel(/图纸编辑画布/).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1200);
}

async function runImplSteps(page, steps) {
  for (const step of steps) {
    const [kind, a, b] = step;
    if (kind === 'role') await page.getByRole(a, { name: b, exact: typeof b === 'string' }).first().click();
    if (kind === 'hoverList') await page.getByRole('list').first().locator('li').nth(a).hover();
    if (kind === 'replace') await page.getByRole('list').first().locator('li').nth(a).getByRole('button', { name: /^替换/ }).click();
    await page.waitForTimeout(450);
  }
}

const browser = await chromium.launch();
for (const [name, state] of Object.entries(STATES)) {
  if (only.length && !only.includes(name)) continue;
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    if (side === 'proto') await context.addInitScript(() => { sessionStorage.setItem('proto-consent', 'yes'); });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      if (side === 'proto') {
        await page.goto(state.proto);
        await page.waitForTimeout(900);
        for (const [kind, selector] of state.protoSteps ?? []) {
          if (kind === 'click') await page.locator(selector).first().click();
          if (kind === 'hover') await page.locator(selector).first().hover();
          await page.waitForTimeout(450);
        }
      } else {
        await createImplDesign(page, state.blank);
        await runImplSteps(page, state.steps);
      }
      await page.screenshot({ path: `${OUT}${side}-${name}-${width}.png` });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (overflow > 0) console.log(`横向溢出 ${side} ${name} ${width}: ${overflow}px`);
      console.log('shot', `${side}-${name}-${width}.png`);
    } catch (error) {
      console.log(`失败 ${side} ${name} ${width}: ${error.message.split('\n')[0]}`);
    }
    if (errors.length) console.log(`页面报错 ${side} ${name} ${width}: ${[...new Set(errors)].join(' | ')}`);
    await context.close();
  }
}
await browser.close();
