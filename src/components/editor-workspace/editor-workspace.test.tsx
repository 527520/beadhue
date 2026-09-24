// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Pattern } from '@/lib/types';
import { boardWidths, boardsOf, clampEditorCamera, fitEditorCamera, packOptions, stepZoom, toolForKey, zoomEditorCameraAt, zoomPercent } from './editor-model';
import { normalizeTag } from './publish-dialog';
import { useEditorDocument } from './use-editor-document';

const RED = { hex: '#FF0000', code: 'R1' };
const BLUE = { hex: '#0000FF', code: 'B1' };

function pattern(width: number, height: number, fill = RED): Pattern {
  return { width, height, cells: Array.from({ length: width * height }, () => ({ ...fill, transparent: false })) };
}

describe('编辑器相机与底板', () => {
  it('适配时四周留出浮层边距，格宽不超过 48，图纸居中', () => {
    const camera = fitEditorCamera(10, 10, { width: 640, height: 520 });
    expect(camera.cellPx).toBe(38);
    expect(camera.offsetX).toBe(Math.round(40 + (560 - 380) / 2));
    expect(fitEditorCamera(2, 1, { width: 640, height: 520 }).cellPx).toBe(48);
  });

  it('缩放按档位走、以锚点为中心，百分比以 20px 为 100%', () => {
    expect(stepZoom(20, 1)).toBe(22);
    expect(stepZoom(20, -1)).toBe(18);
    expect(stepZoom(80, 1)).toBe(80);
    const zoomed = zoomEditorCameraAt({ cellPx: 10, offsetX: 0, offsetY: 0 }, 20, 100, 100);
    expect(zoomed).toEqual({ cellPx: 20, offsetX: -100, offsetY: -100 });
    expect(zoomPercent(40)).toBe(200);
  });

  it('平移时图纸至少留 48px 在视野里', () => {
    const size = { width: 400, height: 300 };
    expect(clampEditorCamera({ cellPx: 10, offsetX: 5000, offsetY: -5000 }, 10, 10, size)).toEqual({ cellPx: 10, offsetX: 352, offsetY: -52 });
  });

  it('底板块数、宽度芯片与每包颗数选项', () => {
    expect(boardsOf(58, 30, 29)).toEqual({ cols: 2, rows: 2, total: 4 });
    expect(boardWidths(29).map((option) => option.width)).toEqual([29, 58, 87]);
    expect(boardWidths(100).map((option) => option.width)).toEqual([100, 200]);
    expect(packOptions(1000)).toEqual([500, 1000, 2000, 5000]);
    expect(packOptions(300)).toEqual([300, 500, 1000, 2000, 5000]);
    expect(toolForKey('g')).toBe('fill');
    expect(toolForKey('x')).toBeNull();
  });
});

describe('建议标签规范化（D68）', () => {
  it('全角转半角、折叠空白，1–8 个字', () => {
    expect(normalizeTag('  ｃａｔ  猫 ')).toBe('cat 猫');
    expect(normalizeTag('')).toBeNull();
    expect(normalizeTag('一二三四五六七八九')).toBeNull();
    expect(normalizeTag('<b>')).toBeNull();
  });
});

describe('useEditorDocument', () => {
  it('默认当前色是用得最多的颜色；一笔一步撤销，重做恢复', () => {
    const onPatternChange = vi.fn();
    const { result } = renderHook(() => useEditorDocument({ pattern: pattern(3, 1), palette: [RED, BLUE], onPatternChange }));
    expect(result.current.color).toEqual(RED);
    act(() => result.current.setColor(BLUE));
    act(() => { result.current.commitStroke(result.current.paintCell(0, 1)); });
    expect(onPatternChange).toHaveBeenLastCalledWith(expect.objectContaining({ cells: expect.arrayContaining([expect.objectContaining({ code: 'B1' })]) }));
    expect(result.current.canUndo).toBe(true);
    act(() => { expect(result.current.undo()).toBe(true); });
    expect(result.current.cellAt(0, 1)?.code).toBe('R1');
    act(() => { result.current.redo(); });
    expect(result.current.cellAt(0, 1)?.code).toBe('B1');
  });

  it('替换全部同色、旋转随原图几何一起变换且可撤销', () => {
    const onPatternChange = vi.fn();
    const onOriginalChange = vi.fn();
    const original = { sha256: 'x', width: 30, height: 10, geometry: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number] };
    const { result } = renderHook(() => useEditorDocument({ pattern: pattern(3, 1), palette: [RED, BLUE], original, onOriginalChange, onPatternChange }));
    act(() => { expect(result.current.replaceCode('R1', BLUE)).toBe(3); });
    act(() => result.current.transform('rotateCW'));
    expect(result.current.width).toBe(1);
    expect(result.current.height).toBe(3);
    expect(onOriginalChange).toHaveBeenCalledWith(expect.objectContaining({ geometry: expect.not.arrayContaining([Number.NaN]) }));
    act(() => { result.current.undo(); });
    expect(result.current.width).toBe(3);
    expect(onOriginalChange).toHaveBeenLastCalledWith(original);
  });

  it('父组件换了新图纸就开始新的编辑事务：历史清空', () => {
    const onPatternChange = vi.fn();
    const { result, rerender } = renderHook(({ value }) => useEditorDocument({ pattern: value, palette: [RED, BLUE], onPatternChange }), { initialProps: { value: pattern(2, 1) } });
    act(() => result.current.setColor(BLUE));
    act(() => { result.current.commitStroke(result.current.paintCell(0, 0)); });
    rerender({ value: pattern(4, 4, BLUE) });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.undo()).toBe(false);
    expect(result.current.width).toBe(4);
  });
});
