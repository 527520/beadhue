// @vitest-environment jsdom
/**
 * 跟拼（票 09，D39）：板块顺序的行列表、进度统计、行内颜色序列；会话的整行标记 / 推进 / 撤销重做 / 换规格定位；
 * 画布手势——标记只在未形成导航手势的短点松手时提交，拖动、双指、取消、浏览都零写入。
 */
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { createStitchProgress, type StitchProgress } from '@/lib/progress/stitchProgress';
import type { Pattern } from '@/lib/types';
import { zhCN } from '@/messages/zh-CN';
import { EditorCanvas } from './editor-canvas';
import { StitchPanel } from './panel-stitch';
import { boardStats, firstPendingRow, patternStats, rowRuns, stitchRows, type StitchTool } from './stitch-model';
import { useEditorDocument } from './use-editor-document';
import { useEditorViewport } from './use-editor-viewport';
import { useStitchSession } from './use-stitch-session';

const t = zhCN.editorWorkspace.stitch;
const RED = { hex: '#FF0000', code: 'A1', transparent: false };
const EMPTY = { hex: null, code: null, transparent: true };

/** 3×2：第二行最后一格透明。 */
const small: Pattern = {
  width: 3,
  height: 2,
  cells: [
    { hex: '#FF0000', code: 'A1', transparent: false },
    { hex: '#00FF00', code: 'B2', transparent: false },
    { hex: '#0000FF', code: 'C3', transparent: false },
    { hex: '#FFFF00', code: 'D4', transparent: false },
    { hex: '#FF00FF', code: 'E5', transparent: false },
    EMPTY,
  ],
};

function solid(width: number, height: number): Pattern {
  return { width, height, cells: Array.from({ length: width * height }, () => ({ ...RED })) };
}

describe('跟拼数据', () => {
  it('行按板块顺序（横向优先）、板内自上而下，只收有可拼格的行', () => {
    const pattern = solid(58, 2);
    pattern.cells[1 * 58 + 30] = EMPTY;
    const rows = stitchRows(pattern, 29);
    expect(rows.map((row) => [row.board, row.local, row.cells.length])).toEqual([[0, 0, 29], [0, 1, 29], [1, 0, 29], [1, 1, 28]]);
    const blank: Pattern = { width: 2, height: 1, cells: [EMPTY, EMPTY] };
    expect(stitchRows(blank, 29)).toEqual([]);
  });

  it('整图与每块板的进度只数可拼格；百分比向下取整，拼完前不到 100%', () => {
    const progress = createStitchProgress(3, 2);
    progress.done.set([1, 1, 1, 1, 0, 1]);
    expect(patternStats(small, progress)).toEqual({ total: 5, done: 4, percent: 80 });
    const wide = solid(58, 1);
    const half = createStitchProgress(58, 1);
    half.done.fill(1, 0, 28);
    expect(boardStats(wide, half, 29).map((board) => board.percent)).toEqual([96, 0]);
  });

  it('行内颜色序列合并相邻同色，保留开头的留空、去掉末尾的留空', () => {
    const pattern: Pattern = { width: 6, height: 1, cells: [EMPTY, RED, RED, { hex: '#00FF00', code: 'B2', transparent: false }, EMPTY, EMPTY] };
    const [row] = stitchRows(pattern, 29);
    expect(rowRuns(pattern, row).map((run) => [run.cell?.code ?? null, run.count])).toEqual([[null, 1], ['A1', 2], ['B2', 1]]);
  });

  it('下一处未完成从当前行往后找，后面都拼完就从头找，全部拼完为 -1', () => {
    const rows = stitchRows(small, 29);
    const progress = createStitchProgress(3, 2);
    progress.done.set([0, 0, 0, 1, 1, 0]);
    expect(firstPendingRow(rows, progress, 1)).toBe(0);
    progress.done.set([1, 1, 1, 1, 1, 0]);
    expect(firstPendingRow(rows, progress)).toBe(-1);
  });
});

function renderSession(pattern: Pattern, progress: StitchProgress, boardSize = 29) {
  const onChange = vi.fn();
  const hook = renderHook(
    (props: { pattern: Pattern; progress: StitchProgress; boardSize: number }) => useStitchSession({ ...props, onChange, defaultTool: 'mark' }),
    { initialProps: { pattern, progress, boardSize } },
  );
  return { onChange, ...hook };
}

describe('跟拼会话', () => {
  it('完成本行只改当前板内的局部行，并推进到下一处未完成（右侧下一块板）', () => {
    const { result, onChange } = renderSession(solid(58, 1), createStitchProgress(58, 1));
    expect(result.current.row).toMatchObject({ board: 0, local: 0 });
    act(() => { expect(result.current.completeRow()).toBe('advanced'); });
    const next = onChange.mock.calls[0][0] as StitchProgress;
    expect([...next.done.slice(0, 29)].every((value) => value === 1)).toBe(true);
    expect([...next.done.slice(29)].every((value) => value === 0)).toBe(true);
    expect(result.current.row).toMatchObject({ board: 1, local: 0 });
    act(() => { expect(result.current.completeRow()).toBe('finished'); });
    expect(result.current.finished).toBe(true);
  });

  it('2.6mm / 50×50 规格按 50 格一板标记', () => {
    const { result, onChange } = renderSession(solid(100, 1), createStitchProgress(100, 1), 50);
    act(() => { result.current.completeRow(); });
    const next = onChange.mock.calls[0][0] as StitchProgress;
    expect(next.done.indexOf(0)).toBe(50);
    expect(result.current.row).toMatchObject({ board: 1 });
  });

  it('本行已拼完时再点是取消本行完成；撤销 / 重做恢复进度并再次上抛', () => {
    const { result, onChange } = renderSession(small, createStitchProgress(3, 2));
    act(() => { result.current.completeRow(); });
    act(() => { result.current.goRow(0); });
    expect(result.current.rowDone).toBe(true);
    act(() => { expect(result.current.completeRow()).toBe('undone'); });
    expect(result.current.rowDone).toBe(false);
    expect(result.current.canUndo).toBe(true);
    act(() => { result.current.undo(); });
    expect(result.current.rowDone).toBe(true);
    act(() => { result.current.redo(); });
    expect(result.current.rowDone).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(4);
  });

  it('重新进入时定位到首个未完成行；换制作规格按同一格重新找板', () => {
    const restored = createStitchProgress(100, 1);
    restored.done.fill(1, 0, 87);
    const pattern = solid(100, 1);
    const { result, rerender } = renderSession(pattern, restored, 29);
    expect(result.current.row).toMatchObject({ board: 3, colStart: 87 });
    rerender({ pattern, progress: restored, boardSize: 50 });
    expect(result.current.row).toMatchObject({ board: 1, colStart: 50 });
  });

  it('只标可拼格；父级给了内容不同的进度就是新会话（历史清空）', () => {
    const { result, rerender, onChange } = renderSession(small, createStitchProgress(3, 2));
    act(() => { expect(result.current.toggleAt(1, 2)).toBe(false); });
    act(() => { expect(result.current.toggleAt(0, 1)).toBe(true); });
    expect(result.current.isDone(0, 1)).toBe(true);
    // 自己提交后父级回传同样内容：不算新会话。
    rerender({ pattern: small, progress: onChange.mock.calls[0][0] as StitchProgress, boardSize: 29 });
    expect(result.current.canUndo).toBe(true);
    rerender({ pattern: small, progress: createStitchProgress(3, 2), boardSize: 29 });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.isDone(0, 1)).toBe(false);
  });

  it('清空进度回到第一行；没有进度时不做任何事', () => {
    const progress = createStitchProgress(3, 2);
    progress.done.set([1, 1, 1, 0, 0, 0]);
    const { result } = renderSession(small, progress);
    expect(result.current.row).toMatchObject({ local: 1 });
    act(() => { expect(result.current.clear()).toBe(true); });
    expect(result.current.stats.done).toBe(0);
    expect(result.current.row).toMatchObject({ local: 0 });
    act(() => { expect(result.current.clear()).toBe(false); });
  });
});

/** 色板要稳定引用：父组件每次传新色板就是新的编辑事务。 */
const NO_PALETTE: never[] = [];
const noop = () => undefined;

/** 3×2 图纸在 640×520 的测试视窗里：格宽 48，左上角 (248, 204)，首格中心 (272, 228)。 */
function CanvasHarness({ tool, onTap, onApply }: { tool: StitchTool; onTap: () => void; onApply: () => void }) {
  const doc = useEditorDocument({ pattern: small, palette: NO_PALETTE, onPatternChange: noop });
  const viewport = useEditorViewport(doc.width, doc.height);
  return (
    <EditorCanvas
      doc={doc}
      viewport={viewport}
      showGrid
      showSeams
      showCodes
      boardSize={29}
      highlight={null}
      locked={false}
      spaceHeld={false}
      cursor={{ row: 0, col: 0 }}
      onCursorChange={() => undefined}
      onHover={() => undefined}
      onTap={onTap}
      onApply={onApply}
      stitch={{ done: new Uint8Array(6), board: null, row: null, tool }}
      label={t.canvasAria(3, 2, 0)}
    />
  );
}

function setupCanvas(tool: StitchTool = 'mark') {
  const onTap = vi.fn();
  const onApply = vi.fn();
  render(<CanvasHarness tool={tool} onTap={onTap} onApply={onApply} />);
  return { onTap, onApply, canvas: screen.getByLabelText(t.canvasAria(3, 2, 0)) };
}

describe('跟拼画布手势（D39）', () => {
  it('标记：按下不提交，短点松手才标这一格', () => {
    const { onTap, canvas } = setupCanvas();
    fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: 'touch', clientX: 272, clientY: 228 });
    expect(onTap).not.toHaveBeenCalled();
    fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: 'touch', clientX: 272, clientY: 228 });
    expect(onTap).toHaveBeenCalledWith({ row: 0, col: 0 });
  });

  it('拖动超过阈值只平移，不标记', () => {
    const { onTap, canvas } = setupCanvas();
    fireEvent.pointerDown(canvas, { pointerId: 2, pointerType: 'touch', clientX: 272, clientY: 228 });
    fireEvent.pointerMove(canvas, { pointerId: 2, pointerType: 'touch', clientX: 292, clientY: 238 });
    fireEvent.pointerUp(canvas, { pointerId: 2, pointerType: 'touch', clientX: 292, clientY: 238 });
    expect(onTap).not.toHaveBeenCalled();
  });

  it('第二根手指介入后只缩放平移；pointercancel 后即使收到 pointerup 也零写入', () => {
    const { onTap, canvas } = setupCanvas();
    fireEvent.pointerDown(canvas, { pointerId: 3, pointerType: 'touch', clientX: 272, clientY: 228 });
    fireEvent.pointerDown(canvas, { pointerId: 4, pointerType: 'touch', clientX: 320, clientY: 228 });
    fireEvent.pointerUp(canvas, { pointerId: 4, pointerType: 'touch', clientX: 330, clientY: 228 });
    fireEvent.pointerUp(canvas, { pointerId: 3, pointerType: 'touch', clientX: 272, clientY: 228 });
    fireEvent.pointerDown(canvas, { pointerId: 5, pointerType: 'touch', clientX: 272, clientY: 228 });
    fireEvent.pointerCancel(canvas, { pointerId: 5, pointerType: 'touch', clientX: 272, clientY: 228 });
    fireEvent.pointerUp(canvas, { pointerId: 5, pointerType: 'touch', clientX: 272, clientY: 228 });
    expect(onTap).not.toHaveBeenCalled();
  });

  it('浏览工具下轻点也只浏览；回车只在标记工具下对光标格生效', () => {
    const browse = setupCanvas('browse');
    fireEvent.pointerDown(browse.canvas, { pointerId: 6, pointerType: 'mouse', button: 0, clientX: 272, clientY: 228 });
    fireEvent.pointerUp(browse.canvas, { pointerId: 6, pointerType: 'mouse', button: 0, clientX: 272, clientY: 228 });
    fireEvent.keyDown(browse.canvas, { key: 'Enter' });
    expect(browse.onTap).not.toHaveBeenCalled();
    expect(browse.onApply).not.toHaveBeenCalled();
  });

  it('标记工具下回车标记光标格', () => {
    const { onApply, canvas } = setupCanvas('mark');
    fireEvent.keyDown(canvas, { key: 'Enter' });
    expect(onApply).toHaveBeenCalledWith({ row: 0, col: 0 });
  });
});

describe('跟拼面板', () => {
  function Panel({ progress, sheet = false }: { progress: StitchProgress | null; sheet?: boolean }) {
    const session = useStitchSession({ pattern: small, boardSize: 29, progress, onChange: () => undefined, defaultTool: 'mark' });
    return <StitchPanel pattern={small} session={session} sheet={sheet} onBoard={session.jumpBoard} onComplete={() => session.completeRow()} onPending={session.jumpPending} />;
  }
  const countText = (pattern: RegExp) => screen.getByText((_, element) => element?.tagName === 'P' && pattern.test(element.textContent ?? ''));

  it('进度、板块总览与当前行；完成本行后变成「取消本行完成」语义的下一行', () => {
    render(<Panel progress={createStitchProgress(3, 2)} />);
    expect(countText(/^已拼 0 \/ 5 颗$/)).toBeTruthy();
    expect(screen.getByRole('button', { name: t.boardAria(1, 0) })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('heading', { name: t.rowTitle(1, 1, 3) })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.complete }));
    expect(countText(/^已拼 3 \/ 5 颗$/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: t.rowTitle(1, 2, 2) })).toBeTruthy();
    expect(screen.getByRole('button', { name: t.prev })).toBeEnabled();
    expect(screen.getByRole('button', { name: t.next })).toBeDisabled();
  });

  it('全部拼完：写明拼完了，「回到下一处未完成」不可用；本机存储不可用时只给说明', () => {
    const done = createStitchProgress(3, 2);
    done.done.set([1, 1, 1, 1, 1, 0]);
    const view = render(<Panel progress={done} sheet />);
    expect(countText(/全部拼完了$/)).toBeTruthy();
    expect(screen.getByRole('button', { name: t.pending })).toBeDisabled();
    view.unmount();
    render(<Panel progress={null} />);
    expect(screen.getByText(t.unavailable)).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.complete })).toBeNull();
  });
});
