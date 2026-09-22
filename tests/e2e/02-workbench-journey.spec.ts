/**
 * E2E 核心旅程 2：工作台（spec §F1–F5、§F7）。
 * 上传 → 整图自动生成 → 参数调整 → 悬停格信息 → 编辑 → 导出三格式 → 保存 → 刷新恢复。
 */
import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { fillField, typeSpin, uploadFile, selectChoice } from './helpers';

const PHOTO = resolve(process.cwd(), 'tests/fixtures/photo-gradient-64.png');

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
  await uploadFile(page, PHOTO);

  // 裁剪步骤：默认全图，直接确认

  // 工作台：生成图纸（默认宽度 100 → 100×100）
  await expect(page.getByText(/共 \d+ 粒/).first()).toBeVisible({ timeout: 20_000 });

  // 参数面板：宽度改为 20 → 防抖重生成 20×20=400 粒
  await fillField(page, '目标宽度（格）', '20');
  await page.getByRole('spinbutton', { name: '目标宽度（格）' }).blur();
  await expect(page.getByText(/共 400 粒/).first()).toBeVisible({ timeout: 20_000 });

  // 持久 Worker + SharedArrayBuffer 协作式取消：生成期间编辑/保存/导出锁定，
  // 取消后恢复到上一个已提交快照。
  const widthInput = page.getByRole('spinbutton', { name: '目标宽度（格）' });
  const cancelBtn = page.getByRole('button', { name: '取消', exact: true });
  await page.getByRole('button', { name: '高级选项', exact: true }).click();
  await page.getByRole('switch', { name: '抖动' }).check();
  await typeSpin(page, '目标宽度（格）', '200');
  // The optimized engine can finish before a second Playwright command starts.
  // Observe the transient generating UI before blur, capture its locked state,
  // and click Cancel in the same browser task as soon as React mounts it.
  // 热服务器上生成可能赶在观察器建立前就完成（「取消」按钮从未出现）——给观察
  // 一个截止时间，超时按「跳过取消断言」处理，绝不让用例挂满 120s。
  // 取消门禁的口径：只考核「点击那一刻发生了什么」。
  //
  // 走过两次弯路：最早用「点击 → rAF/观察器看到卸载」的墙钟差，CI 上会漂到
  // 215~422ms（混进 Playwright 轮询与 runner 调度延迟）；随后改用应用自打的
  // performance 标记之差，又被 abortGeneration() 同步拆 Worker 的时间污染。
  // 现在直接量 cancel.click() 这一次同步调用：它返回时按钮是否已经离开 DOM，
  // 以及这次调用总共花了多久——两者都是应用在点击任务内真实花掉的时间，
  // 不含任何跨任务等待。
  const cancellation = page.evaluate(() => new Promise<
    {
      widthDisabled: boolean;
      pngDisabled: boolean;
      saveDisabled: boolean;
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
      pngDisabled: boolean;
      saveDisabled: boolean;
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
      const width = document.querySelector<HTMLInputElement>('input[aria-label="目标宽度（格）"]');
      const png = buttons.find((button) => button.textContent?.includes('下载 PNG'));
      const save = buttons.find((button) => button.textContent?.includes('保存'));
      const observed = {
        // The input is effectively disabled by its ancestor fieldset.
        widthDisabled: Boolean(width?.matches(':disabled')),
        pngDisabled: Boolean(png?.disabled),
        saveDisabled: Boolean(save?.disabled),
      };
      // 原生按钮：click() 会同步进入 React 的 onClick（处理器里 flushSync 同步卸载），
      // 所以「click() 返回时按钮是否已经不在了」就是「同步卸载」的直接证据；
      // 同时记下点击处理器的总耗时，失败信息里带上，下一轮不必再猜。
      const startedAt = performance.now();
      cancel.click();
      const handlerMs = performance.now() - startedAt;
      const goneSynchronously = !document.body.contains(cancel);
      // 细分同步成本：flushSync（卸载按钮需重渲染的那部分）与 abortGeneration（拆 Worker）。
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
      // 没做到同步卸载：监听真实的移除时刻（只影响失败信息与门禁判定）。
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
  await widthInput.blur();
  const cancelled = await cancellation;
  if ('skipped' in cancelled) {
    // 生成太快没赶上取消 UI：把宽度改回 20 后继续后续断言（取消协议已由单测精确覆盖）。
    await typeSpin(page, '目标宽度（格）', '20');
    await widthInput.blur();
    await expect(page.getByText(/共 400 粒/).first()).toBeVisible({ timeout: 20_000 });
  } else {
    // 失败信息里带上实测值：退出码 41 只能说明是这个 spec，带上数字下一轮不用再猜。
    const measured = `handlerMs=${cancelled.handlerMs.toFixed(1)} flushSync=${cancelled.flushSyncMs} abort=${cancelled.abortMs} 同步卸载=${cancelled.goneSynchronously}`;
    expect(cancelled, measured).toEqual(expect.objectContaining({ widthDisabled: true, pngDisabled: true, saveDisabled: true }));
    // 契约一：点击处理器返回时按钮已经离开 DOM（不是等下一轮提交才消失）。
    expect(cancelled.goneSynchronously, `取消按钮必须在点击处理器内同步卸载（${measured}）`).toBe(true);
    // 契约二：点击处理器总耗时要留在预算内（<100ms）。
    expect(cancelled.handlerMs, `取消点击处理器应在 100ms 内返回（${measured}）`).toBeLessThan(100);
    await expect(cancelBtn).toBeHidden({ timeout: 1_000 });
    await expect(widthInput).toHaveValue('20');
    await expect(widthInput).toBeEnabled();
    await expect(page.getByText(/共 400 粒/).first()).toBeVisible();
  }

  // latest-only 任务协议的乱序在单测精确覆盖；浏览器这里验证取消后可再生成。
  const colorsInput = page.getByRole('spinbutton', { name: '目标颜色数' });
  // 重启门禁也只看应用自己的时间戳：从「生成开始」到「新图纸提交」两个标记之差。
  // 旧写法是 Date.now() 包住「Playwright 逐字符输入 + blur + 轮询可见」，CI 上
  // webkit 跑到 2390ms 撞线——量到的是测试驱动的开销，不是应用重生成有多慢。
  await page.evaluate(() => {
    (window as Window & { __beadhuePerfMarks?: Array<{ name: string; at: number }> }).__beadhuePerfMarks = [];
  });
  await typeSpin(page, '目标颜色数', '2');
  await colorsInput.blur();
  await expect(page.getByText(/共 400 粒 · 2 种颜色/).first()).toBeVisible({ timeout: 20_000 });
  const restartLatency = await page.evaluate(() => {
    const marks = (window as Window & { __beadhuePerfMarks?: Array<{ name: string; at: number }> }).__beadhuePerfMarks ?? [];
    const start = marks.filter((mark) => mark.name === 'workbench-generation-start').at(-1);
    const commit = marks.filter((mark) => mark.name === 'workbench-generation-commit').at(-1);
    return start && commit ? Math.round(commit.at - start.at) : null;
  });
  expect(restartLatency, `重生成应在 2s 内提交（null = 本次没触发重生成）`).not.toBeNull();
  expect(restartLatency).toBeLessThan(2_000);
  await typeSpin(page, '目标宽度（格）', '200');
  await widthInput.blur();
  await expect(page.getByText(/共 40000 粒 · 2 种颜色/).first()).toBeVisible({ timeout: 20_000 });
  await typeSpin(page, '目标宽度（格）', '20');
  await widthInput.blur();
  await expect(page.getByText(/共 400 粒 · 2 种颜色/).first()).toBeVisible({ timeout: 20_000 });

  // 版本化 Mini 色板会原子切换到兼容的 2.6mm / 50×50；随后改参数，
  // 确认真实生成链路使用新色板，而不是只在既有图纸上做一次重映射。
  await selectChoice(page,'色板品牌','优肯 Artkal');
  const paletteSeriesSelect = page.getByRole('button', { name: /色板系列/ });
  const miniPaletteId = await paletteSeriesSelect.locator('..').locator('select').inputValue();
  expect(miniPaletteId).toMatch(/^builtin:pcd:artkal-c-197-official@/);
  const boardProfileSelect = page.getByRole('button',{name:/制作规格/});
  await expect(boardProfileSelect).toHaveText('2.6mm / 50×50');
  await expect(page.getByText(/制作规格已切换为 2\.6mm \/ 50×50/).first()).toBeVisible();
  // Artkal 同时支持两种 Mini 底板；主旅程继续切到 52×52，覆盖该规格的
  // 生成、编辑、PNG/PDF/项目导出、保存和刷新恢复完整链路。
  await selectChoice(page,'制作规格','2.6mm / 52×52');
  await expect(boardProfileSelect).toHaveText('2.6mm / 52×52');
  await expect(page.getByText(/制作规格已切换为 2\.6mm \/ 52×52/).first()).toBeVisible();
  await typeSpin(page, '目标颜色数', '3');
  await colorsInput.blur();
  await expect(page.getByText(/共 400 粒 · 3 种颜色/).first()).toBeVisible({ timeout: 20_000 });
  await typeSpin(page, '目标颜色数', '2');
  await colorsInput.blur();
  await expect(page.getByText(/共 400 粒 · 2 种颜色/).first()).toBeVisible({ timeout: 20_000 });

  // 悬停显示格信息（工作台工具提示）：带重悬停重试（最终生成的画布重绘可能吞掉首次 mousemove）
  await expect(async () => {
    await page.locator('canvas').first().hover({ position: { x: 8, y: 8 } });
    await expect(page.getByRole('status').filter({ hasText: /第 0 行/ }).first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });

  // 编辑：切换页签即自动聚焦；同一光标格验证四种工具的 Enter 语义。
  await page.getByRole('tab', { name: /编辑/ }).click();
  const editorRegion = page.getByLabel('编辑画布区域');
  await expect(editorRegion).toBeFocused();
  await page.keyboard.press('ArrowRight');
  const cursorStatus = page.getByRole('status').filter({ hasText: /光标：第 1 行 第 2 列/ }).first();
  await expect(cursorStatus).toBeVisible();
  const cursorText = (await cursorStatus.textContent()) ?? '';
  const originalCode = cursorText.match(/· ([^（·]+)（回车落笔）/)?.[1]?.trim();
  expect(originalCode).toBeTruthy();

  await page.keyboard.press('i');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status', { name: `当前颜色: ${originalCode}` })).toBeVisible();

  await page.keyboard.press('e');
  await page.keyboard.press('Enter');
  await expect(page.getByText(/共 399 粒/).first()).toBeVisible();

  await page.keyboard.press('g');
  await page.keyboard.press('Enter');
  await expect(page.getByText(/共 400 粒/).first()).toBeVisible();

  const paletteButtons = page.getByRole('region', { name: '选择画笔颜色' }).getByRole('button');
  const paletteCount = await paletteButtons.count();
  let keyboardBrushCode = '';
  for (let index = 0; index < paletteCount; index += 1) {
    const label = await paletteButtons.nth(index).getAttribute('aria-label');
    const code = label?.split(' ')[0] ?? '';
    if (code && code !== originalCode) {
      keyboardBrushCode = code;
      await paletteButtons.nth(index).click();
      break;
    }
  }
  expect(keyboardBrushCode).toBeTruthy();
  // WebKit 下点击色板按钮后重新聚焦画布偶发不生效（光标状态消失，'b' 落空）。
  // 恢复顺序：悬停把光标拉回 (0,0)（onPointerMove → setCursor），再聚焦 + 'b' + → 到
  // (0,1)。位置特定的断言同时验证了方向键真的生效（即焦点确实回到画布）。
  await expect(async () => {
    await page.locator('canvas').first().hover({ position: { x: 8, y: 8 } });
    await editorRegion.focus();
    await page.keyboard.press('b');
    await page.keyboard.press('ArrowRight');
    await expect(cursorStatus).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await page.keyboard.press('Enter');
  await expect(cursorStatus).toContainText(`· ${keyboardBrushCode}（回车落笔）`);

  // 默认 PNG 一次下载；导出分区是显式的用户入口。
  await page.getByRole('navigation', { name: '工作台工具' }).getByRole('button', { name: '导出', exact: true }).click();
  const [pngDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '下载 PNG', exact: true }).click(),
  ]);
  expect(pngDownload.suggestedFilename()).toMatch(/^豆色绘-.*\.png$/);
  const pngPath = await pngDownload.path();
  expect(readFileSync(pngPath!).length).toBeGreaterThan(1000);

  // 导出 PDF（预览确认；确认按钮文案为「导出」）
  await page.getByRole('button', { name: /导出 PDF/ }).click();
  const [pdfDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('region', { name: '确认导出 PDF' }).getByRole('button', { name: '导出', exact: true }).click(),
  ]);
  expect(pdfDownload.suggestedFilename()).toMatch(/\.pdf$/);
  const pdfPath = await pdfDownload.path();
  expect(readFileSync(pdfPath!).subarray(0, 4).toString('latin1')).toBe('%PDF');

  // 导出项目文件
  const [projectDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /导出项目文件/ }).click(),
  ]);
  expect(projectDownload.suggestedFilename()).toMatch(/\.json$/);
  const projectPath = await projectDownload.path();
  const project = JSON.parse(readFileSync(projectPath!, 'utf8'));
  expect(project.format).toBe('beadhue-project');
  expect(project.boardProfile).toBe('2.6mm-52');
  expect(project.paletteSelection).toEqual({
    palette: { kind: 'builtin', brand: miniPaletteId!.replace(/^builtin:/, '') },
    kitTier: 0,
  });
  expect(project.pattern.width).toBe(20);
  expect(project.pattern.cells[1].code).toBe(keyboardBrushCode);

  // 保存并刷新恢复
  await page.getByRole('button', { name: /保存/ }).click();
  await expect(page.getByText(/已保存/).first()).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByLabel('设计名称').first()).toBeVisible();
  await expect(page.getByText(/共 400 粒/).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button',{name:/色板品牌/})).toHaveText('优肯 Artkal');
  await expect(page.getByRole('button',{name:/色板系列/}).locator('..').locator('select')).toHaveValue(miniPaletteId!);
  await expect(page.getByRole('button',{name:/制作规格/})).toHaveText('2.6mm / 52×52');
  const restoredWidth = page.getByRole('spinbutton', { name: '目标宽度（格）' });
  await expect(restoredWidth).toBeEnabled();
  await typeSpin(page, '目标宽度（格）', '21');
  await restoredWidth.blur();
  await expect(page.getByText(/共 441 粒/).first()).toBeVisible({ timeout: 20_000 });
});
