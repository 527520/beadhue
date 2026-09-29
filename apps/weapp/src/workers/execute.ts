import "../platform/polyfills";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { generatePattern, computeStats } from "@beadhue/core/generation";
import { paletteColorsForSelection } from "@beadhue/core/kit";
import { generatePatternPdf } from "@beadhue/core/pdf";
import { getBoardProfile } from "@beadhue/core/boards";
import { zipSync } from "fflate";
import type { WorkerTask } from "./tasks";

/** JSON-safe byte transport avoids relying on native transferable/typed-array support. */
export async function executeTask(task: WorkerTask) {
  if (task.kind === "generate") {
    const bytes = hexToBytes(task.rgba);
    if (
      !Number.isInteger(task.width) ||
      !Number.isInteger(task.height) ||
      task.width < 1 ||
      task.height < 1 ||
      task.width > 800 ||
      task.height > 800 ||
      bytes.length !== task.width * task.height * 4
    )
      throw new Error("生成源格式无效");
    return generatePattern(
      {
        width: task.width,
        height: task.height,
        data: new Uint8ClampedArray(bytes),
      },
      task.params,
      paletteColorsForSelection(task.selection),
    );
  }
  if (task.kind === "pdf") {
    const { pattern, name, boardProfile } = task.project;
    return bytesToHex(
      await generatePatternPdf(
        { pattern, name, stats: computeStats(pattern.cells) },
        {
          fontBytes: hexToBytes(task.font),
          boardSize: getBoardProfile(boardProfile).boardCols,
        },
      ),
    );
  }
  return bytesToHex(
    zipSync(
      Object.fromEntries(
        Object.entries(task.files).map(([name, bytes]) => [
          name,
          hexToBytes(bytes),
        ]),
      ),
      { level: 0 },
    ),
  );
}
