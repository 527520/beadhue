import { createHash } from 'node:crypto';

export const TAG_NAME_MAX_LENGTH = 30;
export const WORK_TAG_LIMIT = 10;

/**
 * 标签名规范化：全角转半角、去首尾空白、连续空白折叠为一个空格。
 * 唯一性由数据库 lower(name) 唯一索引保证，这里只负责把「 星星人」「星星人 」归为同一个。
 */
export function normalizeTagName(raw: string): string {
  return raw.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

export function isValidTagName(name: string): boolean {
  return name.length >= 1 && name.length <= TAG_NAME_MAX_LENGTH && !/[\u0000-\u001f\u007f<>]/u.test(name);
}

export const SUGGESTED_TAG_LIMIT = 5;
export const SUGGESTED_TAG_MAX_LENGTH = 8;

/**
 * 作者建议标签（D68）：复用标签名规范化，每个 1–8 个字，最多 5 个，大小写不敏感去重（保留首次写法）。
 * 非法返回 null，由调用方报 VALIDATION。
 */
export function normalizeSuggestedTags(raw: readonly string[] | undefined): string[] | null {
  if (!raw) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    const name = normalizeTagName(value);
    if (!isValidTagName(name) || Array.from(name).length > SUGGESTED_TAG_MAX_LENGTH) return null;
    const key = name.toLocaleLowerCase('zh-CN');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result.length <= SUGGESTED_TAG_LIMIT ? result : null;
}

/**
 * 链接标识只是 community_tags.slug 的非空约束需要；用户不再输入或看到它。
 * 纯 ASCII 名称直接转小写连字符形式，中文等其他名称用规范化名的哈希前缀。
 */
export function deriveTagSlug(name: string): string {
  const ascii = name.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '');
  if (ascii && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(ascii) && ascii.length <= 50) return ascii;
  return `t-${createHash('sha256').update(name.toLocaleLowerCase('zh-CN'), 'utf8').digest('hex').slice(0, 12)}`;
}
