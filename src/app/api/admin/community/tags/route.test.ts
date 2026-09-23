import { beforeEach, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestClient, type TestDatabase } from '@/../db/testClient';
import { adminAuditLogs, communityTags, communityWorks, communityWorkTags, users } from '@/../db/schema';
import { setTestDb } from '@/lib/auth/db';
import { createSession } from '@/lib/auth/session';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookies';
import { GET, POST } from './route';

let token: string | undefined;
let db: TestDatabase;
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => name === SESSION_COOKIE_NAME && token ? { value: token } : undefined }) }));
beforeEach(async () => { db = await createTestClient(); setTestDb(db); token = undefined; });
const request = (body: unknown, key: string) => new Request('http://localhost/api/admin/community/tags', { method: 'POST', headers: { origin: 'http://localhost', host: 'localhost', 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(body) });

it('uses a zero creation version, returns definite duplicate conflicts and validates int4 before SQL', async () => {
  const body = { name: '节日', slug: 'festival', sortOrder: 0, expectedVersion: 0, reason: '经人工核对的分类' };
  expect((await POST(request(body, 'unauthorized'))).status).toBe(401);
  const [moderator] = await db.insert(users).values({ email: 'tag-reviewer@example.test', role: 'moderator', emailVerifiedAt: new Date() }).returning();
  token = (await createSession(db, moderator.id)).token;
  expect((await POST(request({ name: '节日', slug: 'festival', reason: body.reason }, 'missing-base'))).status).toBe(400);
  expect((await POST(request({ ...body, sortOrder: 2147483648 }, 'large-order'))).status).toBe(400);
  const saved = await POST(request(body, 'create')); expect(saved.status).toBe(201);
  expect((await POST(request(body, 'create'))).status).toBe(200);
  const duplicate = await POST(request(body, 'another-create'));
  expect(duplicate.status).toBe(409); expect(await duplicate.json()).toMatchObject({ error: { code: 'STATE_CONFLICT' } });
  expect((await POST(request({ ...body, name: '动物', slug: 'animals' }, 'another-create'))).status).toBe(201);
  // slug 可省略：中文名自动派生链接标识
  const derived = await POST(request({ name: '星星人', expectedVersion: 0, reason: body.reason }, 'derived-slug'));
  expect(derived.status).toBe(201); expect((await derived.json()).slug).toMatch(/^t-[0-9a-f]{12}$/u);
  expect(await db.select().from(communityTags)).toHaveLength(3);
  expect(await db.select().from(adminAuditLogs)).toHaveLength(3);
  const listed = await GET(new Request('http://localhost/api/admin/community/tags?q=星'));
  expect(listed.headers.get('cache-control')).toContain('no-store');
  expect((await listed.json()).items).toMatchObject([{ name: '星星人', workCount: 0 }]);
});

it('counts tagged works with a real join instead of the always-zero correlated subquery', async () => {
  const [moderator] = await db.insert(users).values({ email: 'tag-counter@example.test', role: 'moderator', emailVerifiedAt: new Date() }).returning();
  token = (await createSession(db, moderator.id)).token;
  const created = await POST(request({ name: '星星人', expectedVersion: 0, reason: '经人工核对的分类' }, 'create-star'));
  expect(created.status).toBe(201);
  const [tag] = await db.select().from(communityTags);
  const [author] = await db.insert(users).values({ email: 'tag-author@example.test', role: 'user', emailVerifiedAt: new Date() }).returning();
  const [work] = await db.insert(communityWorks).values({ authorUserId: author.id }).returning();
  const [published] = await db.insert(communityWorks).values({ authorUserId: author.id }).returning();
  await db.update(communityWorks).set({ currentPublishedRevisionId: crypto.randomUUID() }).where(eq(communityWorks.id, published.id));
  await db.insert(communityWorkTags).values([
    { workId: work.id, tagId: tag.id },
    { workId: published.id, tagId: tag.id },
  ]);
  // 回归点：旧实现把外层的 community_tags.id 渲染成不带表名的 "id"，被解析成 cwt.id → 永远 0。
  const body = await (await GET(new Request('http://localhost/api/admin/community/tags'))).json();
  expect(body.items).toMatchObject([{ name: '星星人', workCount: 2, publicWorkCount: 1 }]);
  expect(body.total).toBe(1);
});

it('creates a tag without a hand-written reason and still writes an audit reason', async () => {
  const [moderator] = await db.insert(users).values({ email: 'tag-noreason@example.test', role: 'moderator', emailVerifiedAt: new Date() }).returning();
  token = (await createSession(db, moderator.id)).token;
  const created = await POST(request({ name: '水豚', expectedVersion: 0 }, 'create-without-reason'));
  expect(created.status).toBe(201);
  const [log] = await db.select().from(adminAuditLogs);
  expect(log).toMatchObject({ action: 'community.tag_created', reason: '标签管理：新建标签' });
});
