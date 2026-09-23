import { beforeEach, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestClient, type TestDatabase } from '@/../db/testClient';
import { communityRevisions, communityWorks, users } from '@/../db/schema';
import { setTestDb } from '@/lib/auth/db';
import { createSession } from '@/lib/auth/session';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookies';
import { DEFAULT_GENERATION_PARAMS } from '@/lib/types';
import { COMMUNITY_LICENSE_VERSION, deriveCommunityPreview } from '@/lib/community/snapshot';
import { GET } from './route';
import { GET as inspect, PATCH } from './[id]/route';

let token: string | undefined;
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => name === SESSION_COOKIE_NAME && token ? { value: token } : undefined }) }));
let db: TestDatabase;
let moderatorId: string;
let authorId: string;
let workId: string;
const pattern = { width: 1, height: 1, cells: [{ hex: '#FAF4C8', code: 'A01', transparent: false }] };
const snapshot = { version: 1, engineVersion: 'test', boardProfile: '5mm-29', paletteSelection: { palette: { kind: 'builtin', brand: 'MARD' }, kitTier: 0 }, params: { ...DEFAULT_GENERATION_PARAMS, backgroundPrototype: null }, pattern };
const list = (query = '') => GET(new Request(`http://localhost/api/admin/community/works${query}`));
const params = () => ({ params: Promise.resolve({ id: workId }) });
const detail = () => inspect(new Request(`http://localhost/api/admin/community/works/${workId}`), params());
beforeEach(async () => {
  db = await createTestClient(); setTestDb(db); token = undefined;
  const [moderator, author] = await db.insert(users).values([
    { email: 'moderator@example.test', role: 'moderator', emailVerifiedAt: new Date() },
    { email: 'private-author@example.test', role: 'user', emailVerifiedAt: new Date() },
  ]).returning();
  moderatorId = moderator.id; authorId = author.id;
  const [work] = await db.insert(communityWorks).values({ authorUserId: authorId }).returning(); workId = work.id;
  const [revision] = await db.insert(communityRevisions).values({ workId, revisionNumber: 1, status: 'published', title: '红色小猫', authorType: 'user', publicAuthorId: crypto.randomUUID(), frozenDisplayName: '豆友', licenseVersion: COMMUNITY_LICENSE_VERSION, licenseConfirmedAt: new Date(), engineVersion: 'test', boardProfile: '5mm-29', paletteKind: 'builtin', paletteId: 'MARD', width: 1, height: 1, colorCount: 1, snapshot, preview: deriveCommunityPreview(pattern), publishedAt: new Date() }).returning();
  await db.update(communityWorks).set({ currentPublishedRevisionId: revision.id }).where(eq(communityWorks.id, workId));
});
it('guards list and detail, limits list payloads, and retains approved material through removal and restore', async () => {
  expect((await list()).status).toBe(401); expect((await detail()).status).toBe(401);
  token = (await createSession(db, authorId)).token;
  expect((await list()).status).toBe(403); expect((await detail()).status).toBe(403);
  token = (await createSession(db, moderatorId)).token;
  const response = await list(); expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toContain('no-store');
  const body = await response.json(); expect(body.items).toHaveLength(1); expect(body.items[0].preview).toMatchObject({ version: 1 });
  expect(JSON.stringify(body)).not.toContain('snapshot');
  const material = await (await detail()).json(); expect(material).toMatchObject({ version: 1, isPublic: true, canRestore: true, material: { snapshot } });
  for (const forbidden of [authorId, 'private-author@example.test', 'authorUserId', 'sourceDesignId']) {
    expect(JSON.stringify(body)).not.toContain(forbidden); expect(JSON.stringify(material)).not.toContain(forbidden);
  }
  const update = async (action: string, version: number) => PATCH(new Request(`http://localhost/api/admin/community/works/${workId}`, { method: 'PATCH', headers: { origin: 'http://localhost', host: 'localhost', 'content-type': 'application/json', 'idempotency-key': action }, body: JSON.stringify({ action, expectedVersion: version, reason: '复核作品完整状态' }) }), params());
  expect((await update('remove', 1)).status).toBe(200);
  expect(await (await detail()).json()).toMatchObject({ lifecycleStatus: 'removed', isPublic: false, canRestore: true, material: { snapshot } });
  expect((await (await list('?status=active')).json()).items).toHaveLength(0);
  expect((await update('restore', 2)).status).toBe(200);
  expect(await (await detail()).json()).toMatchObject({ isPublic: true, version: 3 });
});
it('paginates by page/size with a real total and rejects sizes outside the whitelist', async () => {
  token = (await createSession(db, moderatorId)).token;
  await db.insert(communityWorks).values(Array.from({ length: 25 }, () => ({ authorUserId: authorId, createdAt: new Date('2026-01-01T00:00:00Z') })));
  const first = await (await list()).json();
  expect(first.items).toHaveLength(10); expect(first.total).toBe(26); expect(first.totalPages).toBe(3); expect(first.page).toBe(1);
  const second = await (await list('?page=2')).json();
  expect(second.items).toHaveLength(10); expect(second.page).toBe(2);
  const third = await (await list('?page=3&size=20')).json();
  expect(third.items).toHaveLength(6); expect(third.size).toBe(20);
  // 超过总页数时服务端夹回最后一页，客户端不会停在空页。
  const clamped = await (await list('?page=99')).json();
  expect(clamped.page).toBe(3); expect(clamped.items).toHaveLength(6);
  expect(new Set([...first.items, ...second.items, ...third.items].map((item) => item.id)).size).toBe(26);
  expect((await (await list(`?q=${workId}`)).json()).items).toHaveLength(1);
  expect((await list('?size=7')).status).toBe(400);
  expect((await list('?page=0')).status).toBe(400);
  expect((await list('?status=invalid')).status).toBe(400);
});

it('filters by public status with the same predicate the row DTO reports', async () => {
  token = (await createSession(db, moderatorId)).token;
  // 已下架但有已批准修订：属于「未公开」，不能因为存在修订而被算成公开。
  const [withdrawn] = await db.insert(communityWorks).values({ authorUserId: authorId, lifecycleStatus: 'withdrawn', currentPublishedRevisionId: crypto.randomUUID() }).returning();
  // 正常但从未发布：也是未公开。
  const [neverPublished] = await db.insert(communityWorks).values({ authorUserId: authorId }).returning();
  const all = await (await list()).json();
  expect(all.total).toBe(3);
  const onlyPublic = await (await list('?public=public')).json();
  expect(onlyPublic.items.map((item: { id: string }) => item.id)).toEqual([workId]);
  expect(onlyPublic.items.every((item: { isPublic: boolean }) => item.isPublic)).toBe(true);
  const hidden = await (await list('?public=hidden&size=20')).json();
  expect(hidden.items.map((item: { id: string }) => item.id).sort()).toEqual([withdrawn.id, neverPublished.id].sort());
  expect(hidden.items.every((item: { isPublic: boolean }) => item.isPublic === false)).toBe(true);
  expect((await list('?public=nope')).status).toBe(400);
});
