/**
 * 编辑器工作区的纯数据与相机数学（原型 editor/viewport.js、catalog.js、panels.js）。
 * 不依赖 DOM，服务端也能调用；绘制与手势在 editor-canvas / use-editor-document。
 */
import { describeColorName } from '@/lib/palettes/colorNames';
import type { GridCamera, GridViewportSize } from '@/lib/render/gridViewport';
import type { PaletteColor, PatternStatsItem } from '@/lib/types';
import { zhCN } from '@/messages/zh-CN';

export type EditorTool = 'hand' | 'brush' | 'eraser' | 'fill' | 'pick' | 'replace';
export type EditorMode = 'edit' | 'stitch';
export type PanelTab = 'colors' | 'adjust' | 'info';

/** 工具与快捷键（原型 TOOLS）。 */
export const TOOL_KEYS: ReadonlyArray<[EditorTool, string]> = [
  ['hand', 'H'],
  ['brush', 'B'],
  ['eraser', 'E'],
  ['fill', 'G'],
  ['pick', 'I'],
  ['replace', 'R'],
];

export const toolForKey = (key: string): EditorTool | null =>
  TOOL_KEYS.find(([, shortcut]) => shortcut.toLowerCase() === key.toLowerCase())?.[0] ?? null;

// ---------- 相机 ----------

/** 100% 缩放对应的格宽（原型 BASE_CELL）。 */
export const BASE_CELL = 20;
export const MAX_CELL = 80;
const MIN_CELL = 1;
/** 缩放档位：按钮与滚轮每次走一档。 */
export const ZOOM_STEPS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80] as const;
export const ZOOM_PRESETS = [50, 100, 200, 400] as const;
/** 色号只在每格 ≥18px 时画（D67）。 */
export const CODES_MIN_CELL = 18;
/** 适配时四周留给浮层（尺寸胶囊、原图胶囊、缩放胶囊）的边距。 */
export const FIT_MARGINS = { top: 60, right: 40, bottom: 76, left: 40 } as const;
/** 平移时至少留在视野里的图纸像素。 */
const KEEP_VISIBLE = 48;

const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));

export const zoomPercent = (cellPx: number) => Math.round((cellPx / BASE_CELL) * 100);

export function fitEditorCamera(patternW: number, patternH: number, size: GridViewportSize): GridCamera {
  const m = FIT_MARGINS;
  const aw = Math.max(40, size.width - m.left - m.right);
  const ah = Math.max(40, size.height - m.top - m.bottom);
  let cell = Math.min(aw / Math.max(1, patternW), ah / Math.max(1, patternH), 48);
  cell = cell >= 4 ? Math.floor(cell) : Math.max(MIN_CELL, cell);
  return {
    cellPx: cell,
    offsetX: Math.round(m.left + (aw - patternW * cell) / 2),
    offsetY: Math.round(m.top + (ah - patternH * cell) / 2),
  };
}

/** 平移范围：图纸至少留 48px 在视野内，不会被拖丢。 */
export function clampEditorCamera(camera: GridCamera, patternW: number, patternH: number, size: GridViewportSize): GridCamera {
  if (size.width <= 0 || size.height <= 0) return camera;
  return {
    cellPx: camera.cellPx,
    offsetX: clamp(camera.offsetX, KEEP_VISIBLE - patternW * camera.cellPx, size.width - KEEP_VISIBLE),
    offsetY: clamp(camera.offsetY, KEEP_VISIBLE - patternH * camera.cellPx, size.height - KEEP_VISIBLE),
  };
}

export function zoomEditorCameraAt(camera: GridCamera, nextCell: number, x: number, y: number): GridCamera {
  const next = clamp(nextCell, MIN_CELL, MAX_CELL);
  const k = next / camera.cellPx;
  return { cellPx: next, offsetX: x - (x - camera.offsetX) * k, offsetY: y - (y - camera.offsetY) * k };
}

/** 从当前格宽走到下一档（dir 1 放大，-1 缩小）。 */
export function stepZoom(cellPx: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find((step) => step > cellPx + 0.01) ?? MAX_CELL;
  return [...ZOOM_STEPS].reverse().find((step) => step < cellPx - 0.01) ?? Math.min(cellPx, ZOOM_STEPS[0]);
}

/** 让某个格子进入视野（键盘光标移出视野时用）。 */
export function revealCell(camera: GridCamera, row: number, col: number, size: GridViewportSize): GridCamera {
  const x = camera.offsetX + col * camera.cellPx;
  const y = camera.offsetY + row * camera.cellPx;
  const pad = camera.cellPx * 2;
  if (x >= pad && y >= pad && x + camera.cellPx <= size.width - pad && y + camera.cellPx <= size.height - pad) return camera;
  return {
    cellPx: camera.cellPx,
    offsetX: Math.round(size.width / 2 - (col + 0.5) * camera.cellPx),
    offsetY: Math.round(size.height / 2 - (row + 0.5) * camera.cellPx),
  };
}

// ---------- 底板与颜色 ----------

export function boardsOf(width: number, height: number, board: number) {
  const cols = Math.ceil(width / board);
  const rows = Math.ceil(height / board);
  return { cols, rows, total: cols * rows };
}

/** 图纸宽度芯片：1 / 2 / 3 块板宽（超过 200 格的档位不提供）。 */
export const boardWidths = (board: number) =>
  [1, 2, 3].map((boards) => ({ boards, width: boards * board })).filter((option) => option.width <= 200);

/** 豆色的显示名：色号 + 按 HEX 推导的色系名（内置目录没有官方颜色名）。 */
export function colorName(hex: string): string {
  return describeColorName(hex);
}

export function colorLabel(color: Pick<PaletteColor, 'code' | 'hex'> | null | undefined): string {
  if (!color) return zhCN.editorWorkspace.emptyCell;
  return `${color.code ?? color.hex} ${colorName(color.hex)}`;
}

export const sameColor = (a: PaletteColor | null | undefined, b: PaletteColor | null | undefined) =>
  Boolean(a && b && a.hex.toUpperCase() === b.hex.toUpperCase() && (a.code ?? '') === (b.code ?? ''));

/** 图纸用色：统计已按颗数降序（引擎 computeStats）。 */
export function usedColors(stats: readonly PatternStatsItem[]): PatternStatsItem[] {
  return [...stats].sort((a, b) => b.count - a.count || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

export function matchesColorQuery(color: PaletteColor, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (color.code ?? '').toLowerCase().includes(q) || color.hex.toLowerCase().includes(q) || colorName(color.hex).includes(q);
}

export const formatCount = (value: number) => value.toLocaleString('zh-CN');

/** 采购清单每包颗数的选项；当前值不在其中时也列出。 */
export function packOptions(current: number): number[] {
  const base = [500, 1000, 2000, 5000];
  return base.includes(current) ? base : [...base, current].sort((a, b) => a - b);
}

export const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const modKey = () => (isMac() ? '⌘' : 'Ctrl+');
export const shiftModKey = () => (isMac() ? '⇧⌘' : 'Ctrl+Shift+');
