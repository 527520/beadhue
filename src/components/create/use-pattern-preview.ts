'use client';

/**
 * 新建图纸弹窗的结果预览：在独立的生成 Worker 里（不占用工作台那一个）用解码预览缓冲跑同一条引擎管线。
 * 预览只看取景框里最长边 ≤ 400 的缩样，结果文案因此写「约」；真正的图纸由工作台管线按有界原图生成。
 */
import { useEffect, useState } from 'react';
import { cropImageData, type Rect } from '@/lib/crop/layout';
import { createGenerateWorkerClient, type GenerateWorkerClient } from '@/lib/engine/runGenerate';
import type { DecodedImage } from '@/lib/image/decode';
import type { GenerationParams, PaletteColor, Pattern } from '@/lib/types';

const PREVIEW_SOURCE_MAX = 400;
const DEBOUNCE_MS = 120;

export interface PatternPreview {
  pattern: Pattern;
  beads: number;
  colors: number;
}

let sharedClient: GenerateWorkerClient | null = null;
function previewClient(): GenerateWorkerClient {
  sharedClient ??= createGenerateWorkerClient();
  return sharedClient;
}

export function usePatternPreview(
  image: DecodedImage,
  crop: Rect,
  params: GenerationParams,
  palette: readonly PaletteColor[],
): PatternPreview | null {
  const [preview, setPreview] = useState<PatternPreview | null>(null);
  const { x, y, width, height } = crop;
  useEffect(() => {
    let cancel: (() => void) | null = null;
    let stopped = false;
    const timer = setTimeout(() => {
      const natW = image.naturalWidth ?? image.width;
      const natH = image.naturalHeight ?? image.height;
      const sx = image.width / natW;
      const sy = image.height / natH;
      const src = cropImageData(
        image,
        { x: x * sx, y: y * sy, width: Math.max(1, width * sx), height: Math.max(1, height * sy) },
        PREVIEW_SOURCE_MAX,
      );
      const task = previewClient().run({ src, params, palette: [...palette] });
      cancel = task.cancel;
      task.promise
        .then((output) => {
          if (!stopped) setPreview({ pattern: output.pattern, beads: output.totalBeadCount, colors: output.stats.length });
        })
        .catch(() => undefined);
    }, DEBOUNCE_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
      cancel?.();
    };
  }, [image, x, y, width, height, params, palette]);
  return preview;
}

/** 弹窗关闭后释放预览 Worker。 */
export function disposePreviewWorker(): void {
  sharedClient?.dispose();
  sharedClient = null;
}
