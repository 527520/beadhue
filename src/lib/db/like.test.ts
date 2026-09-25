import { describe, expect, it } from 'vitest';
import { containsPattern, startsWithPattern } from './like';

describe('ILIKE 模式', () => {
  it('用户输入里的通配符与反斜杠按字面匹配', () => {
    expect(containsPattern('100%')).toBe('%100\\%%');
    expect(containsPattern('a_b')).toBe('%a\\_b%');
    expect(containsPattern('C:\\tmp')).toBe('%C:\\\\tmp%');
    expect(startsWithPattern('4e1c_')).toBe('4e1c\\_%');
  });

  it('普通文本原样包进 %…%', () => {
    expect(containsPattern('草莓')).toBe('%草莓%');
    expect(startsWithPattern('bb3bff67')).toBe('bb3bff67%');
  });
});
