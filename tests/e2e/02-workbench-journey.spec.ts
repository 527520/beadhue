/**
 * E2E 核心旅程 2：工作台（spec §F1–F5、§F7）。
 * 上传 → 整图自动生成 → 参数调整 → 悬停格信息 → 编辑 → 导出三格式 → 自动保存 → 刷新恢复（票 08 起为新编辑器）。
 */
import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { beadsText, chooseEditorMenu, openPanelTab, typeSpin, uploadAndGenerate, waitSaved } from './helpers';

const PHOTO = resolve(process.cwd(), 'tests/fixtures/photo-gradient-64.png');
const WIDTH = '自定义宽度（格）';

test('照片 → 生成 → 编辑 → 导出三格式 → 本地保存与恢复', async ({ page }) => {
  // 应用侧的 perfMark 只在 window.__beadhuePerfMarks 已存在时才记录（生产零开销）。
  // 必须在导航前就建好数组：取消点击发生在本用例靠前的位置，晚于此的初始化会让
  // 「同步成本细分」拿不到任何标记（CI 上就出现过 flushSync=null abort=null，
  // 白白浪费一轮排查）。
  await page.addInitScript(() => {
    (window as Window & { __beadhuePerfMarks?: Array<{ name: string; at: number }> }).__beadhuePerfMarks = [];
  });
  await page.goto('/app');
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  // 新建图纸弹窗：默认全图、默认宽度，直接生成
  await uploadAndGenerate(page, PHOTO);

  // 编辑器：生成图纸（默认宽度 100 → 100×100）
  await expect(page.getByText(beadsText()).first()).toBeAttached({ timeout: 20_000 });

  // 调整页：宽度改为 20 → 重新生成 20×20=400 颗
  await openPanelTab(page, '调整');
  const widthInput = page.getByRole('spinbutton', { name: WIDTH });
  const regenerateButton = page.getByRole('button', { name: '重新生成', exact: true });
  await typeSpin(page, WIDTH, '20');
  await regenerateButton.click();
  await expect(page.getByText(beadsText(400)).first()).toBeAttached({ timeout: 20_000 });

  // 持久 Worker + SharedArrayBuffer 协作式取消：生成期间编辑 / 导出 / 分享锁定，
  // 取消后恢复到上一个已提交快照。
  const cancelBtn = page.getByRole('button', { name: '取消', exact: true });
  await page.getByRole('switch', { name: '抖动' }).check();
  await typeSpin(page, WIDTH, '200');
  // 热服务器上生成可能赶在观察器建立前就完成（「取消」按钮从未出现）——给观察
  // 一个截止时间，超时按「跳过取消断言」处理，绝不让用例挂满 120s。
  // 取消门禁只考核「点击那一刻发生了什么」：cancel.click() 返回时按钮是否已离开 DOM、这次同步调用花了多久。
  const cancellation = page.evaluate(() => new Promise<
    {
      widthDisabled: boolean;
      exportDisabled: boolean;
      shareDisabled: boolean;
      cancelUiMs: number;
      handlerMs: number;
      goneSynchronously: boolean;
      flushSyncMs: number | null;
      abortMs: number | null;
    }
    | { skipped: true }
  >((resolve) => {
    let settled = false;
    const observer = new MutationObserver(() => void inspect());
    const deadline = setTimeout(() => finish({ skipped: true }), 8_000);
    const finish = (result: {
      widthDisabled: boolean;
      exportDisabled: boolean;
      shareDisabled: boolean;
      cancelUiMs: number;
      handlerMs: number;
      goneSynchronously: boolean;
      flushSyncMs: number | null;
      abortMs: number | null;
    } | { skipped: true }): void => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      observer.disconnect();
      resolve(result);
    };
    const inspect = (): void => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const cancel = buttons.find((button) => button.textContent?.trim() === '取消');
      if (!cancel) return;
      const width = document.querySelector<HTMLInputElement>('input[aria-label="自定义宽度（格）"]');
      const exporter = buttons.find((button) => button.textContent?.trim() === '导出');
      const share = buttons.find((button) => button.getAttribute('aria-label') === '分享');
      const observed = {
        // 参数输入被外层 fieldset 锁住。
        widthDisabled: Boolean(width?.matches(':disabled')),
        exportDisabled: Boolean(exporter?.disabled),
        shareDisabled: Boolean(share?.disabled),
      };
      const startedAt = performance.now();
      cancel.click();
      const handlerMs = performance.now() - startedAt;
      const goneSynchronously = !document.body.contains(cancel);
      const marks = (window as Window & { __beadhuePerfMarks?: Array<{ name: string; at: number }> }).__beadhuePerfMarks ?? [];
      const at = (name: string): number | null => {
        const hit = [...marks].reverse().find((mark) => mark.name === name);
        return hit ? hit.at : null;
      };
      const handlerAt = at('workbench-cancel-handler');
      const unmountedAt = at('workbench-cancel-unmounted');
      const abortStartAt = at('workbench-cancel-abort-start');
      const abortEndAt = at('workbench-cancel-abort-end');
      const breakdown = {
        flushSyncMs: handlerAt !== null && unmountedAt !== null ? Math.round((unmountedAt - handlerAt) * 10) / 10 : null,
        abortMs: abortStartAt !== null && abortEndAt !== null ? Math.round((abortEndAt - abortStartAt) * 10) / 10 : null,
      };
      if (goneSynchronously) {
        finish({ ...observed, cancelUiMs: handlerMs, handlerMs, goneSynchronously, ...breakdown });
        return;
      }
      const removal = new MutationObserver(() => {
        if (document.body.contains(cancel)) return;
        removal.disconnect();
        finish({ ...observed, cancelUiMs: performance.now() - startedAt, handlerMs, goneSynchronously: false, ...breakdown });
      });
      removal.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        removal.disconnect();
        finish({ ...observed, cancelUiMs: performance.now() - startedAt, handlerMs, goneSynchronously: false, ...breakdown });
      }, 5_000);
    };
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    inspect();
  }));
  await regenerateButton.click();
  const cancelled = await cancellation;
  if ('skipped' in cancelled) {
    // 生成太快没赶上取消 UI：把宽度改回 20 后继续后续断言（取消协议已由单测精确覆盖）。
    await typeSpin(page, WIDTH, '20');
    await regenerateButton.click();
    await expect(page.getByText(beadsText(400)).first()).toBeAttached({ timeout: 20_000 });
  } else {
    const measured = `handlerMs=${cancelled.handlerMs.toFixed(1)} flushSync=${cancelled.flushSyncMs} abort=${cancelled.abortMs} 同步卸载=${cancelled.goneSynchronously}`;
    expect(cancelled, measured).toEqual(expect.objectContaining({ widthDisabled: true, exportDisabled: true, shareDisabled: true }));
    // 契约一：点击处理器返回时按钮已经离开 DOM（不是等下一轮提交才消失）。
    expect(cancelled.goneSynchronously, `取消按钮必须在点击处理器内同步卸载（${measured}）`).toBe(true);
    // 契约二：点击处理器总耗时要留在预算内（<100ms）。
    expect(cancelled.handlerMs, `取消点击处理器应在 100ms 内返回（${measured}）`).toBeLessThan(100);
    await expect(cancelBtn).toBeHidden({ timeout: 1_000 });
    await expect(widthInput).toHaveValue('20');
    await expect(widthInput).toBeEnabled();
    await expect(page.getByText(beadsText(400)).first()).toBeAttached();
  }

  // latest-only 任务协议的乱序在单测精确覆盖；浏览器这里验证取消后可再生成。
  // 颜色数滑杆：Home 到最小 2 色。
  const colorsSlider = page.getByRole('slider', { name: '颜色数' });
  // 重启门禁只看应用自己的时间戳：从「生成开始」到「新图纸提交」两个标记之差。
  await page.evaluate(() => {
    (window as Window & { __beadhuePerfMarks?: Array<{ name: string; at: number }> }).__beadhuePerfMarks = [];
  });
  await colorsSlider.focus();
  await colorsSlider.press('Home');
  await regenerateButton.click();
  await expect(page.getByText(/共 400 颗 · 2 种颜色/).first()).toBeAttached({ timeout: 20_000 });
  const restartLatency = await page.evaluate(() => {
    const marks = (window as Window & { __beadhuePerfMarks?: Array<{ name: string; at: number }> }).__beadhuePerfMarks ?? [];
    const start = marks.filter((mark) => mark.name === 'workbench-generation-start').at(-1);
    const commit = marks.filter((mark) => mark.name === 'workbench-generation-commit').at(-1);
    return start && commit ? Math.round(commit.at - start.at) : null;
  });
  expect(restartLatency, `重生成应在 2s 内提交（null = 本次没触发重生成）`).not.toBeNull();
  expect(restartLatency).toBeLessThan(2_000);
  await typeSpin(page, WIDTH, '200');
  await regenerateButton.click();
  await expect(page.getByText(/共 40000 颗 · 2 种颜色/).first()).toBeAttached({ timeout: 20_000 });
  await typeSpin(page, WIDTH, '20');
  await regenerateButton.click();
  await expect(page.getByText(/共 400 颗 · 2 种颜色/).first()).toBeAttached({ timeout: 20_000 });

  // 版本化 Mini 色板会原子切换到兼容的 2.6mm / 50×50；随后改参数，
  // 确认真实生成链路使用新色板，而不是只在既有图纸上做一次重映射。
  await openPanelTab(page, '颜色');
  await page.getByRole('button', { name: /^色板：/ }).click();
  await page.getByRole('option', { name: /^优肯 Artkal C 197 色/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: '换色板', exact: true }).click();
  await expect(page.getByText(/制作规格已改为 2\.6mm \/ 50×50/).first()).toBeVisible();
  await openPanelTab(page, '调整');
  const specButton = page.getByRole('button', { name: /^制作规格：/ });
  await expect(specButton).toHaveAccessibleName('制作规格：2.6mm / 50×50');
  // Artkal 同时支持两种 Mini 底板；主旅程继续切到 52×52，覆盖该规格的
  // 生成、编辑、PNG/PDF/项目导出、保存和刷新恢复完整链路。
  await specButton.click();
  await page.getByRole('option', { name: /^2\.6mm \/ 52×52/ }).click();
  await expect(specButton).toHaveAccessibleName('制作规格：2.6mm / 52×52');
  await expect(page.getByText(/制作规格已改为 2\.6mm \/ 52×52/).first()).toBeVisible();
  await colorsSlider.focus();
  await colorsSlider.press('ArrowRight');
  await regenerateButton.click();
  await expect(page.getByText(/共 400 颗 · 3 种颜色/).first()).toBeAttached({ timeout: 20_000 });
  await colorsSlider.focus();
  await colorsSlider.press('Home');
  await regenerateButton.click();
  await expect(page.getByText(/共 400 颗 · 2 种颜色/).first()).toBeAttached({ timeout: 20_000 });

  // 悬停显示格信息：左下角提示「第 r 行 · 第 c 列 · 色号」（带重悬停重试，重绘可能吞掉首次 mousemove）。
  const editCanvas = page.getByLabel(/^图纸编辑画布/);
  await expect(async () => {
    const box = (await editCanvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByText(/^第 \d+ 行 · 第 \d+ 列 · /).first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await page.mouse.move(0, 0);

  // 编辑：同一光标格验证四种工具的 Enter 语义（方向键移光标，回车落笔）。
  await editCanvas.focus();
  await page.keyboard.press('ArrowRight');
  const cursorStatus = page.getByRole('status').filter({ hasText: /光标：第 1 行 第 2 列/ }).first();
  await expect(cursorStatus).toBeAttached();
  const cursorText = (await cursorStatus.textContent()) ?? '';
  const originalCode = cursorText.match(/· ([^（·]+)（回车落笔）/)?.[1]?.trim();
  expect(originalCode).toBeTruthy();

  const currentColor = page.getByRole('complementary', { name: '属性面板' }).getByText('当前色', { exact: true }).locator('..');
  await page.keyboard.press('i');
  await page.keyboard.press('Enter');
  await openPanelTab(page, '颜色');
  await expect(currentColor).toContainText(originalCode!);

  await editCanvas.focus();
  await page.keyboard.press('e');
  await page.keyboard.press('Enter');
  await expect(page.getByText(beadsText(399)).first()).toBeAttached();

  await page.keyboard.press('g');
  await page.keyboard.press('Enter');
  await expect(page.getByText(beadsText(400)).first()).toBeAttached();

  const swatches = page.getByRole('group', { name: '全部颜色' }).getByRole('button');
  const swatchCount = await swatches.count();
  let keyboardBrushCode = '';
  for (let index = 0; index < swatchCount; index += 1) {
    const code = (await swatches.nth(index).getAttribute('aria-label'))?.split(' ')[0] ?? '';
    if (code && code !== originalCode) {
      keyboardBrushCode = code;
      await swatches.nth(index).click();
      break;
    }
  }
  expect(keyboardBrushCode).toBeTruthy();
  await editCanvas.focus();
  await page.keyboard.press('b');
  await page.keyboard.press('Enter');
  await expect(cursorStatus).toContainText(`· ${keyboardBrushCode}（回车落笔）`);

  // 导出 PNG：导出菜单 → 下载 PNG 弹窗 → 下载。
  await chooseEditorMenu(page, '导出', '下载 PNG…');
  const [pngDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('dialog', { name: '下载 PNG' }).getByRole('button', { name: '下载', exact: true }).click(),
  ]);
  expect(pngDownload.suggestedFilename()).toMatch(/^豆色绘-.*\.png$/);
  const pngPath = await pngDownload.path();
  expect(readFileSync(pngPath!).length).toBeGreaterThan(1000);

  // 打印 PDF：弹窗说明页数与打印比例 → 下载 PDF。
  await chooseEditorMenu(page, '导出', '打印 PDF…');
  const [pdfDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('dialog', { name: '打印 PDF' }).getByRole('button', { name: '下载 PDF', exact: true }).click(),
  ]);
  expect(pdfDownload.suggestedFilename()).toMatch(/\.pdf$/);
  const pdfPath = await pdfDownload.path();
  expect(readFileSync(pdfPath!).subarray(0, 4).toString('latin1')).toBe('%PDF');

  // 导出项目文件
  await page.getByRole('button', { name: '导出', exact: true }).click();
  const [projectDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /导出项目文件/ }).click(),
  ]);
  expect(projectDownload.suggestedFilename()).toMatch(/\.json$/);
  const projectPath = await projectDownload.path();
  const project = JSON.parse(readFileSync(projectPath!, 'utf8'));
  expect(project.format).toBe('beadhue-project');
  expect(project.boardProfile).toBe('2.6mm-52');
  expect(project.paletteSelection.kitTier).toBe(0);
  expect(project.paletteSelection.palette.kind).toBe('builtin');
  expect(project.paletteSelection.palette.brand).toMatch(/^pcd:artkal-c-197-official@/);
  expect(project.pattern.width).toBe(20);
  expect(project.pattern.cells[1].code).toBe(keyboardBrushCode);

  // 自动保存后刷新恢复
  await waitSaved(page);
  await page.reload();
  await expect(page.getByLabel('设计名称').first()).toBeVisible();
  await expect(page.getByText(beadsText(400)).first()).toBeAttached({ timeout: 20_000 });
  await openPanelTab(page, '颜色');
  await expect(page.getByRole('button', { name: /^色板：/ })).toHaveAccessibleName(/^色板：优肯 Artkal C 197 色/);
  await openPanelTab(page, '调整');
  await expect(page.getByRole('button', { name: /^制作规格：/ })).toHaveAccessibleName('制作规格：2.6mm / 52×52');
  const restoredWidth = page.getByRole('spinbutton', { name: WIDTH });
  await expect(restoredWidth).toBeEnabled();
  await typeSpin(page, WIDTH, '21');
  await page.getByRole('button', { name: '重新生成', exact: true }).click();
  await expect(page.getByText(beadsText(441)).first()).toBeAttached({ timeout: 20_000 });
});
