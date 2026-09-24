import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { generateFromDialog, uploadAndGenerate, uploadFile } from './helpers';

const PHOTO_A = resolve(process.cwd(), 'tests/fixtures/photo-wide-320x200.png');
const PHOTO_B = resolve(process.cwd(), 'tests/fixtures/photo-gradient-64.png');

/**
 * 首页 → 工作台 图片交接（D-3）回归：
 * 曾出现过「首页上传新图后工作台又恢复到上一个设计，必须点重新上传」——
 * 根因是 dev StrictMode 双调用 effect 把交接文件吞掉 + /app 不带 ?new=1 时
 * 历史设计恢复与交接竞态。此用例锁定真实用户旅程。
 */
test('发现页「创作」进入创作入口 → 选新图生成，不回到上一个设计；最近的设计可回到旧图', async ({ page }) => {
  // 1) 先生成一张设计，留下本地历史
  await page.goto('/app');
  await uploadAndGenerate(page, PHOTO_A);
  await expect(page.getByText(/共 \d+ 粒/).first()).toBeVisible({ timeout: 40_000 });
  await page.waitForTimeout(1500); // 让自动保存落库（1s 防抖）

  // 2) 回发现页，经顶栏「创作」进入 /app：是创作入口，不恢复上一张（D66）
  await page.goto('/');
  await page.getByRole('link', { name: '创作', exact: true }).first().click();
  await page.waitForURL(/\/app$/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { level: 1, name: '创作一张拼豆图纸' })).toBeVisible();
  await expect(page.getByLabel('设计名称')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^打开「/ })).toHaveCount(1);
  await uploadFile(page, PHOTO_B);

  // 第二张是正方形：首版为 100×100，不能恢复旧的 100×63。
  await generateFromDialog(page);
  await expect(page.getByText(/共 10000 粒/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: '裁剪图片', exact: true })).toBeEnabled();
  await expect(page.getByRole('dialog', { name: '裁剪图片' })).toHaveCount(0);
});
