import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { waitHydrated } from './helpers';

async function createPattern(page: Page) {
  await page.goto('/app?new=1');
  await waitHydrated(page);
  const reject = page.getByRole('button', { name: '不同意', exact: true });
  if (await reject.isVisible()) await reject.click();
  await page.getByLabel('图片文件选择器').setInputFiles(resolve('tests/fixtures/photo-gradient-64.png'));
  await page.getByRole('button', { name: '生成图纸', exact: true }).click();
  await expect(page.getByLabel('图纸编辑画布')).toBeVisible();
}

test('feedback: consent and headings use content width; portrait crop has no internal scrollbar', async ({ page }, info) => {
  await page.setViewportSize({ width: 1920, height: 960 });
  await page.goto('/app?new=1');
  await waitHydrated(page);
  const consent = page.getByRole('complementary', { name: '匿名使用统计' });
  await expect(consent).toBeVisible();
  expect.soft((await consent.boundingBox())!.width).toBeLessThanOrEqual(1200);
  await page.screenshot({ animations: 'disabled', path: info.outputPath('consent-desktop.png') });
  await page.getByRole('button', { name: '不同意', exact: true }).click();
  await page.setViewportSize({ width: 560, height: 960 });
  await page.getByLabel('图片文件选择器').setInputFiles(resolve('tests/fixtures/max-100x8000.png'));
  const crop = page.locator('.crop-canvas-wrap');
  await expect(crop).toBeVisible();
  await expect.soft.poll(() => crop.evaluate(e => e.scrollHeight <= e.clientHeight && e.scrollWidth <= e.clientWidth)).toBe(true);
  await page.screenshot({ animations: 'disabled', path: info.outputPath('portrait-crop.png'), fullPage: true });
  await page.goto('/me');
  for (const width of [350, 390, 560, 768, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    const heading = await page.locator('.beadhue-page-heading').boundingBox();
    const content = await page.locator('.designs-container').boundingBox();
    expect.soft(Math.abs(heading!.x - content!.x)).toBeLessThan(2);
    expect.soft(Math.abs(heading!.width - content!.width)).toBeLessThan(2);
    await expect(page.getByRole('heading', { name: '我的设计', exact: true })).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ animations: 'disabled', path: info.outputPath('my-designs.png'), fullPage: true });
});

test('feedback: settings drawer is flush, dismissible and centered; name focus is contained; back leaves preview', async ({ page }, info) => {
  await page.setViewportSize({ width: 560, height: 960 });
  await createPattern(page);
  const name = page.getByLabel('设计名称');
  await name.fill('修改后的设计');
  await expect.soft(name).toHaveCSS('box-shadow', 'none');
  await page.screenshot({ animations: 'disabled', path: info.outputPath('design-name-focus.png') });
  await page.getByRole('button', { name: '参数', exact: true }).click();
  const panel = page.locator('.beadhue-settings:visible');
  const bounds = (await panel.boundingBox())!;
  expect.soft(Math.abs(bounds.y + bounds.height - 960)).toBeLessThan(2);
  const close = page.getByRole('button', { name: '关闭参数', exact: true });
  const button = (await close.boundingBox())!;
  const icon = (await close.locator('svg').boundingBox())!;
  expect.soft(Math.abs(button.x + button.width / 2 - icon.x - icon.width / 2)).toBeLessThan(1);
  await page.screenshot({ animations: 'disabled', path: info.outputPath('settings-drawer.png') });
  await page.mouse.click(12, Math.max(5, bounds.y - 20));
  await expect(panel).toBeHidden();
  await page.getByRole('button', { name: '参数', exact: true }).click();
  const advanced = page.locator('.beadhue-settings-sheet summary').first();
  for (let i = 0; i < 25 && !(await advanced.evaluate(e => e === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(advanced).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(advanced.locator('..')).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page.getByRole('button', { name: '参数', exact: true })).toBeFocused();
  await page.getByRole('button', { name: '返回预览', exact: true }).click();
  await page.getByRole('button', { name: '返回我的设计', exact: true }).click();
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.getByText('修改后的设计', { exact: true }).first()).toBeVisible();
});

test('feedback: current paint color stays visible and PNG settings pair labels with controls', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createPattern(page);
  const color = page.locator('.editor-active-color');
  await expect(color).toBeVisible();
  const initialColor = await color.textContent();
  const viewport = page.locator('.editor-canvas-viewport');
  await viewport.focus();
  await page.keyboard.press('i');
  const canvas = (await page.getByLabel('图纸编辑画布').boundingBox())!;
  await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await expect(color).toContainText(/#[0-9A-F]{6}/i);
  await expect(color).not.toHaveText(initialColor!);
  const sampled = await color.textContent();
  await viewport.focus();
  await page.keyboard.press('b');
  await expect(color).toHaveText(sampled!);
  await page.keyboard.press('g');
  await expect(color).toHaveText(sampled!);
  await page.screenshot({ animations: 'disabled', path: info.outputPath('active-color.png') });
  await page.getByRole('button', { name: '参数', exact: true }).click();
  await page.locator('.desktop-tool-dock').getByRole('button', { name: '导出', exact: true }).click();
  await page.getByRole('button', { name: 'PNG 选项', exact: true }).click();
  const options = page.getByRole('region', { name: 'PNG 导出选项' });
  for (const label of await options.locator('.switch-control').all()) {
    const text = (await label.locator('span').last().boundingBox())!;
    const track = (await label.locator('.switch-track').boundingBox())!;
    expect(text.x).toBeLessThan(track.x);
    expect(Math.abs(text.y + text.height / 2 - track.y - track.height / 2)).toBeLessThan(2);
  }
  await page.screenshot({ animations: 'disabled', path: info.outputPath('png-options.png') });
  await page.goto('/');
  const hero = page.locator('.feature-art');
  if (await hero.isVisible()) {
    const image = hero.locator('img');
    await expect(image).toHaveCSS('transform', 'none');
    const art = (await image.boundingBox())!;
    const area = (await hero.locator('.feature-image').boundingBox())!;
    expect(art.width).toBeLessThanOrEqual(area.width);
    await page.screenshot({ animations: 'disabled', path: info.outputPath('inspiration.png') });
  }
});


test('feedback: search has one focus boundary and sort uses the shared picker', async ({ page }, info) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await waitHydrated(page);
    const search = page.locator('.search input');
    await search.focus();
    await expect(search).toHaveCSS('outline-style', 'none');
    await expect(search).toHaveCSS('box-shadow', 'none');
    await expect(page.locator('.search')).toHaveCSS('border-top-color', 'rgb(41, 91, 203)');
    await page.screenshot({ animations: 'disabled', path: info.outputPath(`search-focus-${width}.png`) });
    await page.locator('.discovery-sort button').click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.screenshot({ animations: 'disabled', path: info.outputPath(`sort-open-${width}.png`) });
    await page.getByRole('option', { name: '最近上新', exact: true }).click();
    await expect(page).toHaveURL(/sort=latest/);
    await page.getByRole('button', { name: '更多筛选', exact: true }).click();
    await expect(page.locator('.discovery-filter-grid')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ animations: 'disabled', path: info.outputPath(`filters-${width}.png`), fullPage: true });
  }
});
