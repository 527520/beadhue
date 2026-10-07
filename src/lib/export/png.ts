/** PNG 图纸导出：统一规划、全不透明绘制，以及超限时图纸/图例拆分。 */
import { DEFAULT_BOARD_SIZE } from '@/lib/boardProfiles';
import { computeStats, totalBeadCount } from '@/lib/engine/generate';
import { boardSeamPositions, contrastColor, labelVisible } from '@/lib/render/layout';
import type { Pattern, PatternStatsItem } from '@/lib/types';
import { zhCN } from '@/messages/zh-CN';
import { EXPORT_CELL_PX_DEFAULT, clampCellPx, patternHasPaintedCells, pngFileName } from './layout';
import {
  PNG_BACKGROUND,
  PNG_LEGEND_SWATCH_TEXT_GAP,
  createPngExportPlan,
  createStandaloneLegendPlan,
  type PngExportPlan,
  type PngLegendPlan,
  type PngPatternPlan,
} from './pngPlan';

export interface ExportPngOptions {
  /** 每格像素 8–48，默认 20 */
  cellPx?: number;
  /** 裁剪至内容（外部格包围盒），默认开；按底板分页时不裁。 */
  cropToContent?: boolean;
  /** 下方独立 footer 图例（色块+色号+数量），默认关 */
  includeLegend?: boolean;
  /** 每格写上色号（格子够大时才画），默认开 */
  includeCodes?: boolean;
  /** 按底板分页：每块板一张 PNG（图例另一张），打包为 ZIP */
  byBoard?: boolean;
  /** 当前制作规格的一块板边长；缺省保持兼容规格。 */
  boardSize?: number;
}

export interface PngArtifact {
  blob: Blob;
  fileName: string;
}

export type ExportPngResult =
  | { ok: true; kind: 'single'; artifact: PngArtifact }
  | {
      ok: true;
      kind: 'split';
      pattern: PngArtifact;
      legend: PngArtifact;
      archiveFileName: string;
    }
  | { ok: true; kind: 'boards'; artifacts: PngArtifact[]; archiveFileName: string }
  | { ok: false; code: 'EMPTY_PATTERN' | 'CANVAS_TOO_LARGE' | 'ENCODE_FAILED' };

import { drawPattern, drawLegend, boardRegions } from './pngDrawing';

function splitArtifactNames(designName: string, width: number, height: number): {
  pattern: string;
  legend: string;
  archive: string;
} {
  const stem = pngFileName(designName, width, height).replace(/\.png$/u, '');
  return {
    pattern: zhCN.export.pngSplitPatternFile(stem),
    legend: zhCN.export.pngSplitLegendFile(stem),
    archive: zhCN.export.pngSplitArchiveFile(stem),
  };
}

function createOpaqueCanvas(size: { width: number; height: number }): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} | null {
  const canvas = document.createElement('canvas');
  try {
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      releaseCanvas(canvas);
      return null;
    }
    ctx.fillStyle = PNG_BACKGROUND;
    ctx.fillRect(0, 0, size.width, size.height);
    return { canvas, ctx };
  } catch (error) {
    releaseCanvas(canvas);
    throw error;
  }
}

function releaseCanvas(canvas: HTMLCanvasElement): void {
  try {
    canvas.width = 1;
    canvas.height = 1;
  } catch {
    // 释放路径不应覆盖原始绘制/编码错误。
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  if (typeof canvas.toBlob === 'function') {
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }
  try {
    const dataUrl = canvas.toDataURL('image/png');
    const binary = atob(dataUrl.split(',')[1]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return Promise.resolve(new Blob([bytes], { type: 'image/png' }));
  } catch {
    return Promise.resolve(null);
  }
}

async function renderSingle(
  pattern: Pattern,
  plan: Extract<PngExportPlan, { kind: 'single' }>,
  boardSize: number | undefined,
  codes: boolean,
): Promise<Blob | null> {
  const target = createOpaqueCanvas(plan.canvas);
  if (!target) return null;
  try {
    drawPattern(
      target.ctx,
      pattern,
      plan.pattern,
      plan.cellPx,
      plan.canvas.patternX,
      plan.canvas.patternY,
      boardSize,
      codes,
    );
    if (plan.legend) {
      drawLegend(target.ctx, plan.stats, plan.legend, plan.canvas.legendX, plan.canvas.legendY);
    }
    return await canvasToBlob(target.canvas);
  } finally {
    releaseCanvas(target.canvas);
  }
}

async function renderSplit(
  pattern: Pattern,
  plan: Extract<PngExportPlan, { kind: 'split' }>,
  boardSize: number | undefined,
  codes: boolean,
): Promise<{ pattern: Blob; legend: Blob } | null> {
  const patternTarget = createOpaqueCanvas(plan.patternCanvas);
  if (!patternTarget) return null;
  let patternBlob: Blob | null;
  try {
    drawPattern(patternTarget.ctx, pattern, plan.pattern, plan.cellPx, 0, 0, boardSize, codes);
    patternBlob = await canvasToBlob(patternTarget.canvas);
  } finally {
    releaseCanvas(patternTarget.canvas);
  }
  if (!patternBlob) return null;

  const legendTarget = createOpaqueCanvas(plan.legendCanvas);
  if (!legendTarget) return null;
  try {
    drawLegend(legendTarget.ctx, plan.stats, plan.legend, 0, 0);
    const legendBlob = await canvasToBlob(legendTarget.canvas);
    return legendBlob ? { pattern: patternBlob, legend: legendBlob } : null;
  } finally {
    releaseCanvas(legendTarget.canvas);
  }
}

export { boardRegions, type BoardRegion } from './pngDrawing';

async function renderCanvas(size: { width: number; height: number }, paint: (ctx: CanvasRenderingContext2D) => void): Promise<Blob | null> {
  const target = createOpaqueCanvas(size);
  if (!target) return null;
  try {
    paint(target.ctx);
    return await canvasToBlob(target.canvas);
  } finally {
    releaseCanvas(target.canvas);
  }
}

/** 按底板分页：每块板一张（不裁边，板内不画板缝），需要图例时另附一张，交给调用方打包。 */
async function exportBoards(pattern: Pattern, designName: string, options: ExportPngOptions): Promise<ExportPngResult> {
  if (!patternHasPaintedCells(pattern)) return { ok: false, code: 'EMPTY_PATTERN' };
  const cellPx = options.cellPx === undefined ? EXPORT_CELL_PX_DEFAULT : clampCellPx(options.cellPx);
  const boardSize = options.boardSize ?? DEFAULT_BOARD_SIZE;
  const stem = pngFileName(designName, pattern.width, pattern.height).replace(/\.png$/u, '');
  const artifacts: PngArtifact[] = [];
  for (const { row, col, ...region } of boardRegions(pattern.width, pattern.height, boardSize)) {
    const plan: PngPatternPlan = { ...region, width: region.widthCells * cellPx, height: region.heightCells * cellPx };
    const blob = await renderCanvas(plan, (ctx) => drawPattern(ctx, pattern, plan, cellPx, 0, 0, boardSize, options.includeCodes ?? true));
    if (!blob) return { ok: false, code: 'ENCODE_FAILED' };
    artifacts.push({ blob, fileName: zhCN.export.pngBoardFile(stem, row, col) });
  }
  if (options.includeLegend) {
    const stats = computeStats(pattern.cells);
    const legend = createStandaloneLegendPlan(stats, cellPx);
    if (legend) {
      const blob = await renderCanvas(legend, (ctx) => drawLegend(ctx, stats, legend, 0, 0));
      if (!blob) return { ok: false, code: 'ENCODE_FAILED' };
      artifacts.push({ blob, fileName: zhCN.export.pngSplitLegendFile(stem) });
    }
  }
  return { ok: true, kind: 'boards', artifacts, archiveFileName: zhCN.export.pngBoardsArchiveFile(stem) };
}

/** 导出为单张 PNG，或在合并画布超限时导出图纸/图例两张 artifact；按底板分页时每块板一张。 */
export async function exportPngBlob(
  pattern: Pattern,
  designName: string,
  options: ExportPngOptions = {},
): Promise<ExportPngResult> {
  try {
    if (options.byBoard) return await exportBoards(pattern, designName, options);
    const codes = options.includeCodes ?? true;
    const plan = createPngExportPlan(pattern, options);
    if (plan.kind === 'empty') return { ok: false, code: 'EMPTY_PATTERN' };
    if (plan.kind === 'too-large') return { ok: false, code: 'CANVAS_TOO_LARGE' };

    if (plan.kind === 'single') {
      const blob = await renderSingle(pattern, plan, options.boardSize, codes);
      if (!blob) return { ok: false, code: 'ENCODE_FAILED' };
      return {
        ok: true,
        kind: 'single',
        artifact: { blob, fileName: pngFileName(designName, pattern.width, pattern.height) },
      };
    }

    const blobs = await renderSplit(pattern, plan, options.boardSize, codes);
    if (!blobs) return { ok: false, code: 'ENCODE_FAILED' };
    const names = splitArtifactNames(designName, pattern.width, pattern.height);
    return {
      ok: true,
      kind: 'split',
      pattern: { blob: blobs.pattern, fileName: names.pattern },
      legend: { blob: blobs.legend, fileName: names.legend },
      archiveFileName: names.archive,
    };
  } catch {
    return { ok: false, code: 'ENCODE_FAILED' };
  }
}
