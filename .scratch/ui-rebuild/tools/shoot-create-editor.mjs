// 创作入口与编辑器的状态截图：node shoot-create-editor.mjs [名称过滤]
// 输出到 evidence/prototype/ce-<名称>-<宽>.png，并打印页面报错与横向溢出。
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve('.scratch/ui-rebuild/evidence/prototype');
mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:4180/.scratch/ui-rebuild/prototype/index.html';
const D = [1440, 1024, 768];
const MOB = [390, 350];
const ALL = [...D, ...MOB];

const S = [
  ['create', '#/create', ALL, []],
  ['create-drag', '#/create?drag=1', [1440, 390], []],
  ['create-new', '#/create', [1440, 1024, 768, 390, 350], [{ click: '[data-sample]' }, { wait: 700 }]],
  ['create-new-board', '#/create', [1440, 390], [{ click: '[data-sample]' }, { click: '[data-ratio="board"]' }, { click: '[data-cr-width="87"]' }]],
  ['create-new-palette', '#/create', [1440], [{ click: '[data-sample]' }, { click: '[data-cr-pick="palette"]' }]],
  ['create-blank', '#/create', [1440, 390], [{ click: '[data-blank]' }]],
  ['editor', '#/editor/d-cat', ALL, []],
  ['editor-export', '#/editor/d-cat', [1440, 768], [{ click: '[data-export]' }]],
  ['editor-share', '#/editor/d-cat', [1440], [{ click: '[data-share]' }]],
  ['editor-more', '#/editor/d-cat', [1440], [{ click: '[data-act="more"]' }]],
  ['editor-publish', '#/editor/d-cat', [1440], [{ click: '[data-share]' }, { click: '[data-act="publish"]' }]],
  ['m-publish', '#/editor/d-cat', [390], [{ click: '[data-act="more"]' }, { click: '.dialog [data-act="publish"]' }]],
  ['editor-png', '#/editor/d-cat', [1440], [{ click: '[data-export]' }, { click: '[data-act="export-png"]' }]],
  ['editor-adjust', '#/editor/d-cat?tab=adjust', [1440, 1024], []],
  ['editor-adjust-adv', '#/editor/d-cat?tab=adjust', [1440], [{ click: '[data-act="advanced"]' }, { eval: () => { document.querySelector('[data-panel-body]').scrollTop = 400; } }]],
  ['editor-info', '#/editor/d-cat?tab=info', [1440], []],
  ['editor-hover', '#/editor/d-cat', [1440], [{ hover: [0.5, 0.55] }]],
  ['editor-ref', '#/editor/d-cat?ref=1', [1440, 1024], [{ click: '[data-act="zoom-in"]' }, { click: '[data-act="zoom-in"]' }]],
  ['editor-replace', '#/editor/d-cat', [1440], [{ hoverSel: '.ed-used-row:nth-child(2)' }, { click: '.ed-used-row:nth-child(2) [data-act="replace-color"]' }]],
  ['editor-highlight', '#/editor/d-cat', [1440], [{ hoverSel: '.ed-used-row:nth-child(3)' }, { click: '.ed-used-row:nth-child(3) [data-act="highlight"]' }, { hover: [0.05, 0.05] }]],
  ['noorig', '#/editor/d-heart', [1440, 390], []],
  ['noorig-adjust', '#/editor/d-heart?tab=adjust', [1440], []],
  ['noorig-missing', '#/editor/d-heart', [1440, 390], [{ click: '[data-act="ref-missing"]' }]],
  ['reuse', '#/editor/w-star', [1440], [{ click: '[data-share]' }]],
  ['blank', '#/editor/new-blank', [1440, 390], []],
  ['stitch', '#/editor/d-rainbow?mode=stitch', ALL, []],
  ['stitch-cat', '#/editor/d-cat?mode=stitch', [1440], []],
  ['stitch-more', '#/editor/d-rainbow?mode=stitch', [1440], [{ click: '[data-act="more"]' }]],
  ['m-colors', '#/editor/d-cat', [390, 350], [{ click: '.ed-mcolor' }]],
  ['m-more', '#/editor/d-cat', [390], [{ click: '[data-act="more"]' }]],
  ['m-adjust', '#/editor/d-cat?sheet=adjust', [390], []],
  ['m-info', '#/editor/d-cat?sheet=info', [390], []],
  ['m-ref', '#/editor/d-cat?ref=1', [390, 350], []],
  ['m-stitch-sheet', '#/editor/d-rainbow?mode=stitch', [390], [{ click: '.ed-mprog' }]],
  ['m-brush', '#/editor/d-cat', [390], [{ click: '.ed-mbar [data-tool="brush"]' }]],
];

const filter = process.argv[2];
const browser = await chromium.launch();
const errors = [];
for (const [name, route, widths, steps] of S) {
  if (filter && !name.includes(filter)) continue;
  for (const width of widths) {
    const mobile = width < 768;
    const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
    await context.addInitScript(() => { sessionStorage.setItem('proto-consent', 'yes'); });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(`${name}@${width} ${error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`${name}@${width} console: ${message.text()}`); });
    await page.goto(`${BASE}${route}`);
    await page.waitForTimeout(900);
    for (const step of steps) {
      if (step.click) {
        const target = page.locator(step.click).first();
        if (await target.count()) await target.click({ force: step.force ?? mobile }).catch((e) => errors.push(`${name}@${width} click ${step.click}: ${e.message.split('\n')[0]}`));
        else errors.push(`${name}@${width} missing ${step.click}`);
        await page.waitForTimeout(450);
      }
      if (step.hover) {
        const box = await page.locator('[data-canvas]').boundingBox();
        await page.mouse.move(box.x + box.width * step.hover[0], box.y + box.height * step.hover[1]);
        await page.waitForTimeout(300);
      }
      if (step.hoverSel) { await page.locator(step.hoverSel).first().hover(); await page.waitForTimeout(200); }
      if (step.eval) { await page.evaluate(step.eval); await page.waitForTimeout(200); }
      if (step.wait) await page.waitForTimeout(step.wait);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) errors.push(`${name}@${width} horizontal overflow ${overflow}px`);
    await page.screenshot({ path: resolve(OUT, `ce-${name}-${width}.png`) });
    console.log('shot', `ce-${name}-${width}.png`);
    await context.close();
  }
}
await browser.close();
console.log(errors.length ? `ERRORS:\n${[...new Set(errors)].join('\n')}` : 'no errors');
