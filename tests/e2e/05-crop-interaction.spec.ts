/**
 * 已有图纸时的重新裁剪（票 09：与「新建图纸」同一个取景舞台）：
 * 四角等比缩放 / 框内拖动整体移动 / 1:1 与按底板比例 / 方向键移动 / 窄屏底部面板。
 * 用 320×200 横图，真实鼠标拖拽，读弹窗里的「取景：W × H 像素」。
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { openRecrop, uploadAndGenerate } from './helpers';

const PHOTO = resolve(process.cwd(), 'tests/fixtures/photo-wide-320x200.png');

const cropDialog = (page: Page) => page.getByRole('dialog', { name: '裁剪图片' });
const frame = (page: Page) => cropDialog(page).getByRole('group', { name: '取景框，方向键移动' });

async function openCropper(page: Page) {
  await page.goto('/app');
  await uploadAndGenerate(page, PHOTO);
  await openRecrop(page);
  await expect(frame(page)).toBeVisible({ timeout: 15_000 });
}

async function sizeOf(page: Page): Promise<{ w: number; h: number }> {
  const status = cropDialog(page).getByRole('status').filter({ hasText: '取景' });
  await expect(status).toHaveText(/取景：\d+ × \d+ 像素/);
  const m = (await status.textContent())!.match(/(\d+) × (\d+)/)!;
  return { w: Number(m[1]), h: Number(m[2]) };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  expect(rect).not.toBeNull();
  return rect!;
}

test('打开时是上次的取景（首版为整张图）', async ({ page }) => {
  await openCropper(page);
  expect(await sizeOf(page)).toEqual({ w: 320, h: 200 });
  await expect(cropDialog(page).getByRole('button', { name: '原图', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('拖右下角等比缩小到一半：约 160×100', async ({ page }) => {
  await openCropper(page);
  const b = await box(frame(page));
  await drag(page, { x: b.x + b.width - 3, y: b.y + b.height - 3 }, { x: b.x + b.width * 0.5, y: b.y + b.height * 0.5 });
  const { w, h } = await sizeOf(page);
  expect(w).toBeGreaterThan(150);
  expect(w).toBeLessThan(170);
  expect(Math.abs(w / h - 1.6)).toBeLessThan(0.05);
});

test('框内拖动整体移动：取景尺寸不变、位置改变', async ({ page }) => {
  await openCropper(page);
  let b = await box(frame(page));
  await drag(page, { x: b.x + b.width - 3, y: b.y + b.height - 3 }, { x: b.x + b.width * 0.6, y: b.y + b.height * 0.6 });
  const before = await sizeOf(page);
  b = await box(frame(page));
  await drag(page, { x: b.x + b.width * 0.5, y: b.y + b.height * 0.5 }, { x: b.x + b.width * 0.5 + 40, y: b.y + b.height * 0.5 + 25 });
  expect(await sizeOf(page)).toEqual(before);
  const after = await box(frame(page));
  expect(after.x).toBeGreaterThan(b.x + 20);
  expect(after.y).toBeGreaterThan(b.y + 10);
});

test('1:1 得到正方形取景，拖角时保持正方形；按底板行数凑整块板', async ({ page }) => {
  await openCropper(page);
  await cropDialog(page).getByRole('button', { name: '1:1', exact: true }).click();
  expect(await sizeOf(page)).toEqual({ w: 200, h: 200 });
  const b = await box(frame(page));
  await drag(page, { x: b.x + b.width - 3, y: b.y + b.height - 3 }, { x: b.x + b.width * 0.7, y: b.y + b.height * 0.8 });
  const square = await sizeOf(page);
  expect(square.w).toBe(square.h);
  await cropDialog(page).getByRole('button', { name: '按底板', exact: true }).click();
  await expect(cropDialog(page).getByText(/按整块底板取景 · \d+ × \d+ 块/)).toBeVisible();
});

test('方向键移动取景框，Shift 步长更大', async ({ page }) => {
  await openCropper(page);
  const b = await box(frame(page));
  await drag(page, { x: b.x + b.width - 3, y: b.y + b.height - 3 }, { x: b.x + b.width * 0.5, y: b.y + b.height * 0.5 });
  await frame(page).focus();
  const start = await box(frame(page));
  await page.keyboard.press('ArrowRight');
  const one = await box(frame(page));
  expect(one.x).toBeGreaterThan(start.x);
  await page.keyboard.press('Shift+ArrowDown');
  const two = await box(frame(page));
  expect(two.y - one.y).toBeGreaterThan(one.x - start.x);
});

test('窄屏（350px）：底部面板里取景舞台保持原图比例，按钮在视口内且不横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 350, height: 700 });
  await page.goto('/app');
  await uploadAndGenerate(page, PHOTO);
  await page.getByRole('button', { name: '更多', exact: true }).click();
  await page.getByRole('button', { name: '调整', exact: true }).click();
  await page.getByRole('button', { name: '重新裁剪', exact: true }).click();
  await expect(frame(page)).toBeVisible({ timeout: 15_000 });
  const image = await box(cropDialog(page).getByRole('img', { name: '所选图片' }));
  expect(image.width / image.height).toBeGreaterThan(1.55);
  expect(image.width / image.height).toBeLessThan(1.65);
  expect(image.width).toBeLessThanOrEqual(350);
  for (const name of ['取消', '确认并更新']) await expect(cropDialog(page).getByRole('button', { name, exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // 舞台上的拖动不能被底部面板当成下滑关闭。
  await expect(cropDialog(page).locator('[data-base-ui-swipe-ignore]').first()).toHaveCSS('touch-action', 'none');
});
