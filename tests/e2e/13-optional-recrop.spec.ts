import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { BASE_URL, generateFromDialog, openPanelTab, openRecrop, recropButton, typeSpin, uploadFile, waitSaved } from './helpers';

const PHOTO = resolve(process.cwd(), 'tests/fixtures/photo-wide-320x200.png');
const cropButton = (page: Page) => page.getByRole('button', { name: '裁剪图片', exact: true });
const cropDialog = (page: Page) => page.getByRole('dialog', { name: '裁剪图片', exact: true });
// 手机仍是旧工作台（「粒」），桌面是新编辑器的画布摘要（「颗」）。
const beads = (page: Page, count: number) => page.getByText(new RegExp(`共 ${count} (粒|颗)`)).first();

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
  await generateFromDialog(page);
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
  await expect(cropDialog(page)).toContainText('当前选区：320 × 200 像素');
  await cropDialog(page).getByRole('button', { name: '1:1', exact: true }).click();
  await cropDialog(page).getByRole('button', { name: '确认并更新' }).click();
  await expect(cropDialog(page)).toHaveCount(0);
  await expect(beads(page, 10000)).toBeAttached();
  await openRecrop(page);
  await expect(cropDialog(page)).toContainText('当前选区：200 × 200 像素');
  await page.keyboard.press('Escape');
  await waitSaved(page);

  // 刷新后从本机原图缓存自动接回，仍可重新裁剪。
  await page.reload();
  await expect(beads(page, 10000)).toBeAttached();
  await openRecrop(page);
  await expect(cropDialog(page)).toContainText('当前选区：200 × 200 像素');
  await page.keyboard.press('Escape');
  await expect(cropDialog(page)).toHaveCount(0);

  // 清掉本机原图缓存再刷新：如实提示缺原图，重新选图并取消会保留原图纸。
  await clearOriginalCache(page);
  await page.reload();
  await expect(beads(page, 10000)).toBeAttached();
  await expectNeedsOriginal(page);
  await page.getByLabel('原图文件选择器').setInputFiles(PHOTO);
  await expect(cropDialog(page)).toBeVisible();
  await cropDialog(page).getByRole('button', { name: '取消', exact: true }).click();
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
  test(`手机 ${width}px：触控入口、横屏、收缩视口和无障碍`, async ({ browser, browserName }, testInfo) => {
    const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width, height: 700 }, hasTouch: true });
    const page = await context.newPage();
    try {
      await start(page);
      await cropButton(page).tap();
      for (const size of [{ width, height: 700 }, { width: 700, height: width }, { width, height: 400 }]) {
        await page.setViewportSize(size);
        const dialog = cropDialog(page);
        // Firefox 的 DOMRect 会带 1e-6 级的亚像素误差（700.000004），按 CSS 像素比较。
        await expect.poll(async () => Math.round((await dialog.boundingBox())?.height ?? Number.NaN)).toBe(size.height);
        const layout = await dialog.evaluate((element) => ({
          viewport: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          modalZ: Number(getComputedStyle(element.parentElement!).zIndex),
          navigationZ: Number(getComputedStyle(document.querySelector('[data-slot=tabbar]')!).zIndex),
          buttons: [...element.querySelectorAll('button')].map((button) => {
            const { x, y, width, height } = button.getBoundingClientRect();
            return { x, y, width, height };
          }),
        }));
        expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewport);
        expect(layout.modalZ).toBeGreaterThan(layout.navigationZ);
        for (const button of layout.buttons) {
          expect(button.width).toBeGreaterThanOrEqual(44);
          expect(button.height).toBeGreaterThanOrEqual(44);
          expect(button.x).toBeGreaterThanOrEqual(0);
          expect(button.y).toBeGreaterThanOrEqual(0);
          expect(button.x + button.width).toBeLessThanOrEqual(size.width + 1);
          expect(button.y + button.height).toBeLessThanOrEqual(size.height + 1);
        }
        const canvas = page.getByLabel('裁剪选区画布');
        const box = await canvas.boundingBox();
        expect(box!.width / box!.height).toBeCloseTo(1.6, 1);
        expect(box!.height).toBeGreaterThan(44);
      }
      await page.setViewportSize({ width, height: 700 });
      await expect.poll(async () => Math.round((await cropDialog(page).boundingBox())?.height ?? Number.NaN)).toBe(700);
      if (browserName === 'chromium' && width === 350) {
        // 浏览器协议的原生指针输入（不是 DOM dispatchEvent）；仍非真机证据。
        // 这里用 Mouse 而不是 Touch：注入的 touch 拖拽会让 Chrome 之后不再为
        // tap 合成 click（实测取消/确认都点不动，弹窗与 inert 背景一起卡住），
        // 属于注入输入的怪癖而非产品缺陷——鼠标指针同样走 ImageCropper 的
        // pointer 协议，选区结果一致（224 × 140 × 320 × 200 两步都断言）。
        const client = await context.newCDPSession(page);
        const canvas = page.getByLabel('裁剪选区画布');
        const box = await canvas.evaluate(async (element) => {
          // 等 ResizeObserver 按新视口完成测量和绘制，再定位原生触点。
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          return element.getBoundingClientRect().toJSON() as { x: number; y: number; width: number; height: number };
        });
        const point = (x: number, y: number, id = 1) => ({ x: box.x + box.width * x, y: box.y + box.height * y, id });
        const dragWithPointer = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
          await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 });
          await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: to.x, y: to.y, button: 'left' });
          await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 });
        };
        await dragWithPointer(point(.99, .99), point(.7, .7));
        await expect(cropDialog(page)).toContainText('当前选区：224 × 140 像素');
        await cropDialog(page).getByRole('button', { name: '取消', exact: true }).tap();
        await expect(beads(page, 6300)).toBeVisible();
        await cropButton(page).tap({ timeout: 15000 });
        await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(.99, .99)] });
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(.8, .8)] });
        await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(.8, .8), point(.2, .2, 2)] });
        await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        await expect(cropDialog(page)).toContainText('当前选区：320 × 200 像素');
        await client.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.5 });
        await expect.poll(async () => page.evaluate(() => Math.abs(
          document.querySelector('[role="dialog"]')!.getBoundingClientRect().width - visualViewport!.width,
        ))).toBeLessThan(1);
        const visibleActions = await cropDialog(page).getByRole('button', { name: '确认并更新' }).evaluate((button) => {
          const rect = button.getBoundingClientRect();
          const view = visualViewport!;
          return rect.left >= view.offsetLeft && rect.right <= view.offsetLeft + view.width + 1
            && rect.top >= view.offsetTop && rect.bottom <= view.offsetTop + view.height + 1;
        });
        expect(visibleActions).toBe(true);
        await client.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
        await client.detach();
      }
      const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
      expect(results.violations.filter((entry) => ['critical', 'serious'].includes(entry.impact ?? ''))).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`crop-${width}.png`) });
      await cropDialog(page).getByRole('button', { name: '1:1', exact: true }).tap();
      await cropDialog(page).getByRole('button', { name: '确认并更新' }).tap();
      await expect(beads(page, 10000)).toBeVisible();
    } finally { await context.close(); }
  });
}
