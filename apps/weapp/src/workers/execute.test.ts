import { describe, it, expect } from "vitest";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { unzipSync, strFromU8, strToU8 } from "fflate";
import { executeTask } from "./execute";
import { generatePattern } from "@beadhue/core/generation";
import { paletteColorsForSelection } from "@beadhue/core/kit";
import {
  DEFAULT_GENERATION_PARAMS,
  type PaletteSelection,
} from "@beadhue/core/types";
const selection: PaletteSelection = {
  palette: { kind: "builtin", brand: "MARD" },
  kitTier: 0,
};
describe("native worker byte contracts", () => {
  it("matches Web generation for identical RGBA including transparency", async () => {
    const data = new Uint8ClampedArray([
      255, 0, 0, 255, 0, 0, 0, 0, 0, 255, 0, 255, 0, 0, 255, 128,
    ]);
    const params = {
      ...DEFAULT_GENERATION_PARAMS,
      targetWidth: 20,
      targetColorCount: 4,
    };
    const expected = generatePattern(
      { data, width: 2, height: 2 },
      params,
      paletteColorsForSelection(selection),
    );
    expect(
      await executeTask({
        kind: "generate",
        width: 2,
        height: 2,
        rgba: bytesToHex(new Uint8Array(data.buffer)),
        params,
        selection,
      }),
    ).toEqual(expected);
  });
  it("rejects truncated pixels before computation", async () => {
    await expect(
      executeTask({
        kind: "generate",
        width: 800,
        height: 800,
        rgba: "00",
        params: DEFAULT_GENERATION_PARAMS,
        selection,
      }),
    ).rejects.toThrow("生成源");
  });
  it("produces a readable stored ZIP with Chinese filenames and exact bytes", async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const output = await executeTask({
      kind: "zip",
      files: {
        "图纸.png": bytesToHex(png),
        "设计.json": bytesToHex(strToU8('{"名称":"小豆"}')),
      },
    });
    expect(typeof output).toBe("string");
    const unpacked = unzipSync(hexToBytes(output as string));
    expect(unpacked["图纸.png"]).toEqual(png);
    expect(strFromU8(unpacked["设计.json"])).toBe('{"名称":"小豆"}');
  });
});
