/**
 * 豆粒渲染（D65 签名元素，移植自原型 prototype/js/beads.js）。
 * bead = 白色钉板上带孔的圆豆（缩略图与详情默认）；flat = 方格（编辑用，可叠网格、板缝、色号）。
 * 只依赖 2D 上下文，不读 DOM；patternCanvas 需要浏览器 document（或注入的画布工厂）。
 */
import type { Pattern, PatternCell } from '@/lib/types';
import { BEAD_SAMPLE_COLORS, BEAD_TOKENS } from './beadTokens';

export type BeadMode = 'bead' | 'flat';

export interface PatternHighlight {
  col: number;
  row: number;
  w?: number;
  h?: number;
  color?: string;
}

export interface DrawPatternOptions {
  x?: number;
  y?: number;
  /** 每格像素 */
  cell: number;
  mode?: BeadMode;
  /** 方格模式网格线（每格 ≥5px 才画） */
  grid?: boolean;
  /** 方格模式板缝线 */
  seams?: boolean;
  /** 方格模式色号（每格 ≥18px 才画，D67） */
  codes?: boolean;
  /** 底板行列数（板缝间隔） */
  board?: number;
  /** 豆粒模式空格画钉子 */
  pegs?: boolean;
  /** 方格模式底色；null 为透明 */
  base?: string | null;
  highlight?: PatternHighlight | null;
}

type Rgb = [number, number, number];
const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];

export function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 把 hex 向目标色按比例混合，返回 rgb() 字符串。 */
export function mixRgb(hex: string, target: Rgb, amount: number): string {
  const source = hexToRgb(hex);
  return `rgb(${source.map((value, index) => Math.round(value + (target[index] - value) * amount)).join(',')})`;
}

/** WCAG 相对亮度（0–1）。 */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 可拼、需要上豆的格子（透明与背景外部格不上豆）。 */
export function beadHex(cell: PatternCell | undefined): string | null {
  if (!cell || cell.transparent || cell.external || !cell.hex) return null;
  return cell.hex;
}

/** 在 ctx 上以 (x, y) 为左上角、每格 cell 像素绘制图纸，返回绘制尺寸。 */
export function drawPattern(ctx: CanvasRenderingContext2D, pattern: Pattern, options: DrawPatternOptions): { w: number; h: number } {
  const { x = 0, y = 0, cell, mode = 'bead', grid = false, seams = false, codes = false, board = 29, pegs = true, highlight = null } = options;
  const { width, height, cells } = pattern;
  const w = width * cell;
  const h = height * cell;
  ctx.save();
  if (mode === 'bead') {
    ctx.fillStyle = BEAD_TOKENS.board;
    ctx.fillRect(x, y, w, h);
    const radius = cell * 0.47;
    const hole = cell * 0.14;
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        const hex = beadHex(cells[row * width + col]);
        const cx = x + col * cell + cell / 2;
        const cy = y + row * cell + cell / 2;
        if (!hex) {
          if (pegs && cell >= 4) {
            ctx.fillStyle = BEAD_TOKENS.peg;
            ctx.beginPath();
            ctx.arc(cx, cy, Math.max(0.6, cell * 0.09), 0, Math.PI * 2);
            ctx.fill();
          }
          continue;
        }
        ctx.fillStyle = hex;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        if (cell >= 7) {
          if (cell >= 10) {
            ctx.strokeStyle = mixRgb(hex, BLACK, 0.1);
            ctx.lineWidth = Math.max(0.5, cell * 0.04);
            ctx.stroke();
          }
          ctx.fillStyle = mixRgb(hex, WHITE, 0.66);
          ctx.beginPath();
          ctx.arc(cx, cy, hole, 0, Math.PI * 2);
          ctx.fill();
        } else if (cell >= 4) {
          ctx.fillStyle = mixRgb(hex, WHITE, 0.5);
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(0.5, hole * 0.8), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  } else {
    if (options.base !== null) {
      ctx.fillStyle = options.base ?? BEAD_TOKENS.board;
      ctx.fillRect(x, y, w, h);
    }
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        const hex = beadHex(cells[row * width + col]);
        if (!hex) continue;
        ctx.fillStyle = hex;
        ctx.fillRect(x + col * cell, y + row * cell, cell, cell);
      }
    }
    if (grid && cell >= 5) {
      ctx.strokeStyle = BEAD_TOKENS.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let col = 0; col <= width; col += 1) {
        const px = Math.round(x + col * cell) + 0.5;
        ctx.moveTo(px, y);
        ctx.lineTo(px, y + h);
      }
      for (let row = 0; row <= height; row += 1) {
        const py = Math.round(y + row * cell) + 0.5;
        ctx.moveTo(x, py);
        ctx.lineTo(x + w, py);
      }
      ctx.stroke();
    }
    if (seams && board > 0) {
      ctx.strokeStyle = BEAD_TOKENS.seam;
      ctx.lineWidth = Math.max(1.5, cell * 0.08);
      ctx.beginPath();
      for (let col = board; col < width; col += board) {
        ctx.moveTo(x + col * cell, y);
        ctx.lineTo(x + col * cell, y + h);
      }
      for (let row = board; row < height; row += board) {
        ctx.moveTo(x, y + row * cell);
        ctx.lineTo(x + w, y + row * cell);
      }
      ctx.stroke();
    }
    if (codes && cell >= 18) {
      ctx.font = `600 ${Math.round(cell * 0.3)}px ui-monospace, Menlo, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let row = 0; row < height; row += 1) {
        for (let col = 0; col < width; col += 1) {
          const item = cells[row * width + col];
          const hex = beadHex(item);
          if (!hex || !item.code) continue;
          ctx.fillStyle = luminance(hex) > 0.45 ? BEAD_TOKENS.codeOnLight : BEAD_TOKENS.codeOnDark;
          ctx.fillText(item.code, x + col * cell + cell / 2, y + row * cell + cell / 2 + 0.5);
        }
      }
    }
  }
  if (highlight) {
    ctx.strokeStyle = highlight.color ?? BEAD_TOKENS.highlight;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + highlight.col * cell, y + highlight.row * cell, (highlight.w ?? 1) * cell, (highlight.h ?? 1) * cell);
  }
  ctx.restore();
  return { w, h };
}

export interface PatternCanvasOptions extends Omit<DrawPatternOptions, 'cell' | 'x' | 'y'> {
  /** 四周留白占边长的比例（钉板边） */
  pad?: number;
  /** 画布底色；透明用 'transparent' */
  background?: string;
  /** 设备像素比（默认取 window.devicePixelRatio，上限 2） */
  dpr?: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

export function devicePixelRatioCap(): number {
  return typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1);
}

/** 计算图纸居中、按比例适配后的每格尺寸与偏移。 */
export function fitPattern(pattern: Pick<Pattern, 'width' | 'height'>, size: CanvasSize, pad = 0.08): { cell: number; x: number; y: number } {
  const inner = Math.min(size.width, size.height) * (1 - pad * 2);
  const cell = inner / Math.max(pattern.width, pattern.height, 1);
  return { cell, x: (size.width - cell * pattern.width) / 2, y: (size.height - cell * pattern.height) / 2 };
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

/** 像素小图标（类目条）的绘制参数：平铺方格、无网格、透明底。 */
export const PIXEL_ICON_OPTIONS: PatternCanvasOptions = { mode: 'flat', pad: 0, background: 'transparent', base: null };

/**
 * 用紧凑的字符网格描述小图案：每行一段，'.' 为空格，其余字符按 palette 取色。
 * 例：keysPattern(['.R.', 'RRR'], { R: '#E0473F' })。
 */
export function keysPattern(rows: readonly string[], palette: Readonly<Record<string, string>>): Pattern {
  const width = Math.max(0, ...rows.map((row) => row.length));
  const cells: PatternCell[] = [];
  for (const row of rows) {
    for (let col = 0; col < width; col += 1) {
      const key = row[col] ?? '.';
      const hex = key === '.' ? null : (palette[key] ?? null);
      cells.push({ hex, code: null, transparent: hex === null });
    }
  }
  return { width, height: rows.length, cells };
}

/** 空状态插画：空钉板上散落几颗豆（原型 ui.js ART）。 */
export type EmptyArtKind = 'empty' | 'search' | 'designs' | 'comments' | 'likes';

const ART: Record<EmptyArtKind, string> = {
  search: '.........|..KKK....|.K...K...|.K...K...|.K...K...|..KKKK...|......K..|.......K.|.........',
  designs: '.........|.........|...R.....|..RRR....|...R..Y..|.......Y.|..B......|.BBB..G..|..B......',
  comments: '.........|.BBBBBBB.|.B.....B.|.B.Y.Y.B.|.B.....B.|.BBBBBBB.|..BB.....|..B......|.........',
  likes: '.........|..RR.RR..|.RRRRRRR.|.RRRRRRR.|..RRRRR..|...RRR...|....R....|.........|.........',
  empty: '.........|.........|.........|...Y.....|.........|.....R...|..B......|.........|.........',
};

export function emptyArtPattern(kind: EmptyArtKind = 'empty'): Pattern {
  return keysPattern((ART[kind] ?? ART.empty).split('|'), BEAD_SAMPLE_COLORS);
}

/** 用色统计：按颗数降序。 */
export function colorUsage(pattern: Pattern): Array<{ hex: string; code: string | null; count: number }> {
  const counts = new Map<string, { hex: string; code: string | null; count: number }>();
  for (const cell of pattern.cells) {
    const hex = beadHex(cell);
    if (!hex) continue;
    const key = `${cell.code ?? ''}|${hex}`;
    const item = counts.get(key);
    if (item) item.count += 1;
    else counts.set(key, { hex, code: cell.code, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}
