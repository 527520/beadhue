import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import Taro from "@tarojs/taro";
import {
  createPngExportPlan,
  createStandaloneLegendPlan,
  PNG_BACKGROUND,
} from "@beadhue/core/png-plan";
import {
  drawPattern,
  drawLegend,
  boardRegions,
} from "@beadhue/core/png-drawing";
import { computeStats } from "@beadhue/core/generation";
import { getBoardProfile } from "@beadhue/core/boards";
import { serializeProject, projectFileName } from "@beadhue/core/serialize";
import type { ProjectFile } from "@beadhue/core/types";
import { runTask } from "./worker";
import { loadFonts } from "./fonts";

export interface ExportFile {
  path: string;
  name: string;
  type: "png" | "pdf" | "zip" | "json";
}
function safeName(name: string) {
  return (
    name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").slice(0, 90) || "未命名设计"
  );
}
function saveBytes(name: string, bytes: Uint8Array | string): string {
  const path = `${wx.env.USER_DATA_PATH}/${safeName(name)}`;
  wx.getFileSystemManager().writeFileSync(
    path,
    typeof bytes === "string" ? bytes : bytes.slice().buffer,
    typeof bytes === "string" ? "utf8" : undefined,
  );
  return path;
}
export async function exportProject(project: ProjectFile): Promise<ExportFile> {
  const name = projectFileName(project.name);
  return {
    path: saveBytes(name, serializeProject(project)),
    name,
    type: "json",
  };
}
function checkActive(active: () => boolean) {
  if (!active()) {
    const error = new Error("导出已取消");
    error.name = "AbortError";
    throw error;
  }
}
export async function exportPdf(
  project: ProjectFile,
  active = () => true,
): Promise<ExportFile> {
  if (!ASSET_BASE_URL.startsWith("https://"))
    throw new Error("中文 PDF 字体资源尚未配置");
  const font = await Taro.request<ArrayBuffer>({
    url: `${ASSET_BASE_URL}/fonts/NotoSansCJKsc-Regular.subset.otf`,
    responseType: "arraybuffer",
    dataType: "其他",
  });
  if (font.statusCode !== 200)
    throw new Error("中文字体下载失败，请联网后重试");
  checkActive(active);
  const bytes = await runTask<string>({
    kind: "pdf",
    project,
    font: bytesToHex(new Uint8Array(font.data)),
  });
  checkActive(active);
  const name = `豆色绘-${safeName(project.name)}.pdf`;
  return { name, path: saveBytes(name, hexToBytes(bytes)), type: "pdf" };
}
export async function archive(
  files: ExportFile[],
  name: string,
): Promise<ExportFile> {
  const entries: Record<string, string> = {};
  for (const file of files)
    entries[file.name] = bytesToHex(
      new Uint8Array(
        wx.getFileSystemManager().readFileSync(file.path) as ArrayBuffer,
      ),
    );
  const bytes = await runTask<string>({ kind: "zip", files: entries });
  return { name, path: saveBytes(name, hexToBytes(bytes)), type: "zip" };
}
export async function exportPng(
  project: ProjectFile,
  canvas: WechatMiniprogram.Canvas,
  byBoard: boolean,
  active = () => true,
): Promise<ExportFile[]> {
  // Never silently export CJK with missing glyphs.
  await loadFonts();
  checkActive(active);
  const pattern = project.pattern,
    board = getBoardProfile(project.boardProfile).boardCols;
  const cell = 24;
  const base = `豆色绘-${safeName(project.name)}`;
  const plan = createPngExportPlan(pattern, {
    cellPx: cell,
    includeLegend: true,
    cropToContent: !byBoard,
  });
  if (plan.kind === "empty") throw new Error("空白图纸没有可导出的豆粒");
  const out: ExportFile[] = [];
  async function render(
    name: string,
    width: number,
    height: number,
    paint: (ctx: CanvasRenderingContext2D) => void,
  ) {
    checkActive(active);
    if (width > 4096 || height > 4096)
      throw new Error("当前图像超过画布能力，请选择按底板分页");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
    ctx.fillStyle = PNG_BACKGROUND;
    ctx.fillRect(0, 0, width, height);
    paint(ctx);
    const result =
      await new Promise<WechatMiniprogram.CanvasToTempFilePathSuccessCallbackResult>(
        (resolve, reject) =>
          wx.canvasToTempFilePath({
            canvas,
            x: 0,
            y: 0,
            width,
            height,
            destWidth: width,
            destHeight: height,
            fileType: "png",
            success: resolve,
            fail: reject,
          }),
      );
    checkActive(active);
    out.push({ name, path: result.tempFilePath, type: "png" });
  }
  if (byBoard || plan.kind === "too-large") {
    for (const region of boardRegions(pattern.width, pattern.height, board)) {
      const width = region.widthCells * cell,
        height = region.heightCells * cell;
      await render(
        `${base}-板${region.row}-${region.col}.png`,
        width,
        height,
        (ctx) =>
          drawPattern(
            ctx,
            pattern,
            { ...region, width, height },
            cell,
            0,
            0,
            board,
            true,
            '"BeadHue Text"',
          ),
      );
    }
    const stats = computeStats(pattern.cells);
    const legend = createStandaloneLegendPlan(stats, cell);
    if (!legend) throw new Error("图例超过画布能力，请使用 PDF");
    await render(`${base}-图例.png`, legend.width, legend.height, (ctx) =>
      drawLegend(ctx, stats, legend, 0, 0, '"BeadHue Text"'),
    );
  } else if (plan.kind === "single") {
    await render(
      `${base}.png`,
      plan.canvas.width,
      plan.canvas.height,
      (ctx) => {
        drawPattern(
          ctx,
          pattern,
          plan.pattern,
          cell,
          plan.canvas.patternX,
          plan.canvas.patternY,
          board,
          true,
          '"BeadHue Text"',
        );
        if (plan.legend)
          drawLegend(
            ctx,
            plan.stats,
            plan.legend,
            plan.canvas.legendX,
            plan.canvas.legendY,
            '"BeadHue Text"',
          );
      },
    );
  } else {
    await render(
      `${base}-图纸.png`,
      plan.patternCanvas.width,
      plan.patternCanvas.height,
      (ctx) =>
        drawPattern(
          ctx,
          pattern,
          plan.pattern,
          cell,
          0,
          0,
          board,
          true,
          '"BeadHue Text"',
        ),
    );
    await render(
      `${base}-图例.png`,
      plan.legendCanvas.width,
      plan.legendCanvas.height,
      (ctx) => drawLegend(ctx, plan.stats, plan.legend, 0, 0, '"BeadHue Text"'),
    );
  }
  canvas.width = 1;
  canvas.height = 1;
  return out;
}
