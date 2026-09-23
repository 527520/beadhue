/**
 * /api/me/notifications*（D70）：鉴权、分页、未读数、标记已读（指定 / 全部，只影响本人）、
 * 参数校验、Origin 防护、幂等回放、限流 429 与缓存头。
 */
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestClient, type TestDatabase } from '@/../db/testClient';
import { notifications, users } from '@/../db/schema';
import { setTestDb } from '@/lib/auth/db';
import { createSession } from '@/lib/auth/session';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookies';
import { createNotification } from '@/lib/notifications/service';

vi.mock('@/lib/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/config')>();
  return { ...actual, config: { ...actual.config, security: { ...actual.config.security, meReadRateLimit: 6, meWriteRateLimit: 4 } } };
});

let token: string | undefined;
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === SESSION_COOKIE_NAME && token ? { value: token } : undefined), set: () => undefined }),
}));

import { GET as list } from './route';
import { GET as unread } from './unread-count/route';
import { POST as markRead } from './read/route';

let db: TestDatabase;
let userId: string;
let otherId: string;
const payload = { workId: '00000000-0000-4000-8000-00000000000a', title: '橘猫团子' };
const read = (body: unknown, extra: Record<string, string> = {}) => markRead(new Request('http://localhost/api/me/notifications/read', {
  method: 'POST', headers: { origin: 'http://localhost', host: 'localhost', 'content-type': 'application/json', ...extra }, body: JSON.stringify(body),
}));

beforeEach(async () => {
  db = await createTestClient();
  setTestDb(db);
  token = undefined;
  const [user] = await db.insert(users).values({ email: 'inbox@example.test', emailVerifiedAt: new Date() }).returning();
  const [other] = await db.insert(users).values({ email: 'inbox-other@example.test', emailVerifiedAt: new Date() }).returning();
  userId = user.id; otherId = other.id;
  for (let index = 0; index < 3; index += 1) {
    await createNotification(db, { userId, type: 'revision_approved', payload, now: new Date(Date.UTC(2026, 8, 20, 0, index)) });
  }
  await createNotification(db, { userId: otherId, type: 'work_removed', payload });
});

describe('GET /api/me/notifications 与未读数', () => {
  it('未登录 401', async () => {
    expect((await list(new Request('http://localhost/api/me/notifications'))).status).toBe(401);
    expect((await unread()).status).toBe(401);
  });

  it('只看本人的通知，倒序分页并附未读数；参数非法 400', async () => {
    token = (await createSession(db, userId)).token;
    const first = await list(new Request('http://localhost/api/me/notifications?limit=2'));
    expect(first.headers.get('cache-control')).toBe('private, no-store');
    const body = await first.json();
    expect(body).toMatchObject({ unreadCount: 3, nextCursor: expect.any(String) });
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({ type: 'revision_approved', payload, read: false, readAt: null, createdAt: '2026-09-20T00:02:00.000Z' });
    const second = await (await list(new Request(`http://localhost/api/me/notifications?limit=2&cursor=${encodeURIComponent(body.nextCursor)}`))).json();
    expect(second).toMatchObject({ nextCursor: null });
    expect(second.items).toHaveLength(1);
    expect((await list(new Request('http://localhost/api/me/notifications?limit=0'))).status).toBe(400);
    expect((await list(new Request('http://localhost/api/me/notifications?cursor=forged'))).status).toBe(400);
    expect(await (await unread()).json()).toEqual({ unreadCount: 3 });
  });

  it('按账号限流：只读接口共享额度，第 7 次 429', async () => {
    token = (await createSession(db, userId)).token;
    for (let i = 0; i < 3; i += 1) expect((await unread()).status).toBe(200);
    for (let i = 0; i < 3; i += 1) expect((await list(new Request('http://localhost/api/me/notifications'))).status).toBe(200);
    const limited = await unread();
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
  });
});

describe('POST /api/me/notifications/read', () => {
  it('指定编号只标本人的，缺省全部已读；他人的通知不受影响', async () => {
    token = (await createSession(db, userId)).token;
    const mine = await db.select().from(notifications).where(eq(notifications.userId, userId));
    const [theirs] = await db.select().from(notifications).where(eq(notifications.userId, otherId));
    const response = await read({ ids: [mine[0].id, theirs.id] });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ updated: 1, unreadCount: 2 });
    expect(await (await read({})).json()).toEqual({ updated: 2, unreadCount: 0 });
    expect(await (await read({})).json()).toEqual({ updated: 0, unreadCount: 0 });
    const [untouched] = await db.select().from(notifications).where(eq(notifications.id, theirs.id));
    expect(untouched.readAt).toBeNull();
  });

  it('鉴权、Origin 防护、参数校验与幂等回放', async () => {
    expect((await read({})).status).toBe(401);
    token = (await createSession(db, userId)).token;
    expect((await read({}, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await read({ ids: ['not-a-uuid'] })).status).toBe(400);
    expect((await read({ all: true })).status).toBe(400);
    const first = await (await read({}, { 'idempotency-key': 'read-all-1' })).json();
    expect(first).toEqual({ updated: 3, unreadCount: 0 });
    expect(await (await read({}, { 'idempotency-key': 'read-all-1' })).json()).toEqual(first);
  });

  it('按账号限流写接口：第 5 次 429', async () => {
    token = (await createSession(db, userId)).token;
    for (let i = 0; i < 4; i += 1) expect((await read({})).status).toBe(200);
    expect((await read({})).status).toBe(429);
  });
});
