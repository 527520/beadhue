/**
 * 缩略图热路径（admin-round-3 12）：
 * - 命中进程缓存的请求不得再读数据库（此前每次都读整行 snapshot 并 zod 解析）；
 * - 每 IP 限流对命中缓存的请求同样生效；
 * - 未公开修订不得进入公开缓存槽位（否则匿名访客凭修订编号就能取走草稿图）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestClient, type TestDatabase } from '@/../db/testClient';
import { setTestDb } from '@/lib/auth/db';
import { createSession } from '@/lib/auth/session';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookies';
import { publishWorkFixture, type PublishedWorkFixture } from '@/app/api/community/communityRouteFixture';

// 限流阈值压到 3，用例才不必打 1200 次请求。
vi.mock('@/lib/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/config')>();
  return { ...actual, config: { ...actual.config, security: { ...actual.config.security, publicReadRateLimit: 3 } } };
});

// 载入器包一层 spy：命中缓存的请求不该再调用它。
vi.mock('@/lib/community/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/community/queries')>();
  return { ...actual, loadRevisionForThumbnail: vi.fn(actual.loadRevisionForThumbnail) };
});

let token: string | undefined;
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === SESSION_COOKIE_NAME && token ? { value: token } : undefined) }),
}));

import { loadRevisionForThumbnail } from '@/lib/community/queries';
import { GET } from './route';

let db: TestDatabase;
const loader = vi.mocked(loadRevisionForThumbnail);

beforeEach(async () => {
  db = await createTestClient();
  setTestDb(db);
  token = undefined;
  loader.mockClear();
});

function requestThumbnail(revisionId: string, ip?: string): Promise<Response> {
  return GET(
    new Request(`http://localhost/api/community/revisions/${revisionId}/thumbnail`, ip ? { headers: { 'x-real-ip': ip } } : undefined),
    { params: Promise.resolve({ id: revisionId }) },
  );
}

describe('GET /api/community/revisions/[id]/thumbnail', () => {
  it('公开修订：第二次请求命中进程缓存，不再读库，返回同一份 PNG', async () => {
    const fixture: PublishedWorkFixture = await publishWorkFixture(db, { title: '缓存命中', email: 'hit@example.test' });

    const first = await requestThumbnail(fixture.revisionId);
    expect(first.status).toBe(200);
    expect(loader).toHaveBeenCalledTimes(1);
    const firstBytes = Buffer.from(await first.arrayBuffer());
    expect(firstBytes.length).toBeGreaterThan(0);

    const second = await requestThumbnail(fixture.revisionId);
    expect(second.status).toBe(200);
    expect(loader).toHaveBeenCalledTimes(1); // 命中缓存：零读库
    expect(Buffer.from(await second.arrayBuffer()).equals(firstBytes)).toBe(true);
    expect(second.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('每 IP 限流对缓存命中的请求同样计数（第 4 次 429，带 Retry-After）', async () => {
    const fixture = await publishWorkFixture(db, { title: '限流', email: 'limit@example.test' });
    const ip = '203.0.113.7';

    for (let i = 0; i < 3; i += 1) {
      expect((await requestThumbnail(fixture.revisionId, ip)).status).toBe(200);
    }
    expect(loader).toHaveBeenCalledTimes(1); // 后两次都是缓存命中，但照样计限流

    const limited = await requestThumbnail(fixture.revisionId, ip);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
    expect((await limited.json()).error.code).toBe('RATE_LIMITED');
  });

  it('未公开修订不进公开缓存：作者每次请求都要重新读库，响应不共享缓存', async () => {
    const fixture = await publishWorkFixture(db, { title: '草稿', email: 'draft@example.test', mode: 'draft' });
    token = (await createSession(db, fixture.userId)).token;

    const first = await requestThumbnail(fixture.revisionId);
    const second = await requestThumbnail(fixture.revisionId);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(loader).toHaveBeenCalledTimes(2); // 私有修订每次读库鉴权
    expect(second.headers.get('cache-control')).toBe('private, no-store');
  });
});
