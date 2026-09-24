import { describe, expect, it } from 'vitest';
import { boardCount, clampOffset, codeInkIsDark, cropPattern, gridVisible, nextZoomStop, visibleBox, zoomLimits } from './viewer';

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
