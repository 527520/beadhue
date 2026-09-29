import { DEFAULT_BOARD_SIZE } from "@/lib/boardProfiles";
import { totalBeadCount } from "@/lib/engine/generate";
import {
  boardSeamPositions,
  contrastColor,
  labelVisible,
} from "@/lib/render/layout";
import type { Pattern, PatternStatsItem } from "@/lib/types";
import { zhCN } from "@/messages/zh-CN";
import {
  PNG_LEGEND_SWATCH_TEXT_GAP,
  type PngPatternPlan,
  type PngLegendPlan,
} from "./pngPlan";
const LABEL_FONT_FAMILY =
  'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
export function drawPattern(
  ctx: CanvasRenderingContext2D,
  pattern: Pattern,
  plan: PngPatternPlan,
  cellPx: number,
  originX: number,
  originY: number,
  boardSize?: number,
  codes = true,
  fontFamily = LABEL_FONT_FAMILY,
): void {
  const {
    sourceX,
    sourceY,
    widthCells,
    heightCells,
    width: patternPxW,
    height: patternPxH,
  } = plan;

  for (let y = 0; y < heightCells; y++) {
    for (let x = 0; x < widthCells; x++) {
      const cell = pattern.cells[(y + sourceY) * pattern.width + (x + sourceX)];
      if (cell.transparent || cell.external) continue;
      ctx.fillStyle = cell.hex!;
      ctx.fillRect(originX + x * cellPx, originY + y * cellPx, cellPx, cellPx);
    }
  }

  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= widthCells; x++) {
    const lineX = originX + x * cellPx + 0.5;
    ctx.moveTo(lineX, originY);
    ctx.lineTo(lineX, originY + patternPxH);
  }
  for (let y = 0; y <= heightCells; y++) {
    const lineY = originY + y * cellPx + 0.5;
    ctx.moveTo(originX, lineY);
    ctx.lineTo(originX + patternPxW, lineY);
  }
  ctx.stroke();

  if (cellPx >= 4) {
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = Math.max(2, Math.round(cellPx / 8));
    ctx.beginPath();
    for (const position of boardSeamPositions(pattern.width, boardSize)) {
      const lineX = (position - sourceX) * cellPx;
      if (lineX > 0 && lineX < patternPxW) {
        ctx.moveTo(originX + lineX, originY);
        ctx.lineTo(originX + lineX, originY + patternPxH);
      }
    }
    for (const position of boardSeamPositions(pattern.height, boardSize)) {
      const lineY = (position - sourceY) * cellPx;
      if (lineY > 0 && lineY < patternPxH) {
        ctx.moveTo(originX, originY + lineY);
        ctx.lineTo(originX + patternPxW, originY + lineY);
      }
    }
    ctx.stroke();
  }

  if (!codes || !labelVisible(cellPx)) return;
  const fontPx = Math.max(8, Math.floor(cellPx * 0.42));
  ctx.font = `${fontPx}px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let y = 0; y < heightCells; y++) {
    for (let x = 0; x < widthCells; x++) {
      const cell = pattern.cells[(y + sourceY) * pattern.width + (x + sourceX)];
      if (
        cell.transparent ||
        cell.external ||
        cell.code === null ||
        cell.code === undefined
      )
        continue;
      ctx.fillStyle = contrastColor(cell.hex!);
      ctx.fillText(
        cell.code,
        originX + x * cellPx + cellPx / 2,
        originY + y * cellPx + cellPx / 2,
        Math.max(1, cellPx - 2),
      );
    }
  }
}

function legendEntryText(item: PatternStatsItem): string {
  return `${item.code} × ${item.count}`;
}

export function drawLegend(
  ctx: CanvasRenderingContext2D,
  stats: PatternStatsItem[],
  plan: PngLegendPlan,
  originX: number,
  originY: number,
  fontFamily = LABEL_FONT_FAMILY,
): void {
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#2f2738";
  ctx.font = `600 ${plan.titleFontPx}px ${fontFamily}`;
  ctx.fillText(
    zhCN.export.legendTitle,
    originX + plan.padding,
    originY + plan.titleBaseline,
  );

  ctx.fillStyle = "#675f6f";
  ctx.font = `${plan.bodyFontPx}px ${fontFamily}`;
  ctx.fillText(
    zhCN.export.legendSummary(stats.length, totalBeadCount(stats)),
    originX + plan.padding,
    originY + plan.summaryBaseline,
  );

  ctx.strokeStyle = "#ded8e4";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(originX + plan.padding, originY + plan.dividerY + 0.5);
  ctx.lineTo(
    originX + plan.width - plan.padding,
    originY + plan.dividerY + 0.5,
  );
  ctx.stroke();

  ctx.textBaseline = "middle";
  for (let index = 0; index < stats.length; index++) {
    const column = index % plan.columns;
    const row = Math.floor(index / plan.columns);
    const entryX = originX + plan.padding + column * plan.columnWidth;
    const centerY =
      originY + plan.entriesY + row * plan.rowHeight + plan.rowHeight / 2;
    const item = stats[index];

    ctx.fillStyle = item.hex;
    ctx.fillRect(
      entryX,
      centerY - plan.swatchPx / 2,
      plan.swatchPx,
      plan.swatchPx,
    );
    ctx.strokeStyle = "#91879d";
    ctx.lineWidth = 1;
    ctx.strokeRect(
      entryX + 0.5,
      centerY - plan.swatchPx / 2 + 0.5,
      plan.swatchPx - 1,
      plan.swatchPx - 1,
    );

    ctx.fillStyle = "#2f2738";
    ctx.fillText(
      legendEntryText(item),
      entryX + plan.swatchPx + PNG_LEGEND_SWATCH_TEXT_GAP,
      centerY,
      plan.maxTextWidth,
    );
  }
}

export interface BoardRegion {
  row: number;
  col: number;
  sourceX: number;
  sourceY: number;
  widthCells: number;
  heightCells: number;
}

/** 按底板切出的每一块（行列从 1 起；最后一行 / 列可能不满一块）。 */
export function boardRegions(
  width: number,
  height: number,
  boardSize: number,
): BoardRegion[] {
  const size =
    Number.isInteger(boardSize) && boardSize > 0
      ? boardSize
      : DEFAULT_BOARD_SIZE;
  const regions: BoardRegion[] = [];
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      regions.push({
        row: y / size + 1,
        col: x / size + 1,
        sourceX: x,
        sourceY: y,
        widthCells: Math.min(size, width - x),
        heightCells: Math.min(size, height - y),
      });
    }
  }
  return regions;
}
