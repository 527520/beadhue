import { describe, expect, it } from 'vitest';
import { parseTagIcon } from '@/lib/community/tagIcon';
import { DEFAULT_CATEGORY_ICON, tagIconPattern } from '@/lib/render/tagIconArt';
import { activeChips, activeFilterCount, discoverHref, NO_FILTERS, readDiscoverState } from './discover-state';

describe('发现页地址状态', () => {
  it('缺省值不进地址，参数顺序固定', () => {
    const state = readDiscoverState({ sort: 'rec', cat: 'all', colors: 'few', q: ' 猫 ' });
    expect(discoverHref(state)).toBe('/?q=%E7%8C%AB&colors=few');
    expect(discoverHref(state, { cat: 'featured', sort: 'new' })).toBe('/?q=%E7%8C%AB&cat=featured&sort=new&colors=few');
    expect(discoverHref(state, { q: '', colors: '' })).toBe('/');
  });

  it('兼容 r14 链接：tag → cat，latest / popular / featured → new / likes / rec', () => {
    expect(readDiscoverState(new URLSearchParams('tag=花朵&sort=popular'))).toMatchObject({ cat: '花朵', sort: 'likes' });
    expect(readDiscoverState({ sort: 'featured' }).sort).toBe('rec');
    expect(readDiscoverState({ cat: '猫咪', tag: '花朵' }).cat).toBe('猫咪');
  });

  it('已选芯片：四组筛选 + 旧链接带来的作者与色板；全部清除只去掉筛选', () => {
    const state = readDiscoverState({ size: 's', since: '90', spec: '5mm', author: '小鹿', palette: 'MARD', cat: '猫咪' });
    expect(activeFilterCount(state)).toBe(3);
    expect(activeChips(state).map((chip) => chip.label)).toEqual(['小于 30 格', '5mm 标准豆', '90 天内', '作者：小鹿', '色板：MARD']);
    expect(discoverHref(state, NO_FILTERS)).toBe('/?cat=%E7%8C%AB%E5%92%AA');
  });
});

describe('类目图标', () => {
  it('内置键、像素编码与缺省豆粒', () => {
    const builtin = tagIconPattern(parseTagIcon('cat'));
    expect([builtin.width, builtin.height]).toEqual([13, 13]);
    expect(builtin.cells.some((cell) => cell.hex)).toBe(true);
    const pixels = tagIconPattern(parseTagIcon(`px:8x8:E0473F.FFD447:${'1.'.repeat(4)}${'.2'.repeat(28)}`));
    expect(pixels.cells[0].hex).toBe('#E0473F');
    expect(pixels.cells[1].transparent).toBe(true);
    expect(tagIconPattern(parseTagIcon('不存在'))).toBe(DEFAULT_CATEGORY_ICON);
  });
});
