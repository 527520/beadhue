import Taro from "@tarojs/taro";
import { sha256 } from "@noble/hashes/sha2.js";
import { LIMITS } from "@beadhue/core/limits";
import type { ImageDataLike } from "@/lib/engine/types";
import { wxFiles } from "./files";
import { namespace } from "./designs";
import { privateImage } from "./network";
import {
  originalRegion,
  orientOriginalRegion,
  type OriginalReference,
} from "@/lib/originals/geometry";
export { canvasNode } from "./canvas";

export interface PickedImage {
  path: string;
  width: number;
  height: number;
  orientation: string;
  bytes: ArrayBuffer;
  sha256: string;
}
export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}
export const fullCrop: Crop = { x: 0, y: 0, width: 1, height: 1 };
export async function readImage(path: string): Promise<PickedImage> {
  const info = await Taro.getImageInfo({ src: path });
  // getImageInfo strips the leading slash from bundled assets. Keep the root
  // path so nested pages and Canvas resolve the same image as the filesystem.
  const imagePath = path.startsWith("/") ? path : info.path || path;
  const bytes = wx
    .getFileSystemManager()
    .readFileSync(imagePath) as ArrayBuffer;
  if (bytes.byteLength > LIMITS.maxFileBytes)
    throw new Error("图片不能超过 20 MB");
  if (info.width * info.height > LIMITS.maxPixels)
    throw new Error("图片尺寸过大，请选择不超过 6400 万像素的图片");
  if (!["png", "jpeg", "jpg", "webp"].includes(info.type.toLowerCase()))
    throw new Error("请选择 PNG、JPEG 或可解码的 WebP 图片");
  return {
    path: imagePath,
    width: info.width,
    height: info.height,
    orientation: info.orientation,
    bytes,
    sha256: Array.from(sha256(new Uint8Array(bytes)))
      .map((n) => n.toString(16).padStart(2, "0"))
      .join(""),
  };
}
export async function pickImage() {
  const result = await Taro.chooseMedia({
    count: 1,
    mediaType: ["image"],
    sourceType: ["album"],
    sizeType: ["original"],
  });
  if (result.tempFiles[0].size > LIMITS.maxFileBytes)
    throw new Error("图片不能超过 20 MB");
  return readImage(result.tempFiles[0].tempFilePath);
}
export async function decodeImage(
  picked: PickedImage,
  canvas: WechatMiniprogram.Canvas,
  crop: Crop,
): Promise<ImageDataLike> {
  const rotated = /^(left|right)/.test(picked.orientation);
  const orientedW = rotated ? picked.height : picked.width,
    orientedH = rotated ? picked.width : picked.height;
  const cw = Math.max(1, Math.round(crop.width * orientedW)),
    ch = Math.max(1, Math.round(crop.height * orientedH));
  const scale = Math.min(
    1,
    LIMITS.generationSourceDimension / Math.max(cw, ch),
  );
  canvas.width = Math.max(1, Math.round(cw * scale));
  canvas.height = Math.max(1, Math.round(ch * scale));
  const image = canvas.createImage();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () =>
      reject(new Error("无法解码这张图片，请重新选择 PNG 或 JPEG"));
    image.src = picked.path;
  });
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(-crop.x * orientedW, -crop.y * orientedH);
  // Orientation is explicit; acceptance includes EXIF fixtures on both iOS and Android.
  const transforms: Record<
    string,
    [number, number, number, number, number, number]
  > = {
    up: [1, 0, 0, 1, 0, 0],
    "up-mirrored": [-1, 0, 0, 1, picked.width, 0],
    down: [-1, 0, 0, -1, picked.width, picked.height],
    "down-mirrored": [1, 0, 0, -1, 0, picked.height],
    right: [0, 1, -1, 0, picked.height, 0],
    "right-mirrored": [0, -1, -1, 0, picked.height, picked.width],
    left: [0, -1, 1, 0, 0, picked.width],
    "left-mirrored": [0, 1, 1, 0, 0, 0],
  };
  ctx.transform(...(transforms[picked.orientation] ?? transforms.up));
  ctx.drawImage(
    image as unknown as CanvasImageSource,
    0,
    0,
    picked.width,
    picked.height,
  );
  ctx.restore();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
export function retainOriginal(image: PickedImage, space = namespace()) {
  const files = wxFiles(space);
  const name = `original-${image.sha256}.bin`;
  try {
    files.bytes(name);
  } catch {
    files.write(`${name}.tmp`, image.bytes);
    files.rename(`${name}.tmp`, name);
  }
}

/** Restore the same cropped/oriented input for a design arriving from Web. */
export async function restoreGenerationSource(
  id: string,
  original: OriginalReference,
  canvas: WechatMiniprogram.Canvas,
  space: string,
) {
  const local = `${wx.env.USER_DATA_PATH}/beadhue-${space}/original-${original.sha256}.bin`;
  let path = local;
  try {
    wx.getFileSystemManager().accessSync(local);
  } catch {
    if (!original.assetId)
      throw new Error("此设计的原图未同步，请重新选择原图后调整参数");
    path = await privateImage(`/api/designs/${id}/original`);
  }
  const image = await readImage(path);
  if (image.sha256 !== original.sha256)
    throw new Error("原图校验失败，请重新同步设计");
  const matrix =
    original.geometry ??
    ([1, 0, 0, 1, 0, 0] as import("@/lib/originals/geometry").OriginalMatrix);
  const crop = originalRegion(matrix, 1, 1);
  return orientOriginalRegion(await decodeImage(image, canvas, crop), matrix);
}
