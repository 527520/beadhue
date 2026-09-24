/** 触发浏览器下载一份 PDF。 */
export function triggerDownload(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  try { anchor.click(); } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_500);
  }
}
