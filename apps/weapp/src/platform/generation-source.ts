import {
  inverseMatrix,
  orientOriginalRegion,
  type OriginalMatrix,
} from "@/lib/originals/geometry";
import {
  createLocalGenerationSource,
  type LocalGenerationSourceV1,
} from "@beadhue/core/storage";
/** A transform of the grid also transforms the stored generation input, including undo/redo. */
export function reorientSource(
  source: LocalGenerationSourceV1,
  before: OriginalMatrix,
  after: OriginalMatrix,
) {
  const [a, b, c, d, e, f] = inverseMatrix(before),
    [g, h, i, j, k, l] = after;
  const relative: OriginalMatrix = [
    a * g + c * h,
    b * g + d * h,
    a * i + c * j,
    b * i + d * j,
    a * k + c * l + e,
    b * k + d * l + f,
  ];
  return createLocalGenerationSource(
    orientOriginalRegion(
      {
        width: source.width,
        height: source.height,
        data: new Uint8ClampedArray(source.rgba),
      },
      relative,
    ),
  );
}
