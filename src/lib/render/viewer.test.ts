import { describe, expect, it } from 'vitest';
import { boardCount, clampOffset, codeInkIsDark, cropPattern, drawBoardSeams, drawCellCodes, drawGridLines, gridVisible, nextZoomStop, visibleBox, zoomLimits } from './viewer';

/** 记录绘制调用的 2D 上下文桩（可选 roundRect 行为）。 */
function recorder(options: { roundRect?: boolean } = {}) {
  const calls: Array<[string, ...unknown[]]> = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop === 'measureText') return (text: string) => ({ width: String(text).length * 6 });
      if (prop === 'roundRect' && options.roundRect === false) return undefined;
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        calls.push([prop, ...args]);
        return undefined;
      };
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe('详情查看器的计算', () => {
  it('底板数按行列向上取整', () => {
    expect(boardCount(29, 29, 29)).toBe(1);
    expect(boardCount(32, 32, 29)).toBe(4);
    expect(boardCount(60, 29, 29)).toBe(3);
  });

  it('缩放档位相对适配，走到头返回 null', () => {
    expect(nextZoomStop(10, 10, 1)).toBe(12.5);
    expect(nextZoomStop(10, 10, -1)).toBe(7.5);
    expect(nextZoomStop(80, 10, 1)).toBeNull();
    expect(nextZoomStop(5, 10, -1)).toBeNull();
  });

  it('静态大图最多放大到原图格宽的 2 倍；完整图纸至少能放大到读色号', () => {
    expect(zoomLimits(10)).toEqual({ min: 5, max: 80 });
    expect(zoomLimits(4)).toEqual({ min: 2, max: 48 });
    expect(zoomLimits(20, 28).max).toBe(56);
    expect(zoomLimits(60, 28).max).toBe(60);
  });

  it('网格：自动时每格 ≥14px 出现，手动打开至少 4px', () => {
    expect(gridVisible('auto', 13.9)).toBe(false);
    expect(gridVisible('auto', 14)).toBe(true);
    expect(gridVisible('on', 4)).toBe(true);
    expect(gridVisible('off', 40)).toBe(false);
  });

  it('比可视区小时居中，大时只能拖到边缘', () => {
    const area = { x: 24, y: 24, w: 400, h: 300 };
    expect(clampOffset({ x: 0, y: 0 }, { w: 200, h: 100 }, area)).toEqual({ x: 124, y: 124 });
    expect(clampOffset({ x: 500, y: -999 }, { w: 800, h: 600 }, area)).toEqual({ x: 24, y: -276 });
  });

  it('只取可见格', () => {
    const pattern = { width: 3, height: 2, cells: ['a', 'b', 'c', 'd', 'e', 'f'].map((code) => ({ hex: '#000000', code, transparent: false })) };
    const box = visibleBox(pattern, -10, 0, 10, 20, 10);
    expect(box).toEqual({ c0: 1, c1: 3, r0: 0, r1: 1 });
    expect(cropPattern(pattern, box).cells.map((cell) => cell.code)).toEqual(['b', 'c']);
    expect(cropPattern(pattern, { c0: 0, c1: 3, r0: 0, r1: 2 })).toBe(pattern);
  });

  it('色号文字取对比度更高的颜色', () => {
    expect(codeInkIsDark('#FFFFFF')).toBe(true);
    expect(codeInkIsDark('#1C1C1E')).toBe(false);
  });
});

describe('查看器画布叠加层', () => {
  it('drawGridLines 对齐设备像素并绘制网格（奇偶 dpr）', () => {
    for (const dpr of [1, 2]) {
      const { ctx, calls } = recorder();
      drawGridLines(ctx, { x: 0, y: 0, cell: 10, box: { c0: 0, c1: 4, r0: 0, r1: 2 }, alpha: 0.4, dpr });
      expect(calls.filter(([name]) => name === 'moveTo').length).toBeGreaterThan(0);
      expect(calls.some(([name]) => name === 'stroke')).toBe(true);
    }
  });

  it('drawBoardSeams 大格画编号（roundRect / rect 两个分支），小格跳过编号', () => {
    const { ctx, calls } = recorder();
    drawBoardSeams(ctx, { width: 60, height: 60, cols: 29, rows: 29, x: 0, y: 0, cell: 20, font: 'sans' });
    expect(calls.some(([name]) => name === 'roundRect')).toBe(true);
    expect(calls.some(([name]) => name === 'fillText')).toBe(true);

    const small = recorder();
    drawBoardSeams(small.ctx, { width: 60, height: 60, cols: 29, rows: 29, x: 0, y: 0, cell: 1, font: 'sans' });
    expect(small.calls.some(([name]) => name === 'fillText')).toBe(false);

    const legacy = recorder({ roundRect: false });
    drawBoardSeams(legacy.ctx, { width: 60, height: 60, cols: 29, rows: 29, x: 0, y: 0, cell: 20, font: 'sans' });
    expect(legacy.calls.some(([name]) => name === 'rect')).toBe(true);
  });

  it('drawCellCodes 只标注有颜色且有色号的格子（明暗两分支），透明与无色号跳过', () => {
    const pattern = {
      width: 2, height: 2,
      cells: [
        { hex: '#FFFFFF', code: 'A01', transparent: false }, { hex: '#000000', code: 'A02', transparent: false },
        { hex: '#3160E6', code: null, transparent: false }, { hex: null, code: 'A04', transparent: true },
      ],
    };
    const { ctx, calls } = recorder();
    drawCellCodes(ctx, pattern, { x: 0, y: 0, cell: 40, box: { c0: 0, c1: 2, r0: 0, r1: 2 }, font: 'sans' });
    const texts = calls.filter(([name]) => name === 'fillText').map(([, text]) => text);
    expect(texts).toEqual(['A01', 'A02']);
  });
});
