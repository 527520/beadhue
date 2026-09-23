import { beforeEach, expect, it, vi } from 'vitest';
import { createTestClient, type TestDatabase } from '@/../db/testClient';
import { communityRevisions, users } from '@/../db/schema';
import { setTestDb } from '@/lib/auth/db';
import { createSession } from '@/lib/auth/session';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookies';
import type { Actor } from '@/lib/auth/authorization';
import { DEFAULT_GENERATION_PARAMS } from '@/lib/types';
import { createOfficialBatch, saveOfficialDraft } from '@/lib/community/officialBatch';
import { PATCH } from './route';

let token: string | undefined;
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => name === SESSION_COOKIE_NAME && token ? { value: token } : undefined }) }));
const snapshot = {
  version: 1 as const, engineVersion: '2.0.0', boardProfile: '5mm-29' as const,
  paletteSelection: { palette: { kind: 'custom' as const, colors: [{ hex: '#FF0000', code: 'R' }] }, kitTier: 0 },
  params: { ...DEFAULT_GENERATION_PARAMS, targetWidth: 20, backgroundPrototype: null },
  pattern: { width: 1, height: 1, cells: [{ hex: '#FF0000', code: 'R', transparent: false }] },
};
let db: TestDatabase;
let adminId: string;
let viewerId: string;
let batchId: string;
let revisionId: string;
let version: number;
const revise = (body: unknown, key: string) => PATCH(new Request(
  `http://localhost/api/admin/batches/${batchId}/drafts/${revisionId}`,
  { method: 'PATCH', headers: { origin: 'http://localhost', host: 'localhost', 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(body) },
), { params: Promise.resolve({ id: batchId, revisionId }) });
beforeEach(async () => {
  db = await createTestClient(); setTestDb(db); token = undefined;
  const [admin, viewer] = await db.insert(users).values([
    { email: 'admin@example.test', passwordHash: 'hash', role: 'admin', emailVerifiedAt: new Date() },
    { email: 'viewer@example.test', passwordHash: 'hash', role: 'user', emailVerifiedAt: new Date() },
  ]).returning();
  adminId = admin.id; viewerId = viewer.id;
  const actor: Actor = { userId: adminId, role: 'admin', accountStatus: 'active', emailVerified: true };
  const batch = await createOfficialBatch(db, { actor, itemCount: 2, defaultParams: DEFAULT_GENERATION_PARAMS,
    engineVersion: '2.0.0', reason: '开始草稿修订路由测试', requestId: 'start' });
  batchId = batch.id;
  const draft = await saveOfficialDraft(db, { actor, batchId, title: '待修订草稿', snapshot, reason: '保存生成结果', requestId: 'save' });
  revisionId = draft.revisionId; version = draft.version;
});
it('guards draft revision by session and official:manage capability', async () => {
  const body = { expectedVersion: version, title: '路由修订标题', reason: '复核后修正标题' };
  expect((await revise(body, 'guard-anonymous')).status).toBe(401);
  token = (await createSession(db, viewerId)).token;
  expect((await revise(body, 'guard-viewer')).status).toBe(403);
  expect((await db.select().from(communityRevisions))[0].title).toBe('待修订草稿');
});
it('revises an unpublished draft once and replays the same idempotency key', async () => {
  token = (await createSession(db, adminId)).token;
  const body = { expectedVersion: version, title: '路由修订标题', reason: '复核后修正标题' };
  const revised = await revise(body, 'revise-once');
  expect(revised.status).toBe(200);
  const expected = { revisionId, title: '路由修订标题', status: 'draft', version: version + 1 };
  expect(await revised.json()).toMatchObject(expected);
  const replay = await revise(body, 'revise-once');
  expect(replay.status).toBe(200); expect(await replay.json()).toMatchObject(expected);
  expect((await db.select().from(communityRevisions))[0].version).toBe(version + 1);
  expect((await revise({ ...body, title: '第二次修订' }, 'revise-stale')).status).toBe(409);
  expect((await revise({ expectedVersion: version + 1, reason: '没有提供标题或图纸' }, 'revise-empty')).status).toBe(400);
  expect((await db.select().from(communityRevisions))[0].title).toBe('路由修订标题');
});
