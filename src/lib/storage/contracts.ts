import { LIMITS } from "@/lib/appInfo";
import { parseProjectFileValue } from "@/lib/schemas";
import type { ImageDataLike } from "@/lib/engine/types";
import type { StitchProgress } from "@/lib/progress/stitchProgress";
import type { ProjectFile } from "@/lib/types";

export interface DesignRecord {
  id: string;
  name: string;
  /** 项目文件 JSON（ProjectFile 序列化） */
  projectJson: string;
  /** ≤256px 缩略图 data URL；生成失败时为 null */
  thumbnail: string | null;
  updatedAt: string;
  /** Last cloud revision observed. Zero means the row has never been created remotely. */
  revision?: number;
  /** Explicit dirty state avoids relying on clocks to detect unsynced local edits. */
  syncState?: "dirty" | "synced" | "conflict";
}

export interface LocalGenerationSourceV1 {
  version: 1;
  width: number;
  height: number;
  /** 紧密 RGBA 字节；始终为独立持有的普通 ArrayBuffer。 */
  rgba: ArrayBuffer;
}

function isArrayBuffer(value: unknown): value is ArrayBuffer {
  try {
    ArrayBuffer.prototype.slice.call(value, 0, 0);
    return true;
  } catch {
    return false;
  }
}

export function isValidLocalGenerationSource(
  value: unknown,
): value is LocalGenerationSourceV1 {
  if (!value || typeof value !== "object") return false;
  const source = value as Partial<LocalGenerationSourceV1>;
  const { width, height, rgba } = source;
  return (
    source.version === 1 &&
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    (width ?? 0) >= 1 &&
    (height ?? 0) >= 1 &&
    (width ?? 0) <= LIMITS.generationSourceDimension &&
    (height ?? 0) <= LIMITS.generationSourceDimension &&
    isArrayBuffer(rgba) &&
    rgba.byteLength === (width ?? 0) * (height ?? 0) * 4
  );
}

export function createLocalGenerationSource(
  image: ImageDataLike,
): LocalGenerationSourceV1 {
  const rgba = new Uint8Array(
    image.data.buffer,
    image.data.byteOffset,
    image.data.byteLength,
  ).slice().buffer;
  const source: LocalGenerationSourceV1 = {
    version: 1,
    width: image.width,
    height: image.height,
    rgba,
  };
  if (!isValidLocalGenerationSource(source)) {
    throw new TypeError(
      `本地生成源必须是 1..${LIMITS.generationSourceDimension} 的紧密 RGBA 数据`,
    );
  }
  return source;
}

export function imageDataFromLocalGenerationSource(
  source: LocalGenerationSourceV1,
): ImageDataLike {
  if (!isValidLocalGenerationSource(source))
    throw new TypeError("本地生成源格式无效");
  return {
    data: new Uint8ClampedArray(source.rgba.slice(0)),
    width: source.width,
    height: source.height,
  };
}

export type GenerationSourceWrite =
  | { mode: "preserve" }
  | { mode: "replace"; source: LocalGenerationSourceV1 }
  | { mode: "clear" };

export const PRESERVE_GENERATION_SOURCE = Object.freeze({
  mode: "preserve",
} as const);
export const CLEAR_GENERATION_SOURCE = Object.freeze({
  mode: "clear",
} as const);

export function replaceGenerationSource(
  source: LocalGenerationSourceV1,
): GenerationSourceWrite {
  if (!isValidLocalGenerationSource(source))
    throw new TypeError("本地生成源格式无效");
  return { mode: "replace", source };
}

export interface StorageAdapter {
  /** 全部设计记录，按 updatedAt 降序。 */
  getAll(): Promise<DesignRecord[]>;
  getGenerationSource(id: string): Promise<LocalGenerationSourceV1 | null>;
  put(record: DesignRecord, sourceWrite?: GenerationSourceWrite): Promise<void>;
  delete(id: string): Promise<void>;
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
  /** 跟拼进度（G-1）：按设计 id 独立存放，删除设计时一并清除。 */
  getStitchProgress(designId: string): Promise<StitchProgress | null>;
  putStitchProgress(designId: string, progress: StitchProgress): Promise<void>;
  deleteStitchProgress(designId: string): Promise<void>;
}

export type StorageErrorCode = "UNAVAILABLE" | "QUOTA" | "UNKNOWN";

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  constructor(code: StorageErrorCode, message: string) {
    super(message);
    this.name = "StorageError";
    this.code = code;
  }
}

export function parseStoredProject(json: string): ProjectFile | null {
  try {
    const result = parseProjectFileValue(JSON.parse(json));
    return result.ok ? result.value : null;
  } catch {
    return null;
  }
}
