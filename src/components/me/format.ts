/** 「我的」各页共用的数字格式（纯函数，服务端也可调用）。 */

/** 字节 → GB（两位小数、去掉末尾的 0），与头像菜单的原图空间同一口径。 */
export function formatGb(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(2).replace(/\.?0+$/u, '') || '0';
}

/** 字节 → 「142 MB」「860 KB」。 */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${formatGb(bytes)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** 原图空间占用百分比（0–100 的整数）。 */
export function usagePercent(bytes: number, quotaBytes: number): number {
  return quotaBytes > 0 ? Math.min(100, Math.round((bytes / quotaBytes) * 100)) : 0;
}
