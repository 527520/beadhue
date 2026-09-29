import { it, expect } from "vitest";
import { reorientSource } from "./generation-source";
import {
  transformOriginal,
  type OriginalMatrix,
} from "@/lib/originals/geometry";
it("reorients cropped pixels and round trips through undo", () => {
  const source = {
    version: 1 as const,
    width: 2,
    height: 1,
    rgba: new Uint8Array([10, 0, 0, 255, 20, 0, 0, 255]).buffer,
  };
  const before: OriginalMatrix = [0.5, 0, 0, 0.5, 0.2, 0.3];
  const after = transformOriginal(before, "rotateCW");
  const rotated = reorientSource(source, before, after);
  expect([rotated.width, rotated.height]).toEqual([1, 2]);
  expect([...new Uint8Array(rotated.rgba)]).toEqual([
    10, 0, 0, 255, 20, 0, 0, 255,
  ]);
  expect(reorientSource(rotated, after, before)).toEqual(source);
});
