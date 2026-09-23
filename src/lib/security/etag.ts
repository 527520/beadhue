/**
 * HTTP 条件请求（RFC 9110 §13 / §8.8.3）里最小够用的一部分。
 * 只处理 ETag 的强比较与 If-None-Match，用于原图 GET：内容按 cosKey（含 sha256）不可变，
 * 客户端带上 If-None-Match 时直接回 304，不必再取对象字节。
 */

/** 生成强 ETag（sha256 十六进制摘要）。 */
export function entityTag(sha256: string): string {
  return `"${sha256}"`;
}

/**
 * If-None-Match 是否命中给定 ETag：
 * - `*` 命中任何已存在的表示；
 * - 逗号分隔的多个候选值任一命中即算命中；
 * - 弱前缀 `W/` 在 If-None-Match 中按弱比较处理（本应用的 ETag 恒为强 ETag）。
 */
export function matchesIfNoneMatch(headerValue: string | null, etag: string): boolean {
  if (!headerValue) return false;
  const candidates = headerValue.split(',');
  for (const raw of candidates) {
    const value = raw.trim();
    if (value === '') continue;
    if (value === '*') return true;
    const normalized = value.startsWith('W/') ? value.slice(2).trim() : value;
    if (normalized === etag) return true;
  }
  return false;
}
