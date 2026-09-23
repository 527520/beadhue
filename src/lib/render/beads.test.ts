import { describe, expect, it } from 'vitest';
import type { Pattern } from '@/lib/types';
import { BEAD_TOKENS } from './beadTokens';
import { beadHex, colorUsage, drawPattern, emptyArtPattern, fitPattern, hexToRgb, keysPattern, luminance, mixRgb, paintPatternCanvas, PIXEL_ICON_OPTIONS } from './beads';

/** 记录绘制调用的最小 2D 上下文桩。 */
function recorder() {
  const calls: Array<[string, ...unknown[]]> = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => { calls.push([prop, ...args]); };
    },
    set(target, prop: string, value) {
      target[prop] = value;
      calls.push([`set:${prop}`, value]);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, count: (name: string) => calls.filter(([n]) => n === name).length, sets: (name: string) => calls.filter(([n]) => n === `set:${name}`).map(([, v]) => v) };
}

const palette = { R: '#E0473F', W: '#FBF8F1' };
const pattern = (rows: string[]): Pattern => {
  const base = keysPattern(rows, palette);
  return { ...base, cells: base.cells.map((cell) => (cell.hex ? { ...cell, code: cell.hex === palette.R ? 'F5' : 'H1' } : cell)) };
};

describe('豆粒渲染 beads.ts', () => {
  it('颜色工具：hex 解析、向黑白混合与亮度', () => {
    expect(hexToRgb('#3160E6')).toEqual([49, 96, 230]);
    expect(mixRgb('#000000', [255, 255, 255], 0.5)).toBe('rgb(128,128,128)');
    expect(luminance('#FFFFFF')).toBeCloseTo(1, 5);
    expect(luminance('#000000')).toBe(0);
  });

  it('透明格与背景外部格不上豆', () => {
    expect(beadHex({ hex: '#E0473F', code: 'F5', transparent: false })).toBe('#E0473F');
    expect(beadHex({ hex: '#E0473F', code: 'F5', transparent: true })).toBeNull();
    expect(beadHex({ hex: '#E0473F', code: 'F5', transparent: false, external: true })).toBeNull();
    expect(beadHex(undefined)).toBeNull();
  });

  it('keysPattern 按字符网格生成图纸，缺字符按空格补齐', () => {
    const result = keysPattern(['R.', 'W'], palette);
    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(result.cells.map((cell) => cell.hex)).toEqual(['#E0473F', null, '#FBF8F1', null]);
  });

  it('豆粒模式：钉板白底、每颗豆一个圆、空格画钉子、每格 ≥7px 画孔、≥10px 描边', () => {
    const { ctx, count, sets } = recorder();
    const size = drawPattern(ctx, pattern(['R.', '.W']), { cell: 12 });
    expect(size).toEqual({ w: 24, h: 24 });
    expect(sets('fillStyle')[0]).toBe(BEAD_TOKENS.board);
    // 2 颗豆 × (豆 + 孔) + 2 个钉子
    expect(count('arc')).toBe(6);
    expect(count('stroke')).toBe(2);
    expect(sets('fillStyle')).toContain(BEAD_TOKENS.peg);
  });

  it('豆粒模式小尺寸：<7px 画小孔、<4px 不画钉子与孔', () => {
    const small = recorder();
    drawPattern(small.ctx, pattern(['R.']), { cell: 5 });
    expect(small.count('arc')).toBe(3);
    const tiny = recorder();
    drawPattern(tiny.ctx, pattern(['R.']), { cell: 3, pegs: true });
    expect(tiny.count('arc')).toBe(1);
  });

  it('方格模式：网格、板缝、色号、高亮都按阈值绘制', () => {
    const { ctx, count, sets, calls } = recorder();
    drawPattern(ctx, pattern(['RW', 'WR']), { cell: 20, mode: 'flat', grid: true, seams: true, board: 1, codes: true, highlight: { col: 1, row: 0 } });
    expect(count('fillRect')).toBe(5); // 底 + 4 格
    expect(sets('strokeStyle')).toEqual(expect.arrayContaining([BEAD_TOKENS.grid, BEAD_TOKENS.seam, BEAD_TOKENS.highlight]));
    const texts = calls.filter(([name]) => name === 'fillText').map(([, text]) => text);
    expect(texts).toEqual(['F5', 'H1', 'H1', 'F5']);
    // 深色豆用白字、浅色豆用深字
    expect(sets('fillStyle')).toEqual(expect.arrayContaining([BEAD_TOKENS.codeOnDark, BEAD_TOKENS.codeOnLight]));
    expect(count('strokeRect')).toBe(1);
  });

  it('方格模式低于阈值不画网格与色号；base 为 null 时不铺底', () => {
    const { ctx, count, calls } = recorder();
    drawPattern(ctx, pattern(['R']), { cell: 4, mode: 'flat', grid: true, codes: true, base: null });
    expect(count('fillRect')).toBe(1);
    expect(calls.some(([name]) => name === 'fillText')).toBe(false);
    expect(count('stroke')).toBe(0);
  });

  it('fitPattern 居中并按长边适配，留出钉板边', () => {
    expect(fitPattern({ width: 10, height: 5 }, { width: 100, height: 100 }, 0)).toEqual({ cell: 10, x: 0, y: 25 });
    const padded = fitPattern({ width: 10, height: 10 }, { width: 100, height: 100 }, 0.1);
    expect(padded.cell).toBeCloseTo(8);
    expect(padded.x).toBeCloseTo(10);
  });

  it('paintPatternCanvas 按 DPR 设置像素尺寸；透明底不铺色', () => {
    const { ctx, sets, calls } = recorder();
    const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
    paintPatternCanvas(canvas, pattern(['R']), { width: 28, height: 28 }, { ...PIXEL_ICON_OPTIONS, dpr: 2 });
    expect(canvas.width).toBe(56);
    expect(calls.find(([name]) => name === 'setTransform')).toEqual(['setTransform', 2, 0, 0, 2, 0, 0]);
    expect(sets('fillStyle')).toEqual(['#E0473F']);
  });

  it('空状态插画 9×9，未知类型回退到默认', () => {
    for (const kind of ['empty', 'search', 'designs', 'comments', 'likes'] as const) {
      const art = emptyArtPattern(kind);
      expect([art.width, art.height]).toEqual([9, 9]);
      expect(art.cells.some((cell) => cell.hex)).toBe(true);
    }
    expect(emptyArtPattern('nope' as never).cells.filter((cell) => cell.hex)).toHaveLength(3);
  });

  it('colorUsage 按颗数降序', () => {
    expect(colorUsage(pattern(['RRW', '..W', 'R..']))).toEqual([
      { hex: '#E0473F', code: 'F5', count: 3 },
      { hex: '#FBF8F1', code: 'H1', count: 2 },
    ]);
  });
});
