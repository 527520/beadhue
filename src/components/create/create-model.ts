/**
 * 创作入口与「新建图纸」弹窗的纯几何与尺寸计算（原型 create.js / editor/catalog.js）。
 * 取景框坐标一律是原图自然像素；宽高比由裁剪比例（原图 / 1:1 / 按底板）决定，拖角时保持不变。
 */
import { LIMITS } from '@/lib/appInfo';
import { patternRows } from '@/lib/engine/generate';
import type { Rect } from '@/lib/crop/layout';

export type CropRatio = 'original' | 'square' | 'board';
export type CropHandle = 'nw' | 'ne' | 'sw' | 'se';

export const WIDTH_MIN = LIMITS.targetWidth.min;
export const WIDTH_MAX = LIMITS.targetWidth.max;
/** 空白画布的边长下限沿用 D42（与生成宽度同一区间）。 */
export const BLANK_MIN = LIMITS.targetWidth.min;
export const BLANK_MAX = LIMITS.targetWidth.max;
/** 取景框最短边不小于原图短边的 15%，避免缩成一个点。 */
const MIN_SIDE_RATIO = 0.15;

export const clampInt = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.round(value)));

/** 图纸宽度芯片：1 / 2 / 3 块底板。 */
export function boardWidths(board: number): Array<{ boards: number; width: number }> {
  return [1, 2, 3].map((boards) => ({ boards, width: boards * board }));
}

export function boardsOf(width: number, height: number, board: number): { cols: number; rows: number; total: number } {
  const cols = Math.ceil(width / board);
  const rows = Math.ceil(height / board);
  return { cols, rows, total: cols * rows };
}

/** 与引擎同一口径的行数（按取景框比例，最多 200 行）。 */
export function patternHeight(width: number, crop: Pick<Rect, 'width' | 'height'>): number {
  return patternRows(crop.width, crop.height, width).rows;
}

/** 裁剪比例对应的取景框高宽比。「按底板」让行数凑成整块底板。 */
export function ratioAspect(ratio: CropRatio, natW: number, natH: number, width: number, board: number): number {
  if (ratio === 'square') return 1;
  if (ratio === 'board') {
    const cols = Math.max(1, Math.ceil(width / board));
    return Math.max(1, Math.round((cols * natH) / natW)) / cols;
  }
  return natH / natW;
}

/** 给定高宽比的最大居中取景框。 */
export function centeredCrop(aspect: number, natW: number, natH: number): Rect {
  let width = natW;
  let height = width * aspect;
  if (height > natH) {
    height = natH;
    width = height / aspect;
  }
  return { x: (natW - width) / 2, y: (natH - height) / 2, width, height };
}

/** 整体移动（钳在原图内）。 */
export function moveCrop(start: Rect, dx: number, dy: number, natW: number, natH: number): Rect {
  return {
    ...start,
    x: Math.max(0, Math.min(natW - start.width, start.x + dx)),
    y: Math.max(0, Math.min(natH - start.height, start.y + dy)),
  };
}

/** 拖角等比缩放：对角固定，比例取开始拖动时的取景框。 */
export function resizeCrop(start: Rect, handle: CropHandle, dx: number, dy: number, natW: number, natH: number): Rect {
  const aspect = start.height / start.width;
  const left = handle === 'nw' || handle === 'sw';
  const top = handle === 'nw' || handle === 'ne';
  const ax = left ? start.x + start.width : start.x;
  const ay = top ? start.y + start.height : start.y;
  const minSide = Math.min(natW, natH) * MIN_SIDE_RATIO;
  const minWidth = aspect >= 1 ? minSide / aspect : minSide;
  let width = Math.max(left ? start.width - dx : start.width + dx, (top ? start.height - dy : start.height + dy) / aspect, minWidth);
  width = Math.min(width, left ? ax : natW - ax, (top ? ay : natH - ay) / aspect);
  const height = width * aspect;
  return { x: left ? ax - width : ax, y: top ? ay - height : ay, width, height };
}

/** 提交给解码器的整数选区（至少 1 像素）。 */
export function roundCrop(rect: Rect, natW: number, natH: number): Rect {
  const x = Math.max(0, Math.min(natW - 1, Math.round(rect.x)));
  const y = Math.max(0, Math.min(natH - 1, Math.round(rect.y)));
  return {
    x,
    y,
    width: Math.max(1, Math.min(natW - x, Math.round(rect.width))),
    height: Math.max(1, Math.min(natH - y, Math.round(rect.height))),
  };
}
