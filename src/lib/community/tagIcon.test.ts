import { describe, expect, it } from 'vitest';
import { parseTagIcon, tagIconSchema } from './tagIcon';

const row = (text: string) => text.padEnd(8, '.');
const pixels = `px:8x8:E0473F.FFD447:${[row('..11'), row('.1221'), row('12221'), row('.1221'), row('..1'), row(''), row(''), row('')].join('')}`;

describe('tagIcon', () => {
  it('解析内置图标键与像素编码', () => {
    expect(parseTagIcon('star')).toEqual({ kind: 'builtin', key: 'star' });
    const icon = parseTagIcon(pixels);
    expect(icon).toMatchObject({ kind: 'pixels', width: 8, height: 8, palette: ['#E0473F', '#FFD447'] });
    expect(icon?.kind === 'pixels' && icon.cells.slice(0, 4)).toEqual([null, null, 0, 0]);
  });

  it('拒绝未知键、越界尺寸、格数不符与超出色板的颜色序号', () => {
    for (const bad of ['dragon', 'px:4x4:E0473F:1111111111111111', `px:8x8:E0473F:${'1'.repeat(63)}`, `px:8x8:E0473F:${'2'.repeat(64)}`]) {
      expect(parseTagIcon(bad)).toBeNull();
      expect(tagIconSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('写入校验：空串与 null 清除，小写 HEX 规范为大写', () => {
    expect(tagIconSchema.parse(null)).toBeNull();
    expect(tagIconSchema.parse('')).toBeNull();
    expect(tagIconSchema.parse(pixels.replace('E0473F', 'e0473f'))).toBe(pixels);
  });
});
