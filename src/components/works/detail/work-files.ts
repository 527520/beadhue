/** 详情页的下载：分享图与图纸 PNG（按需动态加载，不进首屏包）。 */
import type { Pattern } from '@/lib/types';
import { drawPoster, type PosterInput } from '@/lib/render/poster';
import { exportPngBlob } from '@/lib/export/png';
import { createPngArchiveBlob } from '@/lib/export/pngArchive';

const REVOKE_DELAY_MS = 10_000;

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

export async function savePoster(input: PosterInput, filename: string): Promise<void> {
  const canvas = await drawPoster(input);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('encode failed');
  saveBlob(blob, filename);
}

/** 图纸 PNG：与编辑器导出同一套排版（网格、板缝、色号、图例）；超出画布上限时拆成图纸 + 图例打包。 */
export async function savePatternPng(pattern: Pattern, name: string, options: { cellPx: number; cropToContent: boolean; includeLegend: boolean; boardSize: number }): Promise<'ok' | 'too-large' | 'failed'> {
  const result = await exportPngBlob(pattern, name, options);
  if (!result.ok) return result.code === 'CANVAS_TOO_LARGE' ? 'too-large' : 'failed';
  if (result.kind === 'single') saveBlob(result.artifact.blob, result.artifact.fileName);
  else saveBlob(await createPngArchiveBlob([result.pattern, result.legend]), result.archiveFileName);
  return 'ok';
}
