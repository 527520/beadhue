import { describe, expect, it } from 'vitest';
import { describeColorName } from './colorNames';

describe('describeColorName', () => {
  it('按 HEX 推导确定的中文色系名', () => {
    expect(describeColorName('#FFFFFF')).toBe('白');
    expect(describeColorName('#FBF8F1')).toBe('白');
    expect(describeColorName('#000000')).toBe('黑');
    expect(describeColorName('#8E929C')).toBe('灰');
    expect(describeColorName('#D9DADF')).toBe('浅灰');
    expect(describeColorName('#E0473F')).toBe('红');
    expect(describeColorName('#FCD9E1')).toBe('粉');
    expect(describeColorName('#7C4F36')).toBe('棕');
    expect(describeColorName('#FFD447')).toBe('黄');
    expect(describeColorName('#47A35B')).toBe('绿');
    expect(describeColorName('#1F6B45')).toBe('深绿');
    expect(describeColorName('#A9D2F5')).toBe('浅蓝');
    expect(describeColorName('#8B6CC9')).toBe('紫');
    expect(describeColorName('#F28B2C')).toBe('橙');
  });

  it('很暗的低色度颜色归为黑 / 深灰，不因 HSL 饱和度被放大而叫成「深玫红」', () => {
    expect(describeColorName('#3A2A30')).toBe('黑');
    expect(describeColorName('#4A4448')).toBe('深灰');
    expect(describeColorName('#4A3228')).toBe('深棕');
    expect(describeColorName('#1B2A4A')).toBe('深蓝');
  });

  it('非法 HEX 不抛错', () => {
    expect(describeColorName('red')).toBe('未知色');
  });
});
