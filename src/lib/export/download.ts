/** 触发浏览器下载一份 PDF。 */
export function triggerDownload(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.tabIndex = -1;
  anchor.setAttribute('aria-hidden', 'true');
  document.body.appendChild(anchor);
  try { anchor.click(); } finally {
    // Firefox can begin a large Blob download after the click handler returns.
    // Keep both the link and Blob URL alive until the browser has consumed it.
    window.setTimeout(() => { anchor.remove(); URL.revokeObjectURL(url); }, 30_000);
  }
}
