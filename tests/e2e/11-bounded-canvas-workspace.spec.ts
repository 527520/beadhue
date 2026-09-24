/**
 * 编辑/跟拼有界画布的真实浏览器回归：
 * - 手机编辑器（票 09）是 100dvh 固定工作区，与桌面同一个画布；
 * - 200×200 图纸的 Canvas 后备缓冲区仍以视窗而非整图分配；
 * - Playwright 的 iPhone / Pixel 设备模拟都能落笔（精准模式 / 连续绘制）；跟拼浏览与拖动零写入，标记短点可标记且可撤销；
 * - 三浏览器桌面 944/1280/1440px 下编辑与跟拼都不会撑宽页面。
 */
import { writeFile } from 'node:fs/promises';
import { devices, expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { resolve } from 'node:path';
import { BASE_URL, modeButton, uploadAndGenerate, waitSaved } from './helpers';

const PHOTO = resolve(process.cwd(), 'tests/fixtures/static-2x2.png');
const FIXED_TIME = '2026-08-30T00:00:00.000Z';

function project(width: number, height: number) {
  const colors = [
    { code: 'A01', hex: '#F35B78' },
    { code: 'ZG6', hex: '#6752A3' },
  ];
  return {
    format: 'beadhue-project',
    version: 3,
    engineVersion: '2.0.0',
    boardProfile: '5mm-29',
    name: `有界画布-${width}x${height}`,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    paletteSelection: { palette: { kind: 'custom', colors }, kitTier: 0 },
    params: {
      targetWidth: width,
      targetColorCount: colors.length,
      dithering: false,
      mode: 'dominant',
      brightness: 0,
      contrast: 0,
      backgroundRemoval: false,
      bgTolerance: 8,
    },
    pattern: {
      width,
      height,
      cells: Array.from({ length: width * height }, (_, index) => ({
        ...colors[index % colors.length],
        transparent: false,
      })),
    },
  };
}

async function importProject(page: Page, width: number, height: number, testInfo: TestInfo): Promise<void> {
  const value = project(width, height);
  // 大图纸 JSON 通过真实文件路径交给浏览器，避免 WebKit 偶发卡在把数 MB
  // 内存 payload 复制进子进程的协议步骤；这也更接近用户实际导入文件的路径。
  const projectPath = testInfo.outputPath(`bounded-canvas-${width}x${height}.beadhue.json`);
  await writeFile(projectPath, JSON.stringify(value), 'utf8');
  await page.getByLabel('项目文件选择器').setInputFiles(projectPath);
  // 手机顶栏没有设计名输入框：用页面标题核对导入的是这一份。
  await expect(page).toHaveTitle(new RegExp(value.name));
  await expect(page.getByText(new RegExp(`共 ${width * height} 颗`)).first()).toBeAttached();
}

async function enterWorkbenchWithProject(page: Page, testInfo: TestInfo, width = 200, height = 200): Promise<void> {
  await page.goto('/app');
  await uploadAndGenerate(page, PHOTO);
  await expect(page.getByRole('status').filter({ hasText: '图纸已生成' })).toBeAttached({ timeout: 20_000 });
  await importProject(page, width, height, testInfo);
}

async function expectNoDocumentOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    overflowers: Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          tag: element.tagName.toLowerCase(),
          id: element.id,
          className: typeof element.className === 'string' ? element.className : '',
          left: Math.round(rect.left * 10) / 10,
          right: Math.round(rect.right * 10) / 10,
          width: Math.round(rect.width * 10) / 10,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          display: style.display,
          minWidth: style.minWidth,
          overflowX: style.overflowX,
          flexShrink: style.flexShrink,
        };
      })
      .filter((entry) => entry.right > document.documentElement.clientWidth + 0.5)
      .slice(0, 20),
  }));
  expect(
    dimensions.scrollWidth,
    `横向越界节点：${JSON.stringify(dimensions.overflowers, null, 2)}`,
  ).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function expectViewportSizedBacking(canvas: Locator, page: Page): Promise<void> {
  await expect(canvas).toBeVisible();
  // webkit 的 ResizeObserver 回调可能晚于首帧绘制，后备缓冲会短暂停留在收缩前的
  // 尺寸（本地 GPU 环境通常一帧收敛，CI 软件渲染更慢）；先轮询等缓冲与 CSS 尺寸
  // 收敛再取包围盒，避免把中间帧误判为「整图分配」。
  await expect.poll(async () => {
    const g = await canvas.evaluate((element) => {
      const target = element as HTMLCanvasElement;
      const rect = target.getBoundingClientRect();
      return {
        cssWidth: rect.width,
        cssHeight: rect.height,
        backingWidth: target.width,
        backingHeight: target.height,
        dpr: window.devicePixelRatio,
      };
    });
    if (g.cssWidth <= 0 || g.cssHeight <= 0) return Infinity;
    // 绘制层把高 DPR 设备限制为 2，避免手机创建过大的后备缓冲区。
    const renderDpr = Math.min(2, g.dpr);
    return Math.max(
      Math.abs(g.backingWidth - Math.floor(g.cssWidth * renderDpr)),
      Math.abs(g.backingHeight - Math.floor(g.cssHeight * renderDpr)),
    );
  }, { timeout: 10_000, message: '画布后备缓冲未收敛到视窗尺寸' }).toBeLessThanOrEqual(4);

  const geometry = await canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    const rect = target.getBoundingClientRect();
    return {
      cssWidth: rect.width,
      cssHeight: rect.height,
      backingWidth: target.width,
      backingHeight: target.height,
      dpr: window.devicePixelRatio,
    };
  });
  expect(geometry.cssWidth).toBeGreaterThan(0);
  expect(geometry.cssHeight).toBeGreaterThan(0);
  // 200×200 若按最低 20 CSS px/格分配会至少达到 4000×4000；这里必须明显小于整图。
  expect(geometry.backingWidth).toBeLessThan(4000 * geometry.dpr);
  expect(geometry.backingHeight).toBeLessThan(4000 * geometry.dpr);
  expect(geometry.backingWidth).toBeLessThanOrEqual(await page.evaluate(() => Math.ceil(innerWidth * devicePixelRatio) + 4));
}

async function dispatchTouchDrag(canvas: Locator): Promise<void> {
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const start = { x: box!.x + box!.width * 0.45, y: box!.y + box!.height * 0.45 };
  const end = { x: start.x + Math.min(70, box!.width * 0.25), y: start.y + 45 };
  await canvas.dispatchEvent('pointerdown', {
    pointerId: 71,
    pointerType: 'touch',
    isPrimary: true,
    buttons: 1,
    clientX: start.x,
    clientY: start.y,
  });
  await canvas.dispatchEvent('pointermove', {
    pointerId: 71,
    pointerType: 'touch',
    isPrimary: true,
    buttons: 1,
    clientX: end.x,
    clientY: end.y,
  });
  await canvas.dispatchEvent('pointerup', {
    pointerId: 71,
    pointerType: 'touch',
    isPrimary: true,
    buttons: 0,
    clientX: end.x,
    clientY: end.y,
  });
}

async function tapCanvasOffset(page: Page, canvas: Locator, xOffset = 0): Promise<void> {
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.touchscreen.tap(box!.x + box!.width / 2 + xOffset, box!.y + box!.height / 2);
}

async function dispatchEditorTouchAim(
  canvas: Locator,
  startXOffset: number,
  endXOffset: number,
  pointerUpXOffset = endXOffset,
): Promise<void> {
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const centerX = box!.x + box!.width / 2;
  const centerY = box!.y + box!.height / 2 + 5;
  const common = { pointerId: 72, pointerType: 'touch', isPrimary: true };
  await canvas.dispatchEvent('pointerdown', {
    ...common,
    buttons: 1,
    clientX: centerX + startXOffset,
    clientY: centerY,
  });
  await canvas.dispatchEvent('pointermove', {
    ...common,
    buttons: 1,
    clientX: centerX + endXOffset,
    clientY: centerY,
  });
  await canvas.dispatchEvent('pointerup', {
    ...common,
    buttons: 0,
    clientX: centerX + pointerUpXOffset,
    clientY: centerY,
  });
}

async function exerciseMobileWorkspace(page: Page, testInfo: TestInfo): Promise<void> {
  await enterWorkbenchWithProject(page, testInfo);
  await expectNoDocumentOverflow(page);
  const editCanvas = page.getByLabel(/^图纸编辑画布/);
  await expectViewportSizedBacking(editCanvas, page);
  const tools = page.getByRole('toolbar', { name: '工具' });
  const undo = page.getByRole('button', { name: '撤销', exact: true });
  await expect(undo).toBeDisabled();

  // 精准模式（D5）：拖动只对准，松手才改最终格；橡皮擦掉任一有色格都是真实改动。
  await tools.getByRole('button', { name: '橡皮', exact: true }).click();
  await dispatchEditorTouchAim(editCanvas, 0, 20, 0);
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(undo).toBeDisabled();

  // 连续绘制要在画笔浮层里显式打开。
  await tools.getByRole('button', { name: '画笔', exact: true }).click();
  await tools.getByRole('button', { name: '画笔', exact: true }).click();
  const continuous = page.getByRole('menuitemcheckbox', { name: /连续绘制/ });
  await continuous.click();
  await expect(continuous).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await tools.getByRole('button', { name: '橡皮', exact: true }).click();
  await dispatchEditorTouchAim(editCanvas, 0, 70);
  await expect(undo).toBeEnabled();
  await undo.click();

  // 跟拼：手机默认浏览，拖动与轻点都不写进度；切到标记后短点标一格，顶栏撤销可立即撤回。
  await modeButton(page, '跟拼').click();
  const stitchCanvas = page.getByLabel(/^跟拼画布：200 × 200 格/);
  await expectViewportSizedBacking(stitchCanvas, page);
  await expect(page.getByRole('button', { name: '浏览', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dispatchTouchDrag(stitchCanvas);
  await tapCanvasOffset(page, stitchCanvas);
  await expect(undo).toBeDisabled();
  await expectNoDocumentOverflow(page);
  await page.getByRole('button', { name: '标记', exact: true }).click();
  await dispatchTouchDrag(stitchCanvas);
  await expect(undo).toBeDisabled();
  await tapCanvasOffset(page, stitchCanvas);
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(undo).toBeDisabled();
  expect(new URL(page.url()).pathname).toBe('/app');
}

test('[设备模拟] iPhone 13 390×844 可绘制、跟拼标记/撤销并安全返回', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'webkit');
  // CI 的 webkit 跑在软件渲染上，200×200 图纸导入 + 编辑/跟拼双画布渲染
  // 明显慢于本地 GPU 环境（本地约 7s，CI 可超过 110s），默认 120s 会在收尾时被顶爆。
  test.setTimeout(240_000);
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    viewport: { width: 390, height: 844 },
    baseURL: BASE_URL,
  });
  try {
    const page = await context.newPage();
    await exerciseMobileWorkspace(page, testInfo);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
  } finally {
    await context.close();
  }
});

test('[设备模拟] Pixel 7 412×915 可绘制、跟拼标记/撤销并安全返回', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium');
  test.setTimeout(240_000);
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    viewport: { width: 412, height: 915 },
    baseURL: BASE_URL,
  });
  try {
    const page = await context.newPage();
    await exerciseMobileWorkspace(page, testInfo);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
  } finally {
    await context.close();
  }
});

test('29×29、58×58、100×63 在桌面 944/1280/1440px 保持有界且不撑宽页面', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 944, height: 800 });
  await enterWorkbenchWithProject(page, testInfo, 29, 29);

  for (const [width, patternWidth, patternHeight] of [
    [944, 29, 29],
    [1280, 58, 58],
    [1440, 100, 63],
  ] as const) {
    await page.setViewportSize({ width, height: 800 });
    // 颗数摘要属于编辑画布，先回编辑模式再导入。
    await modeButton(page, '编辑').click();
    if (patternWidth !== 29 || patternHeight !== 29) {
      await importProject(page, patternWidth, patternHeight, testInfo);
    }
    await expectViewportSizedBacking(page.getByLabel(/^图纸编辑画布/), page);
    await expectNoDocumentOverflow(page);

    await modeButton(page, '跟拼').click();
    await expectViewportSizedBacking(page.getByLabel(new RegExp(`^跟拼画布：${patternWidth} × ${patternHeight} 格`)), page);
    await expectNoDocumentOverflow(page);
  }
});

test('手机直接打开 ?mode=stitch 进入跟拼：默认浏览、进度胶囊与底栏在视口内', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await enterWorkbenchWithProject(page, testInfo, 29, 29);
  await waitSaved(page);
  const direct = new URL(page.url()); direct.searchParams.set('mode', 'stitch');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(direct.toString());
  await expect(modeButton(page, '跟拼')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '浏览', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const capsule = page.getByRole('button', { name: /^0%\s*第 1 块板 · 第 1 行/ });
  await expect(capsule).toBeVisible();
  const complete = page.getByRole('button', { name: '完成本行', exact: true });
  await expect(complete).toBeInViewport();
  await complete.click();
  const advanced = page.getByRole('button', { name: /^3%\s*第 1 块板 · 第 2 行/ });
  await expect(advanced).toBeVisible();
  await advanced.click();
  const sheet = page.getByRole('dialog', { name: '跟拼进度' });
  await expect(sheet.getByRole('button', { name: '第 1 块板，已拼 3%' })).toBeVisible();
  await expectNoDocumentOverflow(page);
});
