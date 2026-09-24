import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { BASE_URL, generateWith, openPanelTab, openRecrop, recropButton, typeSpin, uploadFile, waitSaved } from './helpers';

const PHOTO = resolve(process.cwd(), 'tests/fixtures/photo-wide-320x200.png');
const cropDialog = (page: Page) => page.getByRole('dialog', { name: '裁剪图片', exact: true });
const beads = (page: Page, count: number) => page.getByText(new RegExp(`共 ${count} 颗`)).first();

/** 本机没有原图时，调整页只给「需要原图」卡片，不假装还能重新裁剪。 */
async function expectNeedsOriginal(page: Page) {
  await openPanelTab(page, '调整');
  await expect(page.getByRole('heading', { name: '需要原图才能重新生成' })).toBeVisible();
  await expect(recropButton(page)).toHaveCount(0);
  await expect(page.getByRole('spinbutton', { name: '自定义宽度（格）' })).toHaveCount(0);
}

async function clearOriginalCache(page: Page) {
  await page.evaluate(() => new Promise<void>((done) => {
    const request = indexedDB.deleteDatabase('beadhue-originals');
    request.onsuccess = request.onerror = request.onblocked = () => done();
  }));
}

async function start(page: Page) {
  await page.goto('/app?new=1');
  await uploadFile(page, PHOTO);
  await generateWith(page, { width: 100, removeBackground: false });
  await expect(beads(page, 6300)).toBeAttached();
  await expect(cropDialog(page)).toHaveCount(0);
}

test('整图首版 → 取消不更新 → 确认自动更新 → 刷新自动接回原图 → 缺原图如实提示', async ({ page }) => {
  await start(page);
  await openRecrop(page);
  await cropDialog(page).getByRole('button', { name: '1:1', exact: true }).click();
  await cropDialog(page).getByRole('button', { name: '取消', exact: true }).click();
  await expect(beads(page, 6300)).toBeAttached();
  await expect(recropButton(page)).toBeFocused();

  await recropButton(page).click();
  await expect(cropDialog(page)).toContainText('取景：320 × 200 像素');
  await cropDialog(page).getByRole('button', { name: '1:1', exact: true }).click();
  await cropDialog(page).getByRole('button', { name: '确认并更新' }).click();
  await expect(cropDialog(page)).toHaveCount(0);
  await expect(beads(page, 10000)).toBeAttached();
  await openRecrop(page);
  await expect(cropDialog(page)).toContainText('取景：200 × 200 像素');
  await page.keyboard.press('Escape');
  await waitSaved(page);

  // 刷新后从本机原图缓存自动接回，仍可重新裁剪。
  await page.reload();
  await expect(beads(page, 10000)).toBeAttached();
  await openRecrop(page);
  await expect(cropDialog(page)).toContainText('取景：200 × 200 像素');
  await page.keyboard.press('Escape');
  await expect(cropDialog(page)).toHaveCount(0);

  // 清掉本机原图缓存再刷新：如实提示缺原图，重新选图并取消会保留原图纸。
  await clearOriginalCache(page);
  await page.reload();
  await expect(beads(page, 10000)).toBeAttached();
  await expectNeedsOriginal(page);
  await page.getByLabel('原图文件选择器').setInputFiles(PHOTO);
  const replace = page.getByRole('dialog', { name: '替换当前图纸？' });
  await replace.getByRole('button', { name: '取消', exact: true }).click();
  await expect(replace).toHaveCount(0);
  await expect(cropDialog(page)).toHaveCount(0);
  await expect(beads(page, 10000)).toBeAttached();
  await expectNeedsOriginal(page);
});

test('手工修改：取消裁剪和拒绝覆盖均保留，确认后可以撤销重生成', async ({ page }) => {
  await start(page);
  await page.getByLabel(/^图纸编辑画布/).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('e');
  await page.keyboard.press('Enter');
  await expect(beads(page, 6299)).toBeAttached();
  await openRecrop(page);
  await cropDialog(page).getByRole('button', { name: '1:1', exact: true }).click();
  await cropDialog(page).getByRole('button', { name: '确认并更新' }).click();
  const warning = page.getByRole('dialog', { name: '重新生成会覆盖手工修补' });
  await expect(warning).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(warning).toHaveCount(0);
  await expect(cropDialog(page)).toBeVisible();
  await cropDialog(page).getByRole('button', { name: '取消', exact: true }).click();
  await expect(beads(page, 6299)).toBeAttached();
  await recropButton(page).click();
  await cropDialog(page).getByRole('button', { name: '1:1', exact: true }).click();
  await cropDialog(page).getByRole('button', { name: '确认并更新' }).click();
  await warning.getByRole('button', { name: '重新生成', exact: true }).click();
  await expect(beads(page, 10000)).toBeAttached();
  await page.getByRole('button', { name: '撤销', exact: true }).first().click();
  await expect(beads(page, 6299)).toBeAttached();
  await waitSaved(page);
  await page.reload();
  await expect(beads(page, 6299)).toBeAttached();
  await openPanelTab(page, '调整');
  await typeSpin(page, '自定义宽度（格）', '50');
  await page.getByRole('button', { name: '重新生成', exact: true }).click();
  await warning.getByRole('button', { name: '重新生成', exact: true }).click({ timeout: 5_000 }).catch(() => undefined);
  // 实际 IndexedDB 恢复的是原始宽图生成源，而非撤销前的正方形源。
  await expect(beads(page, 1550)).toBeAttached();
});

for (const width of [350, 390]) {
  test(`手机 ${width}px：从「…」→ 调整进入重新裁剪，横屏与收缩视口下操作可达、无障碍`, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width, height: 700 }, hasTouch: true });
    const page = await context.newPage();
    try {
      await start(page);
      await page.getByRole('button', { name: '更多', exact: true }).tap();
      await page.getByRole('button', { name: '调整', exact: true }).tap();
      await page.getByRole('button', { name: '重新裁剪', exact: true }).tap();
      const dialog = cropDialog(page);
      await expect(dialog).toContainText('取景：320 × 200 像素');
      for (const size of [{ width, height: 700 }, { width: 700, height: width }, { width, height: 400 }]) {
        await page.setViewportSize(size);
        const layout = await dialog.evaluate((element) => ({
          viewport: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          bottom: element.getBoundingClientRect().bottom,
        }));
        expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewport);
        expect(layout.bottom).toBeLessThanOrEqual(size.height + 1);
        for (const name of ['取消', '确认并更新']) {
          const button = dialog.getByRole('button', { name, exact: true });
          await expect(button).toBeInViewport();
          expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        }
        const image = (await dialog.getByRole('img', { name: '所选图片' }).boundingBox())!;
        expect(image.width / image.height).toBeCloseTo(1.6, 1);
      }
      await page.setViewportSize({ width, height: 700 });
      const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
      expect(results.violations.filter((entry) => ['critical', 'serious'].includes(entry.impact ?? ''))).toEqual([]);
      await dialog.getByRole('button', { name: '1:1', exact: true }).tap();
      await dialog.getByRole('button', { name: '确认并更新' }).tap();
      await expect(beads(page, 10000)).toBeAttached();
    } finally { await context.close(); }
  });
}
