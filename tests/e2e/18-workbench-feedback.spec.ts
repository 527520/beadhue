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
  await expect(page.getByLabel(/^图纸编辑画布/)).toBeVisible();
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
  // 「新建图纸」底部面板里的取景舞台：竖长图也等比放进舞台，不出现内部滚动条。
  const stage = page.getByRole('dialog', { name: '新建图纸' }).locator('[data-base-ui-swipe-ignore]').first();
  await expect(stage).toBeVisible();
  await expect.soft.poll(() => stage.evaluate((e) => e.scrollHeight <= e.clientHeight && e.scrollWidth <= e.clientWidth)).toBe(true);
  await page.screenshot({ animations: 'disabled', path: info.outputPath('portrait-crop.png'), fullPage: true });
  await page.goto('/me');
  for (const width of [350, 390, 560, 768, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    // 页头、页签与设计区同一左边线、同宽（R15-06）。
    const heading = await page.locator('main h1').boundingBox();
    const tabs = await page.getByRole('navigation', { name: '我的内容' }).boundingBox();
    const content = await page.getByRole('region', { name: '我的设计' }).boundingBox();
    expect.soft(Math.abs(tabs!.x - content!.x)).toBeLessThan(width < 768 ? 20 : 2);
    expect.soft(heading!.x).toBeGreaterThan(content!.x);
    await expect(page.getByRole('region', { name: '我的设计' })).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ animations: 'disabled', path: info.outputPath('my-designs.png'), fullPage: true });
});

test('feedback: mobile sheets are flush and dismissible, rename lives in「…」, back leaves to my designs', async ({ page }, info) => {
  await page.setViewportSize({ width: 560, height: 960 });
  await createPattern(page);
  const more = page.getByRole('button', { name: '更多', exact: true });
  await more.click();
  await page.getByRole('button', { name: '重命名', exact: true }).click();
  const rename = page.getByRole('dialog', { name: '重命名' });
  await rename.getByRole('textbox', { name: '设计名称' }).fill('修改后的设计');
  await rename.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page).toHaveTitle(/修改后的设计/);

  await more.click();
  await page.getByRole('button', { name: '调整', exact: true }).click();
  const panel = page.getByRole('dialog', { name: '调整' });
  await expect(panel).toBeVisible();
  const popup = page.locator('[data-slot="dialog-content"]').filter({ has: page.getByRole('heading', { name: '调整' }) });
  await expect.poll(async () => {
    const rect = await popup.boundingBox();
    return rect ? Math.round(rect.y + rect.height) : 0;
  }).toBe(960);
  const close = panel.getByRole('button', { name: '关闭', exact: true });
  const button = (await close.boundingBox())!;
  const icon = (await close.locator('svg').boundingBox())!;
  expect.soft(Math.abs(button.x + button.width / 2 - icon.x - icon.width / 2)).toBeLessThan(1);
  await page.screenshot({ animations: 'disabled', path: info.outputPath('adjust-sheet.png') });
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();

  await page.getByRole('button', { name: '返回我的设计', exact: true }).click();
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.getByText('修改后的设计', { exact: true }).first()).toBeVisible();
});

test('feedback: picked color shows on the current-color button and PNG settings pair labels with controls', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createPattern(page);
  const tools = page.getByRole('toolbar', { name: '工具' });
  const current = tools.getByRole('button', { name: /^当前色 .*打开颜色$/ });
  await tools.getByRole('button', { name: '吸管', exact: true }).click();
  const canvas = (await page.getByLabel(/^图纸编辑画布/).boundingBox())!;
  await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  // 吸管取色后回到上一个上色工具（画笔），当前色块就是取到的颜色。
  await expect(tools.getByRole('button', { name: '画笔', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const picked = await current.getAttribute('aria-label');
  expect(picked).toMatch(/^当前色 \S+/);
  await expect(tools.getByRole('button', { name: '油漆桶', exact: true })).toBeVisible();
  await tools.getByRole('button', { name: '油漆桶', exact: true }).click();
  await expect(current).toHaveAttribute('aria-label', picked!);
  await page.screenshot({ animations: 'disabled', path: info.outputPath('active-color.png') });

  await page.getByRole('button', { name: '更多', exact: true }).click();
  await page.getByRole('button', { name: '导出', exact: true }).click();
  await page.getByRole('button', { name: '下载 PNG…' }).click();
  const options = page.getByRole('dialog', { name: '下载 PNG' });
  for (const control of await options.getByRole('switch').all()) {
    const row = control.locator('xpath=ancestor::div[1]');
    const label = (await row.locator('label').first().boundingBox())!;
    const track = (await control.boundingBox())!;
    expect(label.x).toBeLessThan(track.x);
  }
  await page.screenshot({ animations: 'disabled', path: info.outputPath('png-options.png') });
});

test('feedback: search has one focus boundary and sort uses the shared picker', async ({ page }, info) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await waitHydrated(page);
    // 手机顶栏只有搜索图标，点开是整屏搜索页。
    if (width < 768) await page.getByRole('banner').getByRole('button', { name: '搜索', exact: true }).click();
    const field = page.locator('[data-slot="search-field"]').filter({ visible: true }).first();
    const search = field.getByRole('searchbox');
    await search.focus();
    // 焦点只画在外框上：输入框自己不再叠一层描边或阴影。
    await expect(search).toHaveCSS('outline-style', 'none');
    await expect(search).toHaveCSS('box-shadow', 'none');
    await expect(field).not.toHaveCSS('box-shadow', 'none');
    await page.screenshot({ animations: 'disabled', path: info.outputPath(`search-focus-${width}.png`) });
    if (width < 768) await page.getByRole('button', { name: '返回', exact: true }).click();
    await page.getByRole('button', { name: /^排序：/ }).click();
    const sort = page.getByRole('navigation', { name: '排序' });
    await expect(sort).toBeVisible();
    await page.screenshot({ animations: 'disabled', path: info.outputPath(`sort-open-${width}.png`) });
    await sort.getByRole('link', { name: '最新发布', exact: true }).click();
    await expect(page).toHaveURL(/sort=new/);
    await page.getByRole('button', { name: '筛选', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '筛选' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ animations: 'disabled', path: info.outputPath(`filters-${width}.png`), fullPage: true });
  }
});
