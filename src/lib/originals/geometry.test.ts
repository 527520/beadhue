import { describe, it, expect } from "vitest";
import {
  cropMatrix,
  transformOriginal,
  inverseMatrix,
  referenceFrame,
  originalRegion,
  orientOriginalRegion,
  type OriginalMatrix,
} from "./geometry";
const point = (m: OriginalMatrix, x: number, y: number) => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];
describe("original alignment", () => {
  it("maps non-square cropped image corners exactly", () => {
    const m = cropMatrix({ x: 200, y: 50, width: 400, height: 200 }, 1000, 500);
    expect(point(m, 0, 0)).toEqual([0.2, 0.1]);
    expect(point(m, 1, 1)[0]).toBeCloseTo(0.6);
    expect(point(m, 1, 1)[1]).toBeCloseTo(0.5);
  });
  it("rotates and mirrors the original with the same pattern coordinates", () => {
    const m = cropMatrix({ x: 20, y: 10, width: 60, height: 40 }, 100, 80);
    expect(point(transformOriginal(m, "rotateCW"), 0, 0)).toEqual(
      point(m, 0, 1),
    );
    expect(point(transformOriginal(m, "mirrorH"), 0, 0)).toEqual(
      point(m, 1, 0),
    );
    expect(point(transformOriginal(m, "mirrorV"), 0, 0)).toEqual(
      point(m, 0, 1),
    );
    let next = m;
    for (let i = 0; i < 4; i++) next = transformOriginal(next, "rotateCW");
    next.forEach((n, i) => expect(n).toBeCloseTo(m[i]));
  });
  it("inverts source mapping after transforms", () => {
    const m = transformOriginal(
      cropMatrix({ x: 200, y: 50, width: 400, height: 200 }, 1000, 500),
      "rotateCCW",
    );
    const [x, y] = point(m, 0.37, 0.83);
    const p = point(inverseMatrix(m), x, y);
    expect(p[0]).toBeCloseTo(0.37);
    expect(p[1]).toBeCloseTo(0.83);
  });
  it("letterboxes unequal window proportions and never modifies the camera", () => {
    const camera = { cellPx: 24, offsetX: -100, offsetY: 34 };
    const before = { ...camera };
    const frame = referenceFrame(
      camera,
      { width: 800, height: 400 },
      { width: 200, height: 200 },
    );
    expect(frame).toMatchObject({ scale: 0.25, x: 0, y: 50 });
    expect(camera).toEqual(before);
  });
});

it("restores a cropped and rotated generation source without touching the saved pattern", () => {
  const m = transformOriginal(
    cropMatrix({ x: 20, y: 10, width: 60, height: 40 }, 100, 80),
    "rotateCW",
  );
  const region = originalRegion(m, 100, 80);
  expect(region.x).toBeCloseTo(20);
  expect(region.y).toBeCloseTo(10);
  expect(region.width).toBeCloseTo(60);
  expect(region.height).toBeCloseTo(40);
  const image = {
    width: 3,
    height: 2,
    data: new Uint8ClampedArray(
      [1, 2, 3, 4, 5, 6].flatMap((n) => [n, 0, 0, 255]),
    ),
  };
  const restored = orientOriginalRegion(image, m);
  expect([restored.width, restored.height]).toEqual([2, 3]);
  expect([...restored.data].filter((_, i) => i % 4 === 0)).toEqual([
    4, 1, 5, 2, 6, 3,
  ]);
});
