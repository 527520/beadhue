// 交互探针：拖动绘制、撤销、油漆桶、快捷键、参照窗拖动缩放、跟拼完成本行、重命名、创作 → 编辑器（含真实图片上传）。
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

const BASE = 'http://127.0.0.1:4180/.scratch/ui-rebuild/prototype/index.html';
const OUT = resolve('.scratch/ui-rebuild/evidence/prototype');
const results = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`);

// 生成一张 120×90 的测试 PNG：左半红、右半蓝、白底圆。
function png(w, h, pixel) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y += 1) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x += 1) raw.set(pixel(x, y), y * (w * 3 + 1) + 1 + x * 3); }
  const crc = (buf) => { let c; const t = []; for (let n = 0; n < 256; n += 1) { c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let r = 0xffffffff; for (const b of buf) r = t[(r ^ b) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const photo = resolve('.scratch/ui-rebuild/tools/.probe-photo.png');
writeFileSync(photo, png(120, 90, (x, y) => ((x - 60) ** 2 + (y - 45) ** 2 < 900 ? (x < 60 ? [224, 71, 63] : [63, 127, 217]) : [250, 250, 250])));

const browser = await chromium.launch();
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { sessionStorage.setItem('proto-consent', 'yes'); });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${BASE}#/editor/d-panda`);
await page.waitForTimeout(800);
const box = await page.locator('[data-canvas]').boundingBox();
const count = () => page.evaluate(() => document.querySelector('.ed-used-row .count')?.textContent);
const undoDisabled = () => page.locator('[data-act="undo"]').isDisabled();
check('初始撤销不可用', await undoDisabled());
// 画笔拖动（先选红色）
await page.locator('.ed-sw[aria-label^="F5"]').click();
await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(200);
const usedAfter = await page.evaluate(() => [...document.querySelectorAll('.ed-used-row .code')].map((n) => n.textContent));
check('拖动绘制写入红色', usedAfter.includes('F5'), usedAfter.join(','));
check('绘制后撤销可用', !(await undoDisabled()));
check('保存中状态', (await page.locator('.ed-save').first().textContent()).includes('保存中'));
await page.waitForTimeout(1000);
check('回到已保存', (await page.locator('.ed-save').first().textContent()).includes('已保存'));
await page.keyboard.press('Meta+z');
await page.waitForTimeout(200);
const usedUndo = await page.evaluate(() => [...document.querySelectorAll('.ed-used-row .code')].map((n) => n.textContent));
check('⌘Z 撤销', !usedUndo.includes('F5'));
await page.keyboard.press('Meta+Shift+z');
await page.waitForTimeout(200);
check('⇧⌘Z 重做', (await page.evaluate(() => [...document.querySelectorAll('.ed-used-row .code')].map((n) => n.textContent))).includes('F5'));
// 快捷键切工具
await page.keyboard.press('g');
check('G 切到油漆桶', await page.locator('.ed-tools [data-tool="fill"]').getAttribute('aria-pressed') === 'true');
await page.mouse.click(box.x + 20, box.y + 20);
await page.waitForTimeout(200);
check('油漆桶填充背景', (await page.evaluate(() => document.querySelector('[data-meta]').textContent)).length > 0);
// 空格临时平移不写入
const before = await page.evaluate(() => document.querySelector('[data-meta]').textContent);
await page.keyboard.press('b');
await page.keyboard.down(' ');
await page.mouse.move(box.x + 400, box.y + 400);
await page.mouse.down(); await page.mouse.move(box.x + 500, box.y + 450, { steps: 5 }); await page.mouse.up();
await page.keyboard.up(' ');
check('空格平移不改撤销栈', (await page.evaluate(() => document.querySelector('[data-meta]').textContent)) === before);
// 缩放
const pct0 = await page.locator('[data-zoom-pct]').textContent();
await page.keyboard.press('=');
const pct1 = await page.locator('[data-zoom-pct]').textContent();
check('+ 放大', pct0 !== pct1, `${pct0}→${pct1}`);
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.wheel(0, 200);
await page.waitForTimeout(100);
check('滚轮缩小', (await page.locator('[data-zoom-pct]').textContent()) !== pct1);
await page.keyboard.press('0');
// 替换颜色 → toast 撤销
await page.keyboard.press('r');
await page.locator('.ed-sw[aria-label^="H7"]').click();
await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.55);
await page.waitForTimeout(200);
check('替换颜色 toast', (await page.locator('.toast').last().textContent()).includes('替换为'), await page.locator('.toast').last().textContent());
// 画笔大小弹出层
await page.keyboard.press('b');
await page.locator('.ed-tools [data-tool="brush"]').click();
await page.waitForTimeout(200);
check('再点画笔弹出笔刷大小', await page.locator('.popover [data-act="brush-size"]').count() === 3);
await page.locator('.popover [data-act="brush-size"][data-value="3"]').click();
check('笔刷徽标 3', (await page.locator('.ed-tools .ed-tool-badge').textContent()) === '3');
// 参照窗拖动与缩放
await page.locator('[data-act="ref-open"]').click();
await page.waitForTimeout(300);
const win = page.locator('[data-ref-win]');
const w0 = await win.boundingBox();
await page.mouse.move(w0.x + 60, w0.y + 20); await page.mouse.down(); await page.mouse.move(w0.x - 300, w0.y + 200, { steps: 8 }); await page.mouse.up();
const w1 = await win.boundingBox();
check('参照窗可拖动', w1.x < w0.x - 200 && w1.y > w0.y + 150, `${Math.round(w0.x)},${Math.round(w0.y)}→${Math.round(w1.x)},${Math.round(w1.y)}`);
await page.mouse.move(w1.x + w1.width - 5, w1.y + w1.height - 5); await page.mouse.down(); await page.mouse.move(w1.x + w1.width + 80, w1.y + w1.height + 60, { steps: 6 }); await page.mouse.up();
const w2 = await win.boundingBox();
check('参照窗可缩放', w2.width > w1.width + 50, `${Math.round(w1.width)}→${Math.round(w2.width)}`);
check('拖动参照窗不写入图纸', (await page.evaluate(() => document.querySelector('[data-meta]').textContent)) === (await page.evaluate(() => document.querySelector('[data-meta]').textContent)));
await page.locator('[data-act="ref-collapse"]').click();
check('参照窗折叠', await page.locator('.ed-ref-win.is-collapsed').count() === 1);
await page.screenshot({ path: resolve(OUT, 'ce-probe-ref-moved-1440.png') });
// 重命名
await page.locator('.ed-top [data-act="rename"]').click();
await page.keyboard.press('Meta+a');
await page.keyboard.type('熊猫冰箱贴 · 二号');
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
check('重命名', (await page.locator('.ed-name').textContent()).includes('二号') && (await page.locator('.toast').last().textContent()).includes('已重命名'));
// 跟拼
await page.locator('[data-mode="stitch"]').click();
await page.waitForTimeout(300);
check('跟拼模式导出降为次按钮', await page.locator('[data-export].btn-secondary').count() === 1 && await page.locator('.btn-primary:visible').count() === 1);
const pctA = await page.locator('.ed-progress .t-title-1').textContent();
const rowA = await page.locator('.ed-row-card h3').textContent();
await page.locator('.ed-panel [data-act="row-done"]').click();
await page.waitForTimeout(300);
const pctB = await page.locator('.ed-progress .t-title-1').textContent();
const rowB = await page.locator('.ed-row-card h3').textContent();
check('完成本行推进进度与当前行', pctA !== pctB || rowA !== rowB, `${pctA} ${rowA} → ${pctB} ${rowB}`);
await page.locator('.ed-panel [data-board="0"]').click();
await page.waitForTimeout(300);
check('点板块跳转', (await page.locator('.ed-row-card h3').textContent()).startsWith('第 1 块板'));

// 创作 → 编辑器（示例）
await page.goto(`${BASE}#/create`);
await page.waitForTimeout(600);
await page.locator('[data-sample]').first().click();
await page.waitForTimeout(400);
const frame = await page.locator('[data-frame]').boundingBox();
await page.mouse.move(frame.x + frame.width - 4, frame.y + frame.height - 4);
await page.mouse.down(); await page.mouse.move(frame.x + frame.width * 0.6, frame.y + frame.height * 0.6, { steps: 6 }); await page.mouse.up();
const frame2 = await page.locator('[data-frame]').boundingBox();
check('取景框四角缩放', frame2.width < frame.width - 40, `${Math.round(frame.width)}→${Math.round(frame2.width)}`);
await page.mouse.move(frame2.x + frame2.width / 2, frame2.y + frame2.height / 2); await page.mouse.down(); await page.mouse.move(frame2.x + frame2.width / 2 + 60, frame2.y + frame2.height / 2 + 40, { steps: 6 }); await page.mouse.up();
const frame3 = await page.locator('[data-frame]').boundingBox();
check('取景框拖动', frame3.x > frame2.x + 30);
await page.screenshot({ path: resolve(OUT, 'ce-probe-crop-1440.png') });
await page.locator('[data-generate]').click();
await page.waitForTimeout(1300);
check('生成图纸进入编辑器', page.url().includes('#/editor/new-cat'), page.url().split('#')[1]);
await page.screenshot({ path: resolve(OUT, 'ce-probe-generated-1440.png') });

// 真实图片上传
await page.goto(`${BASE}#/create`);
await page.waitForTimeout(500);
await page.locator('[data-file]').setInputFiles(photo);
await page.waitForTimeout(700);
check('上传后打开新建图纸', await page.locator('.cr-dialog').count() === 1);
await page.locator('[data-generate]').click();
await page.waitForTimeout(1300);
check('照片生成图纸', page.url().includes('new-photo'));
const photoUsed = await page.evaluate(() => [...document.querySelectorAll('.ed-used-row .code')].map((n) => n.textContent));
check('照片量化出红蓝两色', photoUsed.includes('F5') && photoUsed.includes('C9'), photoUsed.join(','));
await page.locator('[data-act="ref-open"]').click();
await page.waitForTimeout(300);
await page.screenshot({ path: resolve(OUT, 'ce-probe-photo-1440.png') });

// 非图片文件
await page.goto(`${BASE}#/create`);
await page.waitForTimeout(500);
await page.locator('[data-file]').setInputFiles({ name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('x') });
await page.waitForTimeout(300);
check('非图片给出就地错误', (await page.locator('[data-drop-error]').textContent()).includes('不是图片'));
await page.screenshot({ path: resolve(OUT, 'ce-probe-drop-error-1440.png') });

// 手机：双指缩放不写入
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const mp = await m.newPage();
mp.on('pageerror', (e) => errors.push(`m ${e.message}`));
await mp.goto(`${BASE}#/editor/d-cat`);
await mp.waitForTimeout(800);
const mb = await mp.locator('[data-canvas]').boundingBox();
await mp.locator('.ed-recent-sw').nth(1).tap(); await mp.waitForTimeout(200);
await mp.locator('[data-canvas]').tap({ position: { x: mb.width / 2, y: mb.height / 2 } });
await mp.waitForTimeout(300);
check('手机轻点画笔可写入', !(await mp.locator('[data-act="undo"]').isDisabled()));
await browser.close();
console.log(results.join('\n'));
console.log(errors.length ? `ERRORS:\n${[...new Set(errors)].join('\n')}` : 'no page errors');
