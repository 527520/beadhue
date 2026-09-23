import { describe, expect, it } from 'vitest';
import { deriveTagSlug, isValidTagName, normalizeSuggestedTags, normalizeTagName } from './tagNames';

describe('tag names', () => {
  it('normalizes width, whitespace and trims', () => {
    expect(normalizeTagName('　星星人 ')).toBe('星星人');
    expect(normalizeTagName('海绵   宝宝')).toBe('海绵 宝宝');
    expect(normalizeTagName('ＡＢＣ')).toBe('ABC');
  });

  it('rejects empty, oversized or control-character names', () => {
    expect(isValidTagName('')).toBe(false);
    expect(isValidTagName('a'.repeat(31))).toBe(false);
    expect(isValidTagName('bad\u0000name')).toBe(false);
    expect(isValidTagName('<script>')).toBe(false);
    expect(isValidTagName('星星人')).toBe(true);
  });

  it('derives an ascii slug when possible and a stable hash otherwise', () => {
    expect(deriveTagSlug('Sponge Bob')).toBe('sponge-bob');
    expect(deriveTagSlug('星星人')).toMatch(/^t-[0-9a-f]{12}$/u);
    expect(deriveTagSlug('星星人')).toBe(deriveTagSlug('星星人'));
    expect(deriveTagSlug('星星人')).not.toBe(deriveTagSlug('海绵宝宝'));
  });

  it('normalizes suggested tags: ≤5 items, ≤8 characters, case-insensitive dedupe', () => {
    expect(normalizeSuggestedTags(undefined)).toEqual([]);
    expect(normalizeSuggestedTags([' 猫咪 ', 'Cat', 'cat', '　星星人'])).toEqual(['猫咪', 'Cat', '星星人']);
    expect(normalizeSuggestedTags(['一二三四五六七八'])).toEqual(['一二三四五六七八']);
    expect(normalizeSuggestedTags(['一二三四五六七八九'])).toBeNull();
    expect(normalizeSuggestedTags(['a', 'b', 'c', 'd', 'e', 'f'])).toBeNull();
    expect(normalizeSuggestedTags(['<b>'])).toBeNull();
    expect(normalizeSuggestedTags([' '])).toBeNull();
  });
});
