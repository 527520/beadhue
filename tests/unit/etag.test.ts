/** ETag / If-None-Match 条件请求（原图 304）的最小实现。 */
import { describe, expect, it } from 'vitest';
import { entityTag, matchesIfNoneMatch } from '@/lib/security/etag';

const digest = 'a'.repeat(64);
const tag = `"${digest}"`;

describe('条件请求', () => {
  it('生成强 ETag', () => {
    expect(entityTag(digest)).toBe(tag);
  });

  it('If-None-Match：精确匹配、多值、弱前缀与 * 都算命中', () => {
    expect(matchesIfNoneMatch(tag, tag)).toBe(true);
    expect(matchesIfNoneMatch(`"other", ${tag}`, tag)).toBe(true);
    expect(matchesIfNoneMatch(`W/${tag}`, tag)).toBe(true);
    expect(matchesIfNoneMatch('*', tag)).toBe(true);
  });

  it('缺头、空值或不匹配都不算命中', () => {
    expect(matchesIfNoneMatch(null, tag)).toBe(false);
    expect(matchesIfNoneMatch('', tag)).toBe(false);
    expect(matchesIfNoneMatch('"deadbeef"', tag)).toBe(false);
    expect(matchesIfNoneMatch(digest, tag)).toBe(false); // 缺少引号不是合法实体标签
  });
});
