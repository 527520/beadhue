import type { TransformOp } from "@/lib/editor/ops";
import type { GridCamera, GridViewportSize } from "@/lib/render/gridViewport";
import type { ImageDataLike } from "@/lib/engine/types";

/** Affine mapping: normalized pattern coordinates to normalized full-image coordinates. */
export type OriginalMatrix = [number, number, number, number, number, number];
export interface OriginalReference {
  sha256: string;
  width?: number;
  height?: number;
  geometry?: OriginalMatrix;
  assetId?: string;
}
export function cropMatrix(
  rect: { x: number; y: number; width: number; height: number },
  width: number,
  height: number,
): OriginalMatrix {
  return [
    rect.width / width,
    0,
    0,
    rect.height / height,
    rect.x / width,
    rect.y / height,
  ];
}
export function transformOriginal(
  m: OriginalMatrix,
  op: TransformOp,
): OriginalMatrix {
  const [a, b, c, d, e, f] = m;
  switch (op) {
    case "mirrorH":
      return [-a, -b, c, d, a + e, b + f];
    case "mirrorV":
      return [a, b, -c, -d, c + e, d + f];
    case "rotateCW":
      return [-c, -d, a, b, c + e, d + f];
    case "rotateCCW":
      return [c, d, -a, -b, a + e, b + f];
  }
}
export function inverseMatrix([
  a,
  b,
  c,
  d,
  e,
  f,
]: OriginalMatrix): OriginalMatrix {
  const det = a * d - b * c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12)
    throw new Error("Invalid original alignment");
  return [
    d / det,
    -b / det,
    -c / det,
    a / det,
    (c * f - d * e) / det,
    (b * e - a * f) / det,
  ];
}
/** Main viewport, including its blank margins, fits in the reference without cropping. */
export function referenceFrame(
  camera: GridCamera,
  viewport: GridViewportSize,
  window: GridViewportSize,
) {
  const scale = Math.min(
    window.width / viewport.width,
    window.height / viewport.height,
  );
  return {
    scale,
    x: (window.width - viewport.width * scale) / 2,
    y: (window.height - viewport.height * scale) / 2,
    camera,
  };
}

/** Axis-aligned region enclosing a crop after quarter-turns and reflections. */
export function originalRegion(
  m: OriginalMatrix,
  width: number,
  height: number,
) {
  const [a, b, c, d, e, f] = m;
  const xs = [e, a + e, c + e, a + c + e],
    ys = [f, b + f, d + f, b + d + f];
  return {
    x: Math.min(...xs) * width,
    y: Math.min(...ys) * height,
    width: (Math.max(...xs) - Math.min(...xs)) * width,
    height: (Math.max(...ys) - Math.min(...ys)) * height,
  };
}

/** Reorient an already bounded decoded region; never regenerate the saved pattern. */
export function orientOriginalRegion(
  image: ImageDataLike,
  m: OriginalMatrix,
): ImageDataLike {
  const swapped = Math.abs(m[0]) < 1e-10;
  const width = swapped ? image.height : image.width,
    height = swapped ? image.width : image.height;
  const region = originalRegion(m, 1, 1);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width,
        v = (y + 0.5) / height;
      const sx = Math.min(
        image.width - 1,
        Math.max(
          0,
          Math.floor(
            ((m[0] * u + m[2] * v + m[4] - region.x) / region.width) *
              image.width,
          ),
        ),
      );
      const sy = Math.min(
        image.height - 1,
        Math.max(
          0,
          Math.floor(
            ((m[1] * u + m[3] * v + m[5] - region.y) / region.height) *
              image.height,
          ),
        ),
      );
      data.set(
        image.data.subarray(
          (sy * image.width + sx) * 4,
          (sy * image.width + sx + 1) * 4,
        ),
        (y * width + x) * 4,
      );
    }
  return { width, height, data };
}
