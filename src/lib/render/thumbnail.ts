/**
 * 服务端图纸缩略图：与工作台 / 详情页 `drawPattern` 同一套视觉规则
 * （色块 + 细格线 + 板缝粗线，不画色号文字），光栅化为 RGB 后编码 PNG。
 * 用于豆社列表卡片、首页货架、我的投稿与后台列表，让「没点进去」的卡片
 * 与详情页看起来一致。
 */
import type { Pattern } from '@/lib/types';
import { boardSeamPositions } from './layout';
import { encodeRgbPng, type RgbImage } from './png';
import { thumbnailCellSize, type ThumbnailSize } from './thumbnailSize';

export interface ThumbnailOptions {
  boardSize: number;
  /** 透明格（背景）颜色。 */
  background?: string;
  /** 背景外部格颜色。 */
  externalColor?: string;
  /** default：列表缩略图（长边 720）；large：详情页匿名大图（长边 1440）。 */
  size?: ThumbnailSize;
}

const DEFAULTS = { background: '#F5F1EB', externalColor: '#D1D5DB' } as const;
const GRID_ALPHA = 0.18;
const SEAM_ALPHA = 0.55;

function parseHex(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/iu.exec(hex);
  if (!match) return [0, 0, 0];
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
}

/** 光栅化图纸；返回紧密 RGB 图像。 */
export function rasterizePattern(pattern: Pattern, options: ThumbnailOptions): RgbImage {
  const cellPx = thumbnailCellSize(pattern.width, pattern.height, options.size ?? 'default');
  const width = pattern.width * cellPx;
  const height = pattern.height * cellPx;
  const data = new Uint8Array(width * height * 3);
  const [bgR, bgG, bgB] = parseHex(options.background ?? DEFAULTS.background);
  const [exR, exG, exB] = parseHex(options.externalColor ?? DEFAULTS.externalColor);

  // 色块
  for (let y = 0; y < pattern.height; y += 1) {
    for (let x = 0; x < pattern.width; x += 1) {
      const cell = pattern.cells[y * pattern.width + x];
      let r = bgR; let g = bgG; let b = bgB;
      if (cell && !cell.transparent) {
        if (cell.external) { r = exR; g = exG; b = exB; }
        else if (cell.hex) { [r, g, b] = parseHex(cell.hex); }
      }
      for (let dy = 0; dy < cellPx; dy += 1) {
        let offset = ((y * cellPx + dy) * width + x * cellPx) * 3;
        for (let dx = 0; dx < cellPx; dx += 1) {
          data[offset] = r; data[offset + 1] = g; data[offset + 2] = b;
          offset += 3;
        }
      }
    }
  }

  const darken = (px: number, py: number, alpha: number) => {
    if (px < 0 || py < 0 || px >= width || py >= height) return;
    const offset = (py * width + px) * 3;
    const keep = 1 - alpha;
    data[offset] = Math.round(data[offset] * keep);
    data[offset + 1] = Math.round(data[offset + 1] * keep);
    data[offset + 2] = Math.round(data[offset + 2] * keep);
  };
  const vertical = (px: number, alpha: number) => { for (let py = 0; py < height; py += 1) darken(px, py, alpha); };
  const horizontal = (py: number, alpha: number) => { for (let px = 0; px < width; px += 1) darken(px, py, alpha); };

  // 细格线：每个格子左/上边缘一条，图像右/下边缘各补一条闭合。
  for (let x = 0; x < pattern.width; x += 1) vertical(x * cellPx, GRID_ALPHA);
  vertical(width - 1, GRID_ALPHA);
  for (let y = 0; y < pattern.height; y += 1) horizontal(y * cellPx, GRID_ALPHA);
  horizontal(height - 1, GRID_ALPHA);

  // 板缝粗线（居中于格子边界）
  const seamWidth = Math.max(2, Math.round(cellPx / 8));
  const seamStart = -Math.floor(seamWidth / 2);
  for (const position of boardSeamPositions(pattern.width, options.boardSize)) {
    for (let k = 0; k < seamWidth; k += 1) vertical(position * cellPx + seamStart + k, SEAM_ALPHA);
  }
  for (const position of boardSeamPositions(pattern.height, options.boardSize)) {
    for (let k = 0; k < seamWidth; k += 1) horizontal(position * cellPx + seamStart + k, SEAM_ALPHA);
  }

  return { width, height, data };
}

export function renderPatternThumbnail(pattern: Pattern, options: ThumbnailOptions): Buffer {
  return encodeRgbPng(rasterizePattern(pattern, options));
}

/**
 * 进程内 LRU：修订不可变，同一修订的 PNG 只需渲染一次；按字节预算 + 条数上限淘汰，
 * 避免列表页每次冷加载都对 24 张图纸重新光栅化。
 *
 * 两个槽位（同一份 Map，公开槽位带前缀）：
 * - `get` / `set`：管理端使用，可能装着**草稿**修订的图，命中不代表该修订公开；
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
