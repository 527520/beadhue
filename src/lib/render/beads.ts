/** Browser canvas creation around the shared bead renderer. */
import type { Pattern } from '@/lib/types';
import { BEAD_TOKENS } from './beadTokens';
import { drawPattern, fitPattern, type CanvasSize, type PatternCanvasOptions } from './beadsCore';
export * from './beadsCore';

export function devicePixelRatioCap(): number {
  return typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1);
}

/** 把图纸画进给定画布（按 DPR 放大像素，CSS 尺寸为 size）。 */
export function paintPatternCanvas(canvas: HTMLCanvasElement, pattern: Pattern, size: CanvasSize, options: PatternCanvasOptions = {}): void {
  const { pad = 0.08, background = BEAD_TOKENS.board, dpr = devicePixelRatioCap(), ...rest } = options;
  canvas.width = Math.round(size.width * dpr);
  canvas.height = Math.round(size.height * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size.width, size.height);
  if (background !== 'transparent') {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size.width, size.height);
  }
  const fit = fitPattern(pattern, size, pad);
  drawPattern(ctx, pattern, { ...rest, ...fit });
}

/** 生成一个画布：图纸居中、按比例适配，四周留 pad 比例的钉板边。 */
export function patternCanvas(pattern: Pattern, size: number | CanvasSize, options: PatternCanvasOptions = {}, doc: Document = document): HTMLCanvasElement {
  const box = typeof size === 'number' ? { width: size, height: size } : size;
  const canvas = doc.createElement('canvas');
  canvas.style.width = `${box.width}px`;
  canvas.style.height = `${box.height}px`;
  paintPatternCanvas(canvas, pattern, box, options);
  return canvas;
}
