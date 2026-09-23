/**
 * 管理端原图上传（admin-round-3 10 / ADR-0025）在私人原图资产模型下的契约：
 * - 官方草稿走管理端路径：计管理端独立配额与全部二进制原图入口共用的上传计数，不消耗豆社公开写配额；
 * - 上传队列按 sha256 复用本人已上传的资产时用 POST 关联，不再传字节，也不计二进制上传；
 * - 只有具备 official:manage 的账号可以调用。
 */
import { beforeEach, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestClient, type TestDatabase } from '@/../db/testClient';
import { communityOriginals, originalAssets, rateLimits, users } from '@/../db/schema';
import { TEST_PNG } from '@/../db/testOriginals';
import { setTestDb } from '@/lib/auth/db';
import { createSession } from '@/lib/auth/session';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookies';
import type { Actor } from '@/lib/auth/authorization';
import { createMemoryOriginalStore, setOriginalStore } from '@/lib/community/originalStore';
import { createOfficialBatch, saveOfficialDraft } from '@/lib/community/officialBatch';
import { DEFAULT_GENERATION_PARAMS } from '@/lib/types';
import { POST, PUT } from './route';

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
let firstRevisionId: string;
let secondRevisionId: string;

const url = (revisionId: string) => `http://localhost/api/admin/community/revisions/${revisionId}/original`;
const params = (revisionId: string) => ({ params: Promise.resolve({ id: revisionId }) });
const upload = (revisionId: string) => PUT(new Request(url(revisionId), {
  method: 'PUT',
  headers: { origin: 'http://localhost', host: 'localhost', 'content-type': 'application/octet-stream', 'x-real-ip': '203.0.113.7' },
  body: new Uint8Array(TEST_PNG),
}), params(revisionId));
const attach = (revisionId: string, assetId: string) => POST(new Request(url(revisionId), {
  method: 'POST',
  headers: { origin: 'http://localhost', host: 'localhost', 'content-type': 'application/json', 'x-real-ip': '203.0.113.7' },
  body: JSON.stringify({ assetId }),
}), params(revisionId));
async function counter(key: string): Promise<number> {
  const [row] = await db.select({ count: rateLimits.count }).from(rateLimits).where(eq(rateLimits.key, key));
  return row?.count ?? 0;
}

beforeEach(async () => {
  db = await createTestClient(); setTestDb(db); token = undefined;
  setOriginalStore(createMemoryOriginalStore());
  const [admin, viewer] = await db.insert(users).values([
    { email: 'admin@example.test', passwordHash: 'hash', role: 'admin', emailVerifiedAt: new Date() },
    { email: 'viewer@example.test', passwordHash: 'hash', role: 'user', emailVerifiedAt: new Date() },
  ]).returning();
  adminId = admin.id; viewerId = viewer.id;
  const actor: Actor = { userId: adminId, role: 'admin', accountStatus: 'active', emailVerified: true };
  const batch = await createOfficialBatch(db, { actor, itemCount: 2, defaultParams: DEFAULT_GENERATION_PARAMS,
    engineVersion: '2.0.0', reason: '开始管理端原图路由测试', requestId: 'start' });
  const first = await saveOfficialDraft(db, { actor, batchId: batch.id, title: '官方草稿 01', snapshot, reason: '保存生成结果', requestId: 'save-1' });
  const second = await saveOfficialDraft(db, { actor, batchId: batch.id, title: '官方草稿 02', snapshot, reason: '保存生成结果', requestId: 'save-2' });
  firstRevisionId = first.revisionId; secondRevisionId = second.revisionId;
});

it('只有具备 official:manage 的账号可以调用管理端原图接口', async () => {
  expect((await upload(firstRevisionId)).status).toBe(401);
  token = (await createSession(db, viewerId)).token;
  expect((await upload(firstRevisionId)).status).toBe(403);
  expect(await db.select().from(communityOriginals)).toHaveLength(0);
  expect(await counter(`original:user:minute:${viewerId}`)).toBe(0);
});

it('官方草稿经管理端路径上传：计管理端配额与统一二进制上传计数，不占豆社公开写配额', async () => {
  token = (await createSession(db, adminId)).token;
  const response = await upload(firstRevisionId);
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ revisionId: firstRevisionId, mimeType: 'image/png', byteSize: TEST_PNG.byteLength });
  expect(await db.select().from(communityOriginals).where(eq(communityOriginals.revisionId, firstRevisionId))).toHaveLength(1);
  expect(await counter(`admin:original:${adminId}`)).toBe(1);
  expect(await counter(`original:user:minute:${adminId}`)).toBe(1);
  expect(await counter(`original:ip:minute:203.0.113.7`)).toBe(1);
  expect(await counter(`community:write:${adminId}`)).toBe(0);
});

it('复用本人已上传的资产时 POST 关联到另一份官方草稿，不再计二进制上传', async () => {
  token = (await createSession(db, adminId)).token;
  expect((await upload(firstRevisionId)).status).toBe(201);
  const [asset] = await db.select().from(originalAssets).where(eq(originalAssets.userId, adminId));
  const before = await counter(`original:user:minute:${adminId}`);
  const attached = await attach(secondRevisionId, asset.id);
  expect(attached.status).toBe(200);
  expect(await attached.json()).toMatchObject({ revisionId: secondRevisionId, sha256: asset.sha256, cosKey: asset.cosKey });
  expect(await counter(`original:user:minute:${adminId}`)).toBe(before);
  const rows = await db.select().from(communityOriginals);
  expect(rows.map((row) => row.revisionId).sort()).toEqual([firstRevisionId, secondRevisionId].sort());
  expect(new Set(rows.map((row) => row.cosKey)).size).toBe(1);
});
