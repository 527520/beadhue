/**
 * R15-02 新接口的路由测试：我喜欢的、相似作品、作者主页、搜索建议、我的统计、后台趋势。
 * 覆盖权限、参数校验、分页、限流 429 与缓存头。
 */
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestClient, type TestDatabase } from '@/../db/testClient';
import { seedAuthor, seedLike, seedWork } from '@/../db/testCommunity';
import { communityRevisions, communityWorks, designs, users } from '@/../db/schema';
import { setTestDb } from '@/lib/auth/db';
import { createSession } from '@/lib/auth/session';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookies';
import { resetAccountWorkWindow } from '@/lib/security/accountReadQuota';

vi.mock('@/lib/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/config')>();
  return {
    ...actual,
    config: { ...actual.config, security: { ...actual.config.security, publicReadRateLimit: 3, searchSuggestRateLimit: 3, meReadRateLimit: 3, accountReadRateLimit: 3, newAccountReadRateLimit: 3 } },
  };
});

let token: string | undefined;
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === SESSION_COOKIE_NAME && token ? { value: token } : undefined), set: () => undefined }),
}));

import { GET as liked } from './works/liked/route';
import { GET as related } from './works/[id]/related/route';
import { GET as author } from './authors/[publicAuthorId]/route';
import { GET as suggest } from './search/suggest/route';
import { GET as stats } from '../me/stats/route';
import { GET as trends } from '../admin/overview/trends/route';

let db: TestDatabase;
let alice: Awaited<ReturnType<typeof seedAuthor>>;
let bob: Awaited<ReturnType<typeof seedAuthor>>;
const w: Record<string, string> = {};
const ip = (value: string) => ({ headers: { 'x-real-ip': value } });
const login = async (userId: string) => { token = (await createSession(db, userId)).token; };

beforeEach(async () => {
  db = await createTestClient();
  setTestDb(db);
  resetAccountWorkWindow();
  token = undefined;
  alice = await seedAuthor(db, { email: 'alice-d@example.test', username: '小鹿拼豆' });
  bob = await seedAuthor(db, { email: 'bob-d@example.test', username: '橙子手作' });
  w.cat = (await seedWork(db, { author: alice, title: '橘猫团子', tags: ['猫咪', '动物'], likes: 5, reuses: 2, paletteId: 'COCO' })).workId;
  w.cat2 = (await seedWork(db, { author: bob, title: '黑猫', tags: ['猫咪', '动物'], likes: 1, paletteId: 'COCO' })).workId;
  w.panda = (await seedWork(db, { author: bob, title: '熊猫', tags: ['动物'], likes: 9, paletteId: 'COCO' })).workId;
  w.aliceOther = (await seedWork(db, { author: alice, title: '草莓', tags: ['水果'], likes: 3, reuses: 4, paletteId: '咪小窝' })).workId;
  w.unrelated = (await seedWork(db, { author: bob, title: '西瓜', tags: ['水果'], paletteId: '漫漫' })).workId;
  w.official = (await seedWork(db, { author: alice, official: true, title: '官方猫咪示范', likes: 2, paletteId: '盼盼' })).workId;
});

describe('GET /api/community/works/liked', () => {
  it('需要登录；只列仍公开的已喜欢作品，按喜欢时间倒序并可翻页', async () => {
    expect((await liked(new Request('http://localhost/api/community/works/liked'))).status).toBe(401);
    await seedLike(db, w.cat, bob.id, new Date('2026-09-10T00:00:00Z'));
    await seedLike(db, w.panda, bob.id, new Date('2026-09-11T00:00:00Z'));
    await seedLike(db, w.aliceOther, bob.id, new Date('2026-09-12T00:00:00Z'));
    await db.update(communityWorks).set({ lifecycleStatus: 'removed' }).where(eq(communityWorks.id, w.aliceOther));
    await login(bob.id);
    const response = await liked(new Request('http://localhost/api/community/works/liked'));
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = await response.json();
    expect(body).toMatchObject({ total: 2, nextCursor: null });
    expect(body.items.map((item: { title: string; liked: boolean }) => [item.title, item.liked])).toEqual([['熊猫', true], ['橘猫团子', true]]);
    expect(body.items[0].likedAt).toBe('2026-09-11T00:00:00.000Z');
    const invalid = await liked(new Request('http://localhost/api/community/works/liked?cursor=forged'));
    expect(invalid.status).toBe(400);
  });

  it('超过 26 条时签名游标翻页不重不漏', async () => {
    for (let index = 0; index < 25; index += 1) {
      const { workId } = await seedWork(db, { author: alice, title: `批量 ${index}` });
      await seedLike(db, workId, bob.id, new Date(Date.UTC(2026, 8, 1, 0, index)));
    }
    await db.update(users).set({ createdAt: new Date('2026-01-01T00:00:00Z') }).where(eq(users.id, bob.id));
    await login(bob.id);
    const first = await (await liked(new Request('http://localhost/api/community/works/liked'))).json();
    expect(first.items).toHaveLength(24);
    const second = await (await liked(new Request(`http://localhost/api/community/works/liked?cursor=${encodeURIComponent(first.nextCursor)}`))).json();
    expect(second.items).toHaveLength(1);
    expect(new Set([...first.items, ...second.items].map((item: { id: string }) => item.id)).size).toBe(25);
  });

  it('计入账号读总量：超限 429', async () => {
    await login(bob.id);
    for (let i = 0; i < 3; i += 1) expect((await liked(new Request('http://localhost/api/community/works/liked'))).status).toBe(200);
    const limited = await liked(new Request('http://localhost/api/community/works/liked'));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
  });
});

describe('GET /api/community/works/:id/related', () => {
  const call = (id: string, query = '', init?: RequestInit) => related(new Request(`http://localhost/api/community/works/${id}/related${query}`, init), { params: Promise.resolve({ id }) });

  it('同标签优先，其次同作者、同色板；不含自身与不相关作品', async () => {
    const response = await call(w.cat);
    expect(response.headers.get('cache-control')).toBe('public, s-maxage=300, stale-while-revalidate=600');
    const titles = (await response.json()).items.map((item: { title: string }) => item.title);
    // 黑猫（2 个共同标签）> 熊猫（1 个共同标签）> 草莓（同作者）；西瓜与官方示范既不同标签也不同作者、不同色板。
    expect(titles).toEqual(['黑猫', '熊猫', '草莓']);
    expect((await (await call(w.cat, '?limit=1')).json()).items).toHaveLength(1);
  });

  it('自定义色板的作品：不按色板排序也能查（此前 order by (false) 报错）', async () => {
    const custom = (await seedWork(db, { author: bob, title: '自定义猫', tags: ['猫咪'], paletteKind: 'custom' })).workId;
    const response = await call(custom);
    expect(response.status).toBe(200);
    expect((await response.json()).items.map((item: { title: string }) => item.title)).toEqual(expect.arrayContaining(['橘猫团子', '黑猫']));
  });

  it('参数校验与不存在的作品', async () => {
    expect((await call(w.cat, '?limit=0')).status).toBe(400);
    expect((await call(w.cat, '?limit=99')).status).toBe(400);
    expect((await call('not-a-uuid')).status).toBe(404);
    await db.update(communityWorks).set({ lifecycleStatus: 'withdrawn' }).where(eq(communityWorks.id, w.cat));
    expect((await call(w.cat)).status).toBe(404);
  });

  it('登录后带喜欢标记且不进共享缓存；每 IP 限流 429', async () => {
    await seedLike(db, w.cat2, alice.id);
    await login(alice.id);
    const response = await call(w.cat);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect((await response.json()).items.find((item: { id: string }) => item.id === w.cat2).liked).toBe(true);
    token = undefined;
    for (let i = 0; i < 3; i += 1) expect((await call(w.cat, '', ip('203.0.113.30'))).status).toBe(200);
    expect((await call(w.cat, '', ip('203.0.113.30'))).status).toBe(429);
  });
});

describe('GET /api/community/authors/:publicAuthorId', () => {
  const call = (id: string, init?: RequestInit) => author(new Request(`http://localhost/api/community/authors/${id}`, init), { params: Promise.resolve({ publicAuthorId: id }) });

  it('返回展示名、作者类型与公开作品统计；官方作者恒存在', async () => {
    const response = await call(alice.publicAuthorId!);
    expect(response.headers.get('cache-control')).toBe('public, s-maxage=60, stale-while-revalidate=300');
    expect(await response.json()).toEqual({ publicAuthorId: alice.publicAuthorId, displayName: '小鹿拼豆', authorType: 'user', counts: { works: 2, likes: 8, reuses: 6 } });
    expect(await (await call('beadhue-official')).json()).toMatchObject({ authorType: 'official', displayName: '豆色绘官方', counts: { works: 1, likes: 2 } });
  });

  it('不存在或非法 ID 返回 404；注销账号显示「已注销用户」', async () => {
    expect((await call(crypto.randomUUID())).status).toBe(404);
    expect((await call('not-an-id')).status).toBe(404);
    await db.update(users).set({ accountStatus: 'anonymized', email: null, username: null }).where(eq(users.id, alice.id));
    expect((await (await call(alice.publicAuthorId!)).json()).displayName).toBe('已注销用户');
  });

  it('每 IP 限流 429', async () => {
    for (let i = 0; i < 3; i += 1) expect((await call(alice.publicAuthorId!, ip('203.0.113.31'))).status).toBe(200);
    expect((await call(alice.publicAuthorId!, ip('203.0.113.31'))).status).toBe(429);
  });
});

describe('GET /api/community/search/suggest', () => {
  const call = (q: string | null, init?: RequestInit) => suggest(new Request(`http://localhost/api/community/search/suggest${q === null ? '' : `?q=${encodeURIComponent(q)}`}`, init));

  it('标签、作品、作者各最多 5 条，只含公开内容', async () => {
    await seedWork(db, { author: alice, title: '待审猫', status: 'pending_review' });
    const response = await call('猫');
    expect(response.headers.get('cache-control')).toBe('public, s-maxage=60, stale-while-revalidate=300');
    const body = await response.json();
    expect(body.tags).toEqual([expect.objectContaining({ name: '猫咪', count: 2 })]);
    // 标题含「猫」的公开作品按热度排序（熊猫 9 > 橘猫团子 7 > 官方 2 > 黑猫 1）；待审作品不出现。
    expect(body.works.map((item: { title: string }) => item.title)).toEqual(['熊猫', '橘猫团子', '官方猫咪示范', '黑猫']);
    expect(body.works[0].thumbnailUrl).toMatch(/\/thumbnail\?v=2$/u);
    expect(body.authors).toEqual([]);
    const authors = await (await call('小鹿')).json();
    expect(authors.authors).toEqual([{ publicAuthorId: alice.publicAuthorId, authorType: 'user', displayName: '小鹿拼豆', workCount: 2 }]);
    expect((await (await call('官方')).json()).authors).toEqual([expect.objectContaining({ publicAuthorId: 'beadhue-official', authorType: 'official' })]);
  });

  it('空关键词返回热门标签；超长关键词 400；每 IP 限流 429', async () => {
    const popular = await (await call(null)).json();
    expect(popular).toMatchObject({ q: '', works: [], authors: [] });
    expect(popular.tags[0]).toMatchObject({ name: '动物', count: 3 });
    expect((await call('长'.repeat(41))).status).toBe(400);
    for (let i = 0; i < 3; i += 1) expect((await call('猫', ip('203.0.113.32'))).status).toBe(200);
    expect((await call('猫', ip('203.0.113.32'))).status).toBe(429);
  });
});

describe('GET /api/me/stats', () => {
  it('需要登录；统计设计数、本人公开作品数与获赞总数（不含官方作品与已下架作品）', async () => {
    expect((await stats()).status).toBe(401);
    await db.insert(designs).values([
      { id: crypto.randomUUID(), userId: alice.id, name: 'a', project: {}, payloadBytes: 2 },
      { id: crypto.randomUUID(), userId: alice.id, name: '', payloadBytes: 0, deletedAt: new Date() },
    ]);
    const removed = await seedWork(db, { author: alice, title: '已下架', likes: 50 });
    await db.update(communityWorks).set({ lifecycleStatus: 'removed' }).where(eq(communityWorks.id, removed.workId));
    await login(alice.id);
    const response = await stats();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ designs: 1, publicWorks: 2, likes: 8 });
  });

  it('按账号限流 429', async () => {
    await login(alice.id);
    for (let i = 0; i < 3; i += 1) expect((await stats()).status).toBe(200);
    expect((await stats()).status).toBe(429);
  });
});

describe('GET /api/admin/overview/trends', () => {
  const call = (query = '') => trends(new Request(`http://localhost/api/admin/overview/trends${query}`));

  it('仅审核员与管理员；按上海时区给出最近 N 天的投稿、点赞与新用户', async () => {
    expect((await call()).status).toBe(401);
    await login(bob.id);
    expect((await call()).status).toBe(403);
    const [moderator] = await db.insert(users).values({ email: 'mod-trend@example.test', role: 'moderator', emailVerifiedAt: new Date() }).returning();
    await login(moderator.id);
    const now = new Date();
    await db.update(communityRevisions).set({ submittedAt: now }).where(eq(communityRevisions.workId, w.cat));
    await seedLike(db, w.cat, bob.id, now);
    const response = await call('?days=7');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = await response.json();
    expect(body).toMatchObject({ days: 7, timezone: 'Asia/Shanghai' });
    expect(body.items).toHaveLength(7);
    const today = body.items.at(-1);
    expect(today.date).toBe(body.to);
    expect(today.submissions).toBe(1);
    expect(today.likes).toBe(1);
    expect(today.newUsers).toBe(3);
    // R15-10：总览指标卡的迷你趋势（评论 / 举报按创建日，内容安全只计实际调用）。
    expect(today).toEqual(expect.objectContaining({ comments: expect.any(Number), reports: expect.any(Number), moderationCalls: 0 }));
    expect(body.items.slice(0, 6).every((item: { submissions: number }) => item.submissions === 0)).toBe(true);
    expect((await (await call()).json()).items).toHaveLength(7);
    expect((await call('?days=0')).status).toBe(400);
    expect((await call('?days=91')).status).toBe(400);
  });
});
