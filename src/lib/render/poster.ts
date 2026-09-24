/**
 * 作品分享图（原型 detail.js posterSheet）：1080×1350，浅灰圆角舞台上居中豆粒图纸，下方标题、作者与统计、品牌字。
 * 有完整图纸时按格绘制；未登录只有服务端豆粒大图，就把大图缩放进舞台。只在浏览器里用。
 */
import type { Pattern } from '@/lib/types';
import { drawPattern } from './beads';
import { BEAD_TOKENS, VIEWER_TOKENS } from './beadTokens';
import { CANVAS_FONT_BRAND, CANVAS_FONT_SANS } from './viewer';

export interface PosterInput {
  title: string;
  meta: string;
  brand: string;
  brandTag: string;
  width: number;
  height: number;
  pattern: Pattern | null;
  imageSrc: string;
}

const SIDE = 1080;
const HEIGHT = 1350;
const STAGE_INSET = 64;
const ART = 872;

async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = 'async';
  image.src = src;
  await image.decode();
  return image;
}

export async function drawPoster(input: PosterInput, doc: Document = document): Promise<HTMLCanvasElement> {
  try {
    await Promise.all([doc.fonts.load(`600 56px ${CANVAS_FONT_SANS}`, input.title), doc.fonts.load(`400 34px ${CANVAS_FONT_BRAND}`, input.brand)]);
  } catch {
    // 字体没加载到时回退系统字体。
  }
  const canvas = doc.createElement('canvas');
  canvas.width = SIDE;
  canvas.height = HEIGHT;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('canvas unavailable');
  g.fillStyle = BEAD_TOKENS.board;
  g.fillRect(0, 0, SIDE, HEIGHT);
  g.fillStyle = VIEWER_TOKENS.subtle;
  g.beginPath();
  if (g.roundRect) g.roundRect(STAGE_INSET, STAGE_INSET, SIDE - STAGE_INSET * 2, SIDE - STAGE_INSET * 2, 48); else g.rect(STAGE_INSET, STAGE_INSET, SIDE - STAGE_INSET * 2, SIDE - STAGE_INSET * 2);
  g.fill();
  const cell = ART / Math.max(input.width, input.height);
  const x = (SIDE - input.width * cell) / 2;
  const y = (SIDE - input.height * cell) / 2;
  if (input.pattern) drawPattern(g, input.pattern, { x, y, cell, mode: 'bead' });
  else {
    const image = await loadImage(input.imageSrc);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(image, x, y, input.width * cell, input.height * cell);
  }
  g.fillStyle = VIEWER_TOKENS.ink;
  g.font = `600 56px ${CANVAS_FONT_SANS}`;
  g.fillText(input.title, 80, SIDE + 72, SIDE - 160);
  g.fillStyle = VIEWER_TOKENS.ink3;
  g.font = `400 30px ${CANVAS_FONT_SANS}`;
  g.fillText(input.meta, 80, SIDE + 128, SIDE - 160);
  g.fillStyle = VIEWER_TOKENS.ink;
  g.font = `400 34px ${CANVAS_FONT_BRAND}`;
  g.fillText(input.brand, 80, HEIGHT - 56);
  const offset = g.measureText(input.brand).width;
  g.fillStyle = VIEWER_TOKENS.ink3;
  g.font = `600 20px ${CANVAS_FONT_SANS}`;
  g.fillText(input.brandTag, 80 + offset + 16, HEIGHT - 60);
  return canvas;
}
