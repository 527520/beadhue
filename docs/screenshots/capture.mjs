// README 截图生成器：需要本地 dev 服务器已在运行（默认 http://localhost:3000），且库里有公开作品
// （E2E 种子库可用 `.scratch/ui-rebuild/tools/capture-current.mjs seed` 补样例作品）。
// 用法：BASE_URL=http://127.0.0.1:3101 node docs/screenshots/capture.mjs
// 输出：docs/screenshots/discover.jpg、detail.jpg、editor.jpg
import { chromium } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = dirname(fileURLToPath(import.meta.url));
/** 编辑器截图用的像素画（红伞蘑菇，16×16；. 为透明）。 */
const MOTIF = [
  '.....KKKKKK.....', '...KKRRRRRRKK...', '..KRRWWRRRRRRK..', '.KRRWWWWRRWWRRK.',
  '.KRRWWWRRRWWWRK.', 'KRRRRRRRRRRRRRRK', 'KRWWRRRRRRRRWWRK', 'KRWWWRRRRRRWWWRK',
  'KRRRRRRRRRRRRRRK', '.KKKKKKKKKKKKKK.', '....KCCCCCCK....', '....KCCKKCCK....',
  '....KCCCCCCK....', '....KCCCCCCK....', '.....KCCCCK.....', '......KKKK......',
];
const COLORS = { K: '#3b2a2a', R: '#e0413a', W: '#fff6ea', C: '#f3dfb8' };

/** 移除开发工具角标。 */
async function tidy(page) {
  await page.evaluate(() => document.querySelector('nextjs-portal')?.remove());
  await page.waitForTimeout(500);
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  // 预先拒绝匿名统计：截图里不出现同意浮卡。
  await context.addCookies([{ name: 'beadhue_analytics_consent', value: 'denied', url: BASE }]);
  const page = await context.newPage();

  // 发现页
  await page.goto(`${BASE}/`);
  await page.locator('[data-slot="work-card"]').first().waitFor({ timeout: 30_000 });
  await tidy(page);
  await page.screenshot({ path: resolve(OUT, 'discover.jpg'), type: 'jpeg', quality: 85 });

  // 作品详情
  await page.locator('[data-slot="work-card"] a').first().click();
  await page.waitForURL(/\/community\/[^/]+$/);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await tidy(page);
  await page.screenshot({ path: resolve(OUT, 'detail.jpg'), type: 'jpeg', quality: 85 });

  // 编辑器：选图 → 新建图纸弹窗默认设置生成 → 进入编辑器
  await page.goto(`${BASE}/app`);
  await page.getByLabel('图片文件选择器').waitFor({ state: 'attached', timeout: 15_000 });
  const png = await page.evaluate(({ rows, colors }) => {
    const scale = 8;
    const canvas = document.createElement('canvas');
    canvas.width = rows[0].length * scale;
    canvas.height = rows.length * scale;
    const context = canvas.getContext('2d');
    rows.forEach((row, y) => [...row].forEach((key, x) => {
      if (!colors[key]) return;
      context.fillStyle = colors[key];
      context.fillRect(x * scale, y * scale, scale, scale);
    }));
    return canvas.toDataURL('image/png').split(',')[1];
  }, { rows: MOTIF, colors: COLORS });
  await page.getByLabel('图片文件选择器').setInputFiles({ name: '红伞蘑菇.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  const dialog = page.getByRole('dialog', { name: '新建图纸' });
  await dialog.getByRole('button', { name: '生成图纸', exact: true }).click();
  await dialog.waitFor({ state: 'detached', timeout: 60_000 });
  await page.getByText(/共 \d+ 颗/).first().waitFor({ state: 'attached', timeout: 30_000 });
  await tidy(page);
  await page.screenshot({ path: resolve(OUT, 'editor.jpg'), type: 'jpeg', quality: 85 });
} finally {
  await browser.close();
}
console.log(`screenshots written to ${OUT}`);
