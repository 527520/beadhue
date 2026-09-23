/**
 * 服务端图纸缩略图（D67）：豆粒渲染——白色钉板底上画带孔的圆豆，空格只画淡钉点，
 * 不画格线与板缝，比例与原型 `prototype/js/beads.js` 的 bead 模式一致：
 * 豆半径 0.47 格、孔半径 0.14 格、每格 ≥10px 时加一圈 10% 深色描边；
 * 每格不足 7px 时孔缩小且更淡，不足 4px 时不画孔也不画钉点。
 * 边缘按超采样覆盖率抗锯齿，光栅化为 RGB 后编码 PNG。
 * 用于豆社列表、首页、我的设计、后台列表与匿名访客的详情大图。
 */
import type { Pattern, PatternCell } from '@/lib/types';
import { encodeRgbPng, type RgbImage } from './png';
import { thumbnailCellSize, type ThumbnailSize } from './thumbnailSize';

export interface ThumbnailOptions {
  /** default：列表缩略图（长边 720）；large：详情页匿名大图（长边 1440）。 */
  size?: ThumbnailSize;
}

type Rgb = readonly [number, number, number];

const BOARD: Rgb = [255, 255, 255];
const PEG: Rgb = [0xeb, 0xeb, 0xef];
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
const BEAD_RADIUS = 0.47;
const HOLE_RADIUS = 0.14;
const PEG_RADIUS = 0.09;
/** 每个像素 8×8 个采样点；模板每次渲染只算一次，成本与图纸大小无关。 */
const SUPERSAMPLE = 8;

function parseHex(hex: string | null): Rgb | null {
  const match = hex ? /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/iu.exec(hex) : null;
  return match ? [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)] : null;
}

/** 与原型 `mix()` 相同：各通道向目标色线性插值后取整。 */
function mix(color: Rgb, target: Rgb, amount: number): Rgb {
  return [
    Math.round(color[0] + (target[0] - color[0]) * amount),
    Math.round(color[1] + (target[1] - color[1]) * amount),
    Math.round(color[2] + (target[2] - color[2]) * amount),
  ];
}

/** 一格内每个像素被「距格心 [inner, outer] 的圆环」覆盖的比例；inner 为 0 即实心圆。 */
function coverage(cellPx: number, inner: number, outer: number): Float32Array {
  const result = new Float32Array(cellPx * cellPx);
  if (outer <= 0) return result;
  const center = cellPx / 2;
  const step = 1 / SUPERSAMPLE;
  for (let y = 0; y < cellPx; y += 1) {
    for (let x = 0; x < cellPx; x += 1) {
      let hits = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        const dy = y + (sy + 0.5) * step - center;
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const dx = x + (sx + 0.5) * step - center;
          const distance = Math.hypot(dx, dy);
          if (distance <= outer && distance >= inner) hits += 1;
        }
      }
      result[y * cellPx + x] = hits / (SUPERSAMPLE * SUPERSAMPLE);
    }
  }
  return result;
}

interface BeadMasks {
  cellPx: number;
  bead: Float32Array;
  stroke: Float32Array | null;
  hole: Float32Array | null;
  holeTint: number;
  peg: Float32Array | null;
}

function beadMasks(cellPx: number): BeadMasks {
  const radius = cellPx * BEAD_RADIUS;
  const lineWidth = Math.max(0.5, cellPx * 0.04);
  const holeRadius = cellPx >= 7 ? cellPx * HOLE_RADIUS : cellPx >= 4 ? Math.max(0.5, cellPx * HOLE_RADIUS * 0.8) : 0;
  return {
    cellPx,
    bead: coverage(cellPx, 0, radius),
    stroke: cellPx >= 10 ? coverage(cellPx, radius - lineWidth / 2, radius + lineWidth / 2) : null,
    hole: holeRadius > 0 ? coverage(cellPx, 0, holeRadius) : null,
    holeTint: cellPx >= 7 ? 0.66 : 0.5,
    peg: cellPx >= 4 ? coverage(cellPx, 0, Math.max(0.6, cellPx * PEG_RADIUS)) : null,
  };
}

/** 按覆盖率逐层叠色（钉板 → 豆 → 描边 → 孔），与画布的绘制顺序一致。 */
function paintTile(masks: BeadMasks, layers: Array<[Float32Array | null, Rgb]>): Uint8Array {
  const pixels = masks.cellPx * masks.cellPx;
  const tile = new Uint8Array(pixels * 3);
  for (let index = 0; index < pixels; index += 1) {
    let r = BOARD[0]; let g = BOARD[1]; let b = BOARD[2];
    for (const [mask, color] of layers) {
      const alpha = mask ? mask[index] : 0;
      if (alpha <= 0) continue;
      r += (color[0] - r) * alpha; g += (color[1] - g) * alpha; b += (color[2] - b) * alpha;
    }
    tile[index * 3] = Math.round(r); tile[index * 3 + 1] = Math.round(g); tile[index * 3 + 2] = Math.round(b);
  }
  return tile;
}

function beadTile(masks: BeadMasks, color: Rgb): Uint8Array {
  return paintTile(masks, [
    [masks.bead, color],
    [masks.stroke, mix(color, BLACK, 0.1)],
    [masks.hole, mix(color, WHITE, masks.holeTint)],
  ]);
}

/** 可拼格才画豆：透明格、背景外部格与缺色格都显示为空钉位。 */
function beadColor(cell: PatternCell | undefined): Rgb | null {
  if (!cell || cell.transparent || cell.external) return null;
  return parseHex(cell.hex);
}

/** 光栅化图纸；返回紧密 RGB 图像。 */
export function rasterizePattern(pattern: Pattern, options: ThumbnailOptions = {}): RgbImage {
  const cellPx = thumbnailCellSize(pattern.width, pattern.height, options.size ?? 'default');
  const width = pattern.width * cellPx;
  const height = pattern.height * cellPx;
  const data = new Uint8Array(width * height * 3);
  const masks = beadMasks(cellPx);
  const emptyTile = paintTile(masks, [[masks.peg, PEG]]);
  const tiles = new Map<string, Uint8Array>();
  const rowBytes = cellPx * 3;
  for (let y = 0; y < pattern.height; y += 1) {
    for (let x = 0; x < pattern.width; x += 1) {
      const cell = pattern.cells[y * pattern.width + x];
      const color = beadColor(cell);
      let tile = emptyTile;
      if (color) {
        const key = color.join(',');
        tile = tiles.get(key) ?? beadTile(masks, color);
        tiles.set(key, tile);
      }
      for (let row = 0; row < cellPx; row += 1) {
        data.set(tile.subarray(row * rowBytes, (row + 1) * rowBytes), ((y * cellPx + row) * width + x * cellPx) * 3);
      }
    }
  }
  return { width, height, data };
}

export function renderPatternThumbnail(pattern: Pattern, options: ThumbnailOptions = {}): Buffer {
  return encodeRgbPng(rasterizePattern(pattern, options));
}

/**
 * 进程内 LRU：修订不可变，同一修订的 PNG 只需渲染一次；按字节预算 + 条数上限淘汰，
 * 避免列表页每次冷加载都对 24 张图纸重新光栅化。
 *
 * 两个槽位（同一份 Map，公开槽位带前缀）：
 * - `get` / `set`：管理端与「我的设计」使用，可能装着**草稿**或私人设计的图，命中不代表公开；
 * - `getPublic` / `setPublic`：公开路由使用，只有「当前公开修订」的渲染结果才允许写入。
 *   公开路径把命中当作「该修订公开」的证据，从而跳过读库鉴权；两个槽位绝不能串用，
 *   否则后台看过的草稿图会被匿名访客凭修订编号取走。
 */
const PUBLIC_SLOT_PREFIX = '\u0000public\u0000';

export class ThumbnailCache {
  private readonly entries = new Map<string, Buffer>();
  private bytes = 0;
  private readonly maxEntries: number;
  constructor(private readonly budgetBytes = 32 * 1024 * 1024, maxEntries = Number.MAX_SAFE_INTEGER) {
    // 至少留 1 条：否则每次 set 都会立刻把自己淘汰掉（等于关闭缓存）。
    this.maxEntries = Math.max(1, maxEntries);
  }
  get(key: string): Buffer | undefined {
    const value = this.entries.get(key);
    if (value) { this.entries.delete(key); this.entries.set(key, value); }
    return value;
  }
  set(key: string, value: Buffer): void {
    this.put(key, value);
  }
  /** 公开缩略图槽位：仅当修订当前公开时可写。 */
  getPublic(key: string): Buffer | undefined {
    return this.get(PUBLIC_SLOT_PREFIX + key);
  }
  setPublic(key: string, value: Buffer): void {
    this.put(PUBLIC_SLOT_PREFIX + key, value);
  }
  private put(key: string, value: Buffer): void {
    const existing = this.entries.get(key);
    if (existing) { this.bytes -= existing.length; this.entries.delete(key); }
    this.entries.set(key, value);
    this.bytes += value.length;
    for (const [oldest, buffer] of this.entries) {
      if (this.bytes <= this.budgetBytes && this.entries.size <= this.maxEntries) break;
      this.entries.delete(oldest);
      this.bytes -= buffer.length;
    }
  }
  get size() { return this.entries.size; }
}
