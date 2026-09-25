/**
 * 作品详情查看器的纯计算与画布叠加层：缩放档位、可见格范围、网格、板块编号、色号。
 * 豆粒 / 方格本身由 beads.ts 的 drawPattern 画；这里只画叠加层，颜色取 beadTokens。
 */
import type { Pattern } from '@/lib/types';
import { beadHex, luminance } from './beads';
import { VIEWER_TOKENS } from './beadTokens';

/** 每格 ≥14px 时「自动」网格出现（D67）。 */
export const GRID_AUTO_MIN = 14;
/** 手动打开网格时，每格至少 4px 才画。 */
export const GRID_ON_MIN = 4;
/** 方格模式每格 ≥18px 才画色号（D67）。 */
export const CODE_MIN = 18;
/** 打开色号时至少放大到这个格宽，保证一打开就读得清。 */
export const CODE_ZOOM = 24;
/** 相对「适配」的缩放档位。 */
export const ZOOM_STOPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8] as const;

export type GridSetting = 'auto' | 'on' | 'off';

/** 画布上的文字字体（与 theme.css 的 --font-sans / --font-mono 同一组）。 */
export const CANVAS_FONT_SANS = '"BeadHue Text", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif';
export const CANVAS_FONT_BRAND = '"BeadHue Round", "BeadHue Text", "PingFang SC", sans-serif';
export const CANVAS_FONT_MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export function boardCount(width: number, height: number, cols: number, rows = cols): number {
  return Math.ceil(width / cols) * Math.ceil(height / rows);
}

/** 缩放上下限（格宽像素）。静态大图最多放大到原图格宽的 2 倍，再大只会发糊。 */
export function zoomLimits(fitCell: number, imageCell?: number): { min: number; max: number } {
  const min = fitCell * ZOOM_STOPS[0];
  const max = imageCell ? Math.max(fitCell, imageCell * 2) : Math.max(fitCell * ZOOM_STOPS[ZOOM_STOPS.length - 1], CODE_ZOOM * 2);
  return { min, max };
}

/** 按档位缩放：返回下一档（相对适配）的格宽；已到头返回 null。 */
export function nextZoomStop(cell: number, fitCell: number, dir: 1 | -1): number | null {
  const ratio = cell / fitCell;
  const stop = dir > 0 ? ZOOM_STOPS.find((s) => s > ratio + 0.001) : [...ZOOM_STOPS].reverse().find((s) => s < ratio - 0.001);
  return stop ? fitCell * stop : null;
}

export function gridVisible(setting: GridSetting, cell: number): boolean {
  return setting === 'on' ? cell >= GRID_ON_MIN : setting === 'auto' && cell >= GRID_AUTO_MIN;
}

export interface Area { x: number; y: number; w: number; h: number }

/** 图纸比可视区小时居中；比可视区大时只能拖到边缘贴齐可视区。 */
export function clampOffset(offset: { x: number; y: number }, size: { w: number; h: number }, area: Area): { x: number; y: number } {
  return {
    x: size.w <= area.w ? area.x + (area.w - size.w) / 2 : Math.min(area.x, Math.max(area.x + area.w - size.w, offset.x)),
    y: size.h <= area.h ? area.y + (area.h - size.h) / 2 : Math.min(area.y, Math.max(area.y + area.h - size.h, offset.y)),
  };
}

export interface CellBox { c0: number; c1: number; r0: number; r1: number }

/** 画布 W×H 内可见的格范围（右、下为开区间）。 */
export function visibleBox(pattern: Pick<Pattern, 'width' | 'height'>, ox: number, oy: number, cell: number, W: number, H: number): CellBox {
  return {
    c0: Math.max(0, Math.floor(-ox / cell)), c1: Math.min(pattern.width, Math.ceil((W - ox) / cell)),
    r0: Math.max(0, Math.floor(-oy / cell)), r1: Math.min(pattern.height, Math.ceil((H - oy) / cell)),
  };
}

/** 只取可见范围内的格子，放大后每帧只画看得见的部分。 */
export function cropPattern(pattern: Pattern, box: CellBox): Pattern {
  if (!box.c0 && !box.r0 && box.c1 === pattern.width && box.r1 === pattern.height) return pattern;
  const width = box.c1 - box.c0;
  const height = box.r1 - box.r0;
  const cells = new Array(width * height);
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) cells[row * width + col] = pattern.cells[(row + box.r0) * pattern.width + col + box.c0];
  }
  return { width, height, cells };
}

/** 网格线：对齐设备像素，豆粒模式淡、方格模式深。 */
export function drawGridLines(g: CanvasRenderingContext2D, o: { x: number; y: number; cell: number; box: CellBox; alpha: number; dpr: number }): void {
  const device = Math.max(1, Math.round(o.dpr));
  const offset = (device % 2) / 2 / o.dpr;
  const snap = (v: number) => Math.round(v * o.dpr) / o.dpr + offset;
  const left = o.x + o.box.c0 * o.cell;
  const right = o.x + o.box.c1 * o.cell;
  const top = o.y + o.box.r0 * o.cell;
  const bottom = o.y + o.box.r1 * o.cell;
  g.save();
  g.strokeStyle = VIEWER_TOKENS.ink;
  g.globalAlpha = o.alpha;
  g.lineWidth = device / o.dpr;
  g.beginPath();
  for (let col = o.box.c0; col <= o.box.c1; col += 1) { const p = snap(o.x + col * o.cell); g.moveTo(p, top); g.lineTo(p, bottom); }
  for (let row = o.box.r0; row <= o.box.r1; row += 1) { const p = snap(o.y + row * o.cell); g.moveTo(left, p); g.lineTo(right, p); }
  g.stroke();
  g.restore();
}

/** 板块：板缝线 + 每块左上角的编号（最窄那块也放得下编号时才标）。 */
export function drawBoardSeams(g: CanvasRenderingContext2D, o: { width: number; height: number; cols: number; rows: number; x: number; y: number; cell: number; font: string }): void {
  const { width, height, cols, rows, x, y, cell } = o;
  g.save();
  g.strokeStyle = VIEWER_TOKENS.ink;
  g.globalAlpha = 0.6;
  g.lineWidth = 2;
  g.beginPath();
  for (let col = cols; col < width; col += cols) { const p = x + col * cell; g.moveTo(p, y); g.lineTo(p, y + height * cell); }
  for (let row = rows; row < height; row += rows) { const p = y + row * cell; g.moveTo(x, p); g.lineTo(x + width * cell, p); }
  g.stroke();
  const last = (size: number, step: number) => size - step * Math.floor((size - 1) / step);
  if (Math.min(last(width, cols), last(height, rows)) * cell >= 28) {
    let index = 0;
    g.font = `600 12px ${o.font}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let row = 0; row < height; row += rows) {
      for (let col = 0; col < width; col += cols) {
        index += 1;
        const lx = x + col * cell + 4;
        const ly = y + row * cell + 4;
        g.globalAlpha = 0.86;
        g.fillStyle = VIEWER_TOKENS.ink;
        g.beginPath();
        if (g.roundRect) g.roundRect(lx, ly, 22, 20, 6); else g.rect(lx, ly, 22, 20);
        g.fill();
        g.globalAlpha = 1;
        g.fillStyle = VIEWER_TOKENS.onInk;
        g.fillText(String(index), lx + 11, ly + 10.5);
      }
    }
  }
  g.restore();
}

/** 色号文字颜色：深墨与白色里对比度更高的那个。 */
export function codeInkIsDark(hex: string): boolean {
  const l = luminance(hex);
  const ink = luminance(VIEWER_TOKENS.ink);
  return (l + 0.05) / (ink + 0.05) >= 1.05 / (l + 0.05);
}

export function drawCellCodes(g: CanvasRenderingContext2D, pattern: Pattern, o: { x: number; y: number; cell: number; box: CellBox; font: string }): void {
  const size = Math.min(13, Math.max(7, o.cell * 0.4));
  g.save();
  g.font = `600 ${size.toFixed(1)}px ${o.font}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let row = o.box.r0; row < o.box.r1; row += 1) {
    for (let col = o.box.c0; col < o.box.c1; col += 1) {
      const item = pattern.cells[row * pattern.width + col];
      const hex = beadHex(item);
      if (!hex || !item.code) continue;
      const dark = codeInkIsDark(hex);
      g.fillStyle = dark ? VIEWER_TOKENS.ink : VIEWER_TOKENS.onInk;
      g.globalAlpha = dark ? 0.82 : 0.95;
      g.fillText(item.code, o.x + col * o.cell + o.cell / 2, o.y + row * o.cell + o.cell / 2 + 0.5);
    }
  }
  g.restore();
}
