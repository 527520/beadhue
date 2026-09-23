/**
 * GET /api/community/works（R15-02）：新筛选的参数校验、total、登录者喜欢标记、缓存头与每 IP 限流；
 * GET /api/community/works/:id：登录带色号清单，匿名只有颜色数与总颗数。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestClient, type TestDatabase } from '@/../db/testClient';
import { seedAuthor, seedLike, seedWork, solidPattern } from '@/../db/testCommunity';
import { setTestDb } from '@/lib/auth/db';
import { createSession } from '@/lib/auth/session';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookies';
import { resetCommunityCountCache } from '@/lib/community/queries';
import { resetAccountWorkWindow } from '@/lib/security/accountReadQuota';

vi.mock('@/lib/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/config')>();
  return { ...actual, config: { ...actual.config, security: { ...actual.config.security, publicReadRateLimit: 4 } } };
});

let token: string | undefined;
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === SESSION_COOKIE_NAME && token ? { value: token } : undefined), set: () => undefined }),
}));

import { GET as list } from './route';
import { GET as detail } from './[id]/route';

let db: TestDatabase;
let workId: string;
let viewerId: string;

beforeEach(async () => {
  db = await createTestClient();
  setTestDb(db);
  resetCommunityCountCache();
  resetAccountWorkWindow();
  token = undefined;
  const author = await seedAuthor(db, { email: 'list-author@example.test', username: '作者' });
  workId = (await seedWork(db, { author, title: '双色', pattern: solidPattern(3, 3, [['#E0473F', 'F5'], ['#3F7FD9', 'C9']]), colorCount: 2, width: 3, height: 3 })).workId;
  await seedWork(db, { author, title: '大图', width: 60, height: 60, colorCount: 20 });
  viewerId = (await seedAuthor(db, { email: 'list-viewer@example.test', createdAt: new Date('2026-01-01T00:00:00Z') })).id;
  await seedLike(db, workId, viewerId);
});

const get = (query = '', ip?: string) => list(new Request(`http://localhost/api/community/works${query}`, ip ? { headers: { 'x-real-ip': ip } } : undefined));

describe('GET /api/community/works', () => {
  it('匿名：带 total、公开缓存、Vary: Cookie，liked 恒为 false', async () => {
    const response = await get('?size=s&sort=new');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, s-maxage=60, stale-while-revalidate=300');
    expect(response.headers.get('vary')).toBe('Cookie');
    const body = await response.json();
    expect(body).toMatchObject({ total: 1, nextCursor: null, items: [{ id: workId, title: '双色', liked: false }] });
    expect((await (await get('?sort=rec')).json()).total).toBe(2);
  });

  it('登录：标出自己喜欢的作品，响应不进共享缓存', async () => {
    token = (await createSession(db, viewerId)).token;
    const response = await get('?sort=new');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = await response.json() as { items: Array<{ id: string; liked: boolean }> };
    expect(body.items.find((item) => item.id === workId)?.liked).toBe(true);
    expect(body.items.filter((item) => item.liked)).toHaveLength(1);
  });

  it('非法筛选值返回 400 VALIDATION', async () => {
    for (const query of ['?size=huge', '?colors=0', '?since=-1', '?sort=hot', '?spec=4mm']) {
      const response = await get(query);
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe('VALIDATION');
    }
  });

  it('每 IP 限流：第 5 次返回 429 + Retry-After', async () => {
    for (let i = 0; i < 4; i += 1) expect((await get('', '198.51.100.20')).status).toBe(200);
    const limited = await get('', '198.51.100.20');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
  });
});

describe('GET /api/community/works/:id 色号清单', () => {
  const read = () => detail(new Request(`http://localhost/api/community/works/${workId}`), { params: Promise.resolve({ id: workId }) });

  it('登录：colorUsage 按颗数降序', async () => {
    token = (await createSession(db, viewerId)).token;
    const body = await (await read()).json();
    expect(body).toMatchObject({ colorCount: 2, beadCount: 9, colorUsage: [{ code: 'F5', hex: '#E0473F', count: 5 }, { code: 'C9', hex: '#3F7FD9', count: 4 }] });
    expect(body.colorUsage[0].name).toBe('红');
  });

  it('匿名：只有颜色数与总颗数', async () => {
    const body = await (await read()).json();
    expect(body).toMatchObject({ colorCount: 2, beadCount: 9, colorUsage: null, snapshot: null });
  });
});
