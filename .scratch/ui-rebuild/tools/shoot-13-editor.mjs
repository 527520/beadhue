// 票 13：批次工作室的裁剪与草稿编辑截图
import { chromium } from '@playwright/test';
const base = process.argv[2] ?? 'http://127.0.0.1:3101';
const out = '.scratch/ui-rebuild/evidence/impl/13';
const browser = await chromium.launch();
for (const width of [1440, 390]) {
  const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
  await page.goto(`${base}/login?next=/admin/batches`);
  await page.getByLabel('邮箱').fill('e2e-admin@example.com'); await page.getByLabel('密码').fill('E2e-pass-123!');
  await page.getByRole('button', { name: '登录', exact: true }).click(); await page.waitForURL(/admin\/batches/);
  await page.getByRole('button', { name: '新建批次' }).click();
  await page.getByLabel('选择图片', { exact: true }).setInputFiles('tests/fixtures/photo-gradient-64.png');
  await page.getByRole('button', { name: '预览并裁剪' }).click();
  await page.getByRole('dialog', { name: '裁剪图片' }).waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/batch-crop-${width}.png` });
  await page.getByRole('button', { name: '确认并更新' }).click();
  await page.getByRole('button', { name: /开始生成/ }).click();
  const edit = page.getByRole('button', { name: '编辑图纸' }).first();
  await edit.waitFor({ timeout: 90_000 });
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].find((b) => b.textContent?.includes('编辑图纸'))?.disabled, null, { timeout: 90_000 });
  await edit.click();
  await page.getByRole('dialog', { name: '编辑图纸' }).waitFor();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/batch-edit-${width}.png` });
  console.log('ok', width);
  await page.context().close();
}
await browser.close();
