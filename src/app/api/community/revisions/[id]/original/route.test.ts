/**
 * 原图 GET 成本（admin-round-3 12）：
 * - ETag（行内 sha256）+ If-None-Match → 304 空体，且不去取对象字节；
 * - 账号轮 + IP 轮双限流（此前只有上传受限）；
 * - 同一 cosKey 的重复取回命中进程字节缓存，不再打对象存储。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { communityOriginals } from '@/../db/schema';
import { createTestClient, type TestDatabase } from '@/../db/testClient';
import { TEST_PNG } from '@/../db/testOriginals';
import { setTestDb } from '@/lib/auth/db';
import { createSession } from '@/lib/auth/session';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookies';
import { setOriginalStore, type OriginalObjectStore } from '@/lib/community/originalStore';
import { publishWorkFixture } from '@/app/api/community/communityRouteFixture';

// 账号桶 3 次 / IP 桶 2 次：用例不必打满默认的 60 / 200 次。
vi.mock('@/lib/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/config')>();
  return {
    ...actual,
    config: {
      ...actual.config,
      security: { ...actual.config.security, originalReadRateLimit: 4, originalReadIpRateLimit: 2 },
    },
  };
});

let token: string | undefined;
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === SESSION_COOKIE_NAME && token ? { value: token } : undefined) }),
}));

import { GET } from './route';

let db: TestDatabase;

beforeEach(async () => {
  db = await createTestClient();
  setTestDb(db);
  token = undefined;
  setOriginalStore(null);
});

function requestOriginal(revisionId: string, headers: Record<string, string> = {}): Promise<Response> {
  return GET(new Request(`http://localhost/api/community/revisions/${revisionId}/original`, { headers }), {
    params: Promise.resolve({ id: revisionId }),
  });
}

/** 包一层计数的内存对象存储：用来断言「字节缓存命中时不再打对象存储」。 */
function countingStore(inner: OriginalObjectStore): { store: OriginalObjectStore; gets: () => number } {
  let gets = 0;
  return {
    gets: () => gets,
    store: {
      kind: inner.kind,
      put: (key, body, contentType) => inner.put(key, body, contentType),
      delete: (key) => inner.delete(key),
      get: async (key) => { gets += 1; return inner.get(key); },
    },
  };
}

describe('GET /api/community/revisions/[id]/original', () => {
  it('返回 ETag 与 5 分钟私有缓存；If-None-Match 命中回 304 空体且不取字节；重复取回命中字节缓存', async () => {
    const fixture = await publishWorkFixture(db, { title: '原图', email: 'original@example.test' });
    const counting = countingStore(fixture.store);
    setOriginalStore(counting.store);
    token = (await createSession(db, fixture.userId)).token;
    const [row] = await db.select().from(communityOriginals).where(eq(communityOriginals.revisionId, fixture.revisionId));

    const first = await requestOriginal(fixture.revisionId);
    expect(first.status).toBe(200);
    expect(first.headers.get('etag')).toBe(`"${row.sha256}"`);
    expect(first.headers.get('cache-control')).toBe('private, max-age=300, must-revalidate');
    expect(Buffer.from(await first.arrayBuffer()).equals(TEST_PNG)).toBe(true);
    expect(counting.gets()).toBe(1);

    const notModified = await requestOriginal(fixture.revisionId, { 'if-none-match': `"${row.sha256}"` });
    expect(notModified.status).toBe(304);
    expect(await notModified.text()).toBe('');
    expect(notModified.headers.get('etag')).toBe(`"${row.sha256}"`);
    expect(counting.gets()).toBe(1); // 304 不取对象字节

    const staleEtag = await requestOriginal(fixture.revisionId, { 'if-none-match': '"deadbeef"' });
    expect(staleEtag.status).toBe(200);

    const repeat = await requestOriginal(fixture.revisionId);
    expect(repeat.status).toBe(200);
    expect(counting.gets()).toBe(1); // 字节缓存在，重复取回不再打对象存储
    expect(Buffer.from(await repeat.arrayBuffer()).equals(TEST_PNG)).toBe(true);
  });

  it('每账号小时额度：换 IP 也照样受限，超出返回 429 + Retry-After', async () => {
    const fixture = await publishWorkFixture(db, { title: '账号额度', email: 'quota@example.test' });
    setOriginalStore(fixture.store);
    token = (await createSession(db, fixture.userId)).token;

    for (let i = 0; i < 4; i += 1) {
      // 每次换一个 IP：IP 桶不参与，只考察账号桶
      expect((await requestOriginal(fixture.revisionId, { 'x-real-ip': `198.51.100.${i + 1}` })).status).toBe(200);
    }
    const limited = await requestOriginal(fixture.revisionId, { 'x-real-ip': '198.51.100.9' });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
    expect((await limited.json()).error.code).toBe('RATE_LIMITED');
  });

  it('每 IP 小时额度：未登录请求也计数，超出返回 429', async () => {
    const fixture = await publishWorkFixture(db, { title: 'IP 额度', email: 'ip-quota@example.test' });
    setOriginalStore(fixture.store);
    const ip = '203.0.113.55';

    // 未登录：鉴权不通过（404），但限流先记一笔。
    expect((await requestOriginal(fixture.revisionId, { 'x-real-ip': ip })).status).toBe(404);
    expect((await requestOriginal(fixture.revisionId, { 'x-real-ip': ip })).status).toBe(404);
    const limited = await requestOriginal(fixture.revisionId, { 'x-real-ip': ip });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
  });
});
