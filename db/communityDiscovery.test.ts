/**
 * R15-02 发现页查询：新筛选（尺寸 / 颜色数 / 规格 / 品牌 / 发布时间 / 作者 / 类目）、
 * 新排序（rec / new / likes / reuses）、带缓存的总数、登录者的喜欢标记与详情色号清单。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestClient, type TestDatabase } from './testClient';
import { seedAuthor, seedLike, seedWork, solidPattern } from './testCommunity';
import {
  countPublicCommunityWorks,
  getPublicCommunityWork,
  listPublicCommunityWorks,
  parseCommunityListUrl,
  resetCommunityCountCache,
  summarizePatternColors,
} from '@/lib/community/queries';

let db: TestDatabase;
let alice: Awaited<ReturnType<typeof seedAuthor>>;
let bob: Awaited<ReturnType<typeof seedAuthor>>;
const ids: Record<string, string> = {};
const now = new Date('2026-09-20T00:00:00Z');
const days = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

beforeEach(async () => {
  db = await createTestClient();
  resetCommunityCountCache();
  alice = await seedAuthor(db, { email: 'alice@example.test', username: 'Alice' });
  bob = await seedAuthor(db, { email: 'bob@example.test', username: 'Bob' });
  ids.small = (await seedWork(db, { author: alice, title: '小猫', width: 20, height: 25, colorCount: 5, likes: 9, comments: 1, reuses: 0, tags: ['猫咪'], publishedAt: days(2) })).workId;
  ids.medium = (await seedWork(db, { author: alice, title: '中号星星', width: 35, height: 30, colorCount: 8, likes: 3, reuses: 7, tags: ['星星人'], publishedAt: days(10), featured: true })).workId;
  ids.large = (await seedWork(db, { author: bob, title: '大熊猫', width: 50, height: 41, colorCount: 14, likes: 20, reuses: 1, tags: ['动物'], publishedAt: days(40), boardProfile: '2.6mm-52', paletteId: 'pcd:mard-221-alfonse-doudou@178dafbc9e77d3de556550dbd058270200129186' })).workId;
  ids.custom = (await seedWork(db, { author: bob, title: '自定义色板', width: 30, height: 10, colorCount: 7, likes: 0, paletteKind: 'custom', publishedAt: days(1) })).workId;
  ids.official = (await seedWork(db, { author: alice, official: true, title: '官方示范', width: 29, height: 29, colorCount: 10, likes: 1, publishedAt: days(5) })).workId;
  await seedWork(db, { author: alice, title: '待审作品', status: 'pending_review' });
});

const titles = async (query: Parameters<typeof listPublicCommunityWorks>[1]) =>
  (await listPublicCommunityWorks(db, query, { now })).items.map((item) => item.title);

describe('发现页筛选', () => {
  it('解析新参数；非法取值按参数校验拒绝', () => {
    expect(parseCommunityListUrl('https://x.test/?size=m&colors=few&spec=2.6mm&palette=MARD&since=7&author=beadhue-official&cat=featured&sort=likes'))
      .toEqual({ size: 'm', colors: 'few', spec: '2.6mm', palette: 'MARD', since: 7, author: 'beadhue-official', cat: 'featured', sort: 'likes' });
    expect(parseCommunityListUrl('https://x.test/').sort).toBe('rec');
    for (const bad of ['size=xl', 'colors=lots', 'spec=3mm', 'since=0', 'sort=hot']) {
      expect(() => parseCommunityListUrl(`https://x.test/?${bad}`)).toThrow();
    }
    // 未知参数（如 utm_source）照旧忽略
    expect(parseCommunityListUrl('https://x.test/?utm_source=x')).toEqual({ sort: 'rec' });
  });

  it('尺寸按最长边、颜色数按档位、规格按豆径', async () => {
    // 29×29 的最长边 29 格，属于「小于 30 格」
    expect(await titles({ sort: 'new', size: 's' })).toEqual(['小猫', '官方示范']);
    expect(await titles({ sort: 'new', size: 'm' })).toEqual(['自定义色板', '中号星星']);
    expect(await titles({ sort: 'new', size: 'l' })).toEqual(['大熊猫']);
    expect(await titles({ sort: 'new', colors: 'few' })).toEqual(['小猫']);
    expect((await titles({ sort: 'new', colors: 'mid' })).sort()).toEqual(['中号星星', '官方示范', '自定义色板'].sort());
    expect(await titles({ sort: 'new', colors: 'many' })).toEqual(['大熊猫']);
    expect(await titles({ sort: 'new', spec: '2.6mm' })).toEqual(['大熊猫']);
    expect(await titles({ sort: 'new', spec: '2.6mm-50' })).toEqual([]);
    expect(await titles({ sort: 'new', spec: '5mm' })).not.toContain('大熊猫');
  });

  it('品牌展开为全部系列，custom 只匹配自定义色板，发布时间按天数', async () => {
    expect(await titles({ sort: 'new', palette: 'MARD' })).toHaveLength(4);
    expect(await titles({ sort: 'new', palette: 'MARD' })).toContain('大熊猫');
    expect(await titles({ sort: 'new', palette: 'custom' })).toEqual(['自定义色板']);
    expect(await titles({ sort: 'new', palette: 'COCO' })).toEqual([]);
    expect(await titles({ sort: 'new', since: 3 })).toEqual(['自定义色板', '小猫']);
    expect(await titles({ sort: 'new', since: 30 })).not.toContain('大熊猫');
  });

  it('作者按公开 ID 精确匹配（官方用 beadhue-official），类目支持精选与标签', async () => {
    expect((await titles({ sort: 'new', author: alice.publicAuthorId! })).sort()).toEqual(['中号星星', '小猫'].sort());
    expect(await titles({ sort: 'new', author: 'beadhue-official' })).toEqual(['官方示范']);
    expect(await titles({ sort: 'new', author: 'Bob' })).toEqual(['自定义色板', '大熊猫']);
    expect(await titles({ sort: 'new', cat: 'featured' })).toEqual(['中号星星']);
    expect(await titles({ sort: 'new', cat: '猫咪' })).toEqual(['小猫']);
    expect(await titles({ sort: 'new', cat: 'all' })).toHaveLength(5);
    // 搜索同时匹配作者展示名
    expect(await titles({ sort: 'new', q: 'Bob' })).toEqual(['自定义色板', '大熊猫']);
  });
});

describe('发现页排序与分页', () => {
  it('rec 精选优先再按热度；new / likes / reuses 各按其字段降序', async () => {
    expect(await titles({ sort: 'rec' })).toEqual(['中号星星', '大熊猫', '小猫', '官方示范', '自定义色板']);
    expect(await titles({ sort: 'new' })).toEqual(['自定义色板', '小猫', '官方示范', '中号星星', '大熊猫']);
    expect(await titles({ sort: 'likes' })).toEqual(['大熊猫', '小猫', '中号星星', '官方示范', '自定义色板']);
    expect((await titles({ sort: 'reuses' })).slice(0, 2)).toEqual(['中号星星', '大熊猫']);
  });

  it('rec 游标翻页不重不漏，游标不能跨排序复用', async () => {
    for (let index = 0; index < 26; index += 1) {
      await seedWork(db, { author: bob, title: `批量 ${index}`, likes: index % 4, featured: index % 9 === 0, publishedAt: days(index % 3) });
    }
    const first = await listPublicCommunityWorks(db, { sort: 'rec' }, { now });
    expect(first.items).toHaveLength(24);
    const second = await listPublicCommunityWorks(db, { sort: 'rec', cursor: first.nextCursor! }, { now });
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(31);
    await expect(listPublicCommunityWorks(db, { sort: 'likes', cursor: first.nextCursor! }, { now })).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('列表总数与喜欢标记', () => {
  it('总数与筛选一致、不受排序与游标影响，并在 TTL 内复用缓存', async () => {
    expect(await countPublicCommunityWorks(db, { sort: 'rec' }, now)).toBe(5);
    expect(await countPublicCommunityWorks(db, { sort: 'new', colors: 'mid' }, now)).toBe(3);
    await seedWork(db, { author: bob, title: '新增作品', colorCount: 8, publishedAt: days(1) });
    // 同一 TTL 桶内命中缓存（仍是 3）；排序不同也命中同一条缓存。
    expect(await countPublicCommunityWorks(db, { sort: 'likes', colors: 'mid' }, now)).toBe(3);
    resetCommunityCountCache();
    expect(await countPublicCommunityWorks(db, { sort: 'likes', colors: 'mid' }, now)).toBe(4);
    expect(await countPublicCommunityWorks(db, { sort: 'rec', colors: 'mid' }, new Date(now.getTime() + 120_000))).toBe(4);
  });

  it('登录者看到自己喜欢的作品标记，匿名恒为 false；每项带版本化缩略图地址', async () => {
    await seedLike(db, ids.small, bob.id);
    const viewer = await listPublicCommunityWorks(db, { sort: 'new' }, { now, viewerUserId: bob.id });
    expect(viewer.items.find((item) => item.id === ids.small)?.liked).toBe(true);
    expect(viewer.items.filter((item) => item.liked)).toHaveLength(1);
    const guest = await listPublicCommunityWorks(db, { sort: 'new' }, { now });
    expect(guest.items.every((item) => item.liked === false)).toBe(true);
    expect(guest.items[0].thumbnailUrl).toBe(`/api/community/revisions/${guest.items[0].revisionId}/thumbnail?v=2`);
  });
});

describe('详情色号清单', () => {
  it('按颗数降序给出色号、名称、HEX 与颗数；透明与外部格不计', () => {
    const pattern = solidPattern(3, 2, [['#FFFFFF', 'H1'], ['#E0473F', 'F5'], ['#E0473F', 'F5']]);
    pattern.cells[5] = { hex: null, code: null, transparent: true };
    pattern.cells[4] = { hex: '#E0473F', code: 'F5', transparent: false, external: true };
    expect(summarizePatternColors(pattern)).toEqual({
      beadCount: 4,
      colorUsage: [
        { code: 'F5', name: '红', hex: '#E0473F', count: 2 },
        { code: 'H1', name: '白', hex: '#FFFFFF', count: 2 },
      ],
    });
  });

  it('登录详情带 colorUsage；匿名只给颜色数与总颗数', async () => {
    const pattern = solidPattern(4, 3, [['#E0473F', 'F5'], ['#E0473F', 'F5'], ['#3F7FD9', 'C9']]);
    const { workId, revisionId } = await seedWork(db, { author: alice, title: '双色', pattern, colorCount: 2 });
    const member = await getPublicCommunityWork(db, workId);
    expect(member).toMatchObject({
      colorCount: 2, beadCount: 12,
      colorUsage: [{ code: 'F5', name: '红', hex: '#E0473F', count: 8 }, { code: 'C9', hex: '#3F7FD9', count: 4 }],
      largeImageUrl: `/api/community/revisions/${revisionId}/thumbnail?v=2&size=large`,
    });
    const guest = await getPublicCommunityWork(db, workId, { includeSnapshot: false });
    expect(guest).toMatchObject({ colorCount: 2, beadCount: 12, colorUsage: null, snapshot: null });
    expect(JSON.stringify(guest)).not.toContain('C9');
  });
});
