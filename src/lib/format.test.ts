import { describe, expect, it } from 'vitest';
import { formatCount, longDate, relativeTime } from './format';

describe('全站数字与时间格式', () => {
  it('计数缩写：整数不带「.0」，各页同一口径', () => {
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1000)).toBe('1k');
    expect(formatCount(5230)).toBe('5.2k');
    expect(formatCount(10_000)).toBe('1万');
    expect(formatCount(12_345)).toBe('1.2万');
  });

  it('相对时间：30 天内写多久以前，更早写上海时间的长日期', () => {
    const now = Date.parse('2026-09-24T12:00:00Z');
    expect(relativeTime('2026-09-24T11:59:40Z', now)).toBe('刚刚');
    expect(relativeTime('2026-09-24T11:15:00Z', now)).toBe('45 分钟前');
    expect(relativeTime('2026-09-24T02:00:00Z', now)).toBe('10 小时前');
    expect(relativeTime('2026-08-25T12:00:00Z', now)).toBe('30 天前');
    expect(relativeTime('2026-08-24T12:00:00Z', now)).toBe('2026年8月24日');
    expect(relativeTime('2026-09-30T00:00:00Z', now)).toBe('刚刚');
    expect(relativeTime('坏值', now)).toBe('');
  });

  it('长日期按上海时区：UTC 前一天 16 点以后已是次日', () => {
    expect(longDate('2026-09-23T16:30:00Z')).toBe('2026年9月24日');
  });
});
