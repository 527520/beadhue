import { beforeEach, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestClient, type TestDatabase } from '@/../db/testClient';
import { communityRevisions, communityWorks, designs, idempotencyRecords, users } from '@/../db/schema';
import { setTestDb } from '@/lib/auth/db';
import { createSession } from '@/lib/auth/session';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookies';
import { COMMUNITY_LICENSE_VERSION } from '@/lib/community/snapshot';
import { DEFAULT_GENERATION_PARAMS } from '@/lib/types';
import { POST as create } from './route';
import { POST as revise } from './[id]/revisions/route';
import { POST as submit } from '../revisions/[id]/submit/route';
import { POST as withdrawRevision } from '../revisions/[id]/withdraw/route';
import { POST as withdrawWork } from './[id]/withdraw/route';
import { GET as readOriginal, HEAD as headOriginal, PUT as uploadOriginal } from '../revisions/[id]/original/route';
import { createMemoryOriginalStore, setOriginalStore } from '@/lib/community/originalStore';
import { TEST_PNG } from '@/../db/testOriginals';

let token: string | undefined;
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => name === SESSION_COOKIE_NAME && token ? { value: token } : undefined }) }));
let db: TestDatabase;
let designId: string;
let userId: string;
let store: ReturnType<typeof createMemoryOriginalStore>;
const request = (data: unknown, key = 'same-request') => new Request('http://localhost/api/community/works', {
  method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost', host: 'localhost', 'idempotency-key': key }, body: JSON.stringify(data),
});
const input = () => ({ designId, expectedDesignRevision: 1, title: '公开标题', licenseVersion: COMMUNITY_LICENSE_VERSION });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
beforeEach(async () => {
  db = await createTestClient(); setTestDb(db);
  store = createMemoryOriginalStore(); setOriginalStore(store);
  const [user] = await db.insert(users).values({ email: 'private@example.test', username: '小豆', emailVerifiedAt: new Date() }).returning();
  userId = user.id; token = (await createSession(db, userId)).token; designId = crypto.randomUUID();
  await db.insert(designs).values({ id: designId, userId, name: '私人内容', payloadBytes: 1, project: {
    format: 'beadhue-project', version: 3, engineVersion: 'test', boardProfile: '5mm-29', name: '私人内容',
    createdAt: '2026-09-05T00:00:00Z', updatedAt: '2026-09-05T00:00:00Z', params: DEFAULT_GENERATION_PARAMS,
    paletteSelection: { palette: { kind: 'builtin', brand: 'MARD' }, kitTier: 0 },
    pattern: { width: 1, height: 1, cells: [{ hex: '#FC3D46', code: 'F02', transparent: false }] },
  } });
});
const upload = (id: string, bytes: Uint8Array, contentType = 'application/octet-stream') => uploadOriginal(new Request(`http://localhost/api/community/revisions/${id}/original`, {
  method: 'PUT', headers: { 'content-type': contentType, origin: 'http://localhost', host: 'localhost' }, body: new Blob([new Uint8Array(bytes)]),
}), params(id));
it('创建、提交及撤回重复请求只执行一次，幂等响应不保存快照或私人正文', async () => {
  const first = await create(request(input())); expect(first.status).toBe(201);
  const created = await first.json();
  expect(await (await create(request(input()))).json()).toEqual(created);
  expect(await db.select().from(communityWorks)).toHaveLength(1);
  expect((await create(request({ ...input(), title: '另一作品' }))).status).toBe(409);
  // D49：没有原图提交审核被拒绝；JSON 请求体、非图片字节都不能作为原图
  const missing = await submit(request({ expectedVersion: 1 }), params(created.revisionId));
  expect(missing.status).toBe(409); expect(await missing.json()).toMatchObject({ error: { code: 'ORIGINAL_REQUIRED' } });
  expect((await upload(created.revisionId, new Uint8Array(TEST_PNG), 'application/json')).status).toBe(400);
  expect((await upload(created.revisionId, new TextEncoder().encode('not an image'))).status).toBe(400);
  const uploaded = await upload(created.revisionId, new Uint8Array(TEST_PNG), 'image/png');
  expect(uploaded.status).toBe(201);
  expect(await uploaded.json()).toMatchObject({ revisionId: created.revisionId, mimeType: 'image/png', width: 1, height: 1, byteSize: TEST_PNG.length });
  expect(store.objects.size).toBe(1);
  // 作者可取回，未登录不可（admin-round-3 12：原图 GET 改为 private, max-age=300, must-revalidate + ETag）
  const fetched = await readOriginal(new Request(`http://localhost/api/community/revisions/${created.revisionId}/original`), params(created.revisionId));
  expect(fetched.status).toBe(200); expect(fetched.headers.get('cache-control')).toBe('private, max-age=300, must-revalidate'); expect(fetched.headers.get('etag')).toBeTruthy(); expect(fetched.headers.get('x-original-access')).toBe('author');
  expect(Buffer.from(await fetched.arrayBuffer()).equals(TEST_PNG)).toBe(true);
  expect((await headOriginal(new Request(`http://localhost/api/community/revisions/${created.revisionId}/original`, { method: 'HEAD' }), params(created.revisionId))).status).toBe(200);
  const saved = token; token = undefined;
  expect((await readOriginal(new Request(`http://localhost/api/community/revisions/${created.revisionId}/original`), params(created.revisionId))).status).toBe(404);
  token = saved;
  const pending = await (await submit(request({ expectedVersion: 1 }), params(created.revisionId))).json();
  expect(await (await submit(request({ expectedVersion: 1 }), params(created.revisionId))).json()).toEqual(pending);
  const withdrawn = await (await withdrawRevision(request({ expectedVersion: pending.version }), params(created.revisionId))).json();
  expect(await (await withdrawRevision(request({ expectedVersion: pending.version }), params(created.revisionId))).json()).toEqual(withdrawn);
  const revision = await (await revise(request(input()), params(created.workId))).json();
  expect(await (await revise(request(input()), params(created.workId))).json()).toEqual(revision);
  expect(await db.select().from(communityRevisions)).toHaveLength(2);
  const hidden = await (await withdrawWork(request({ expectedVersion: 1 }), params(created.workId))).json();
  expect(await (await withdrawWork(request({ expectedVersion: 1 }), params(created.workId))).json()).toEqual(hidden);
  expect(hidden).not.toHaveProperty('purgeKeys');
  const responses = JSON.stringify((await db.select().from(idempotencyRecords)).map((item) => item.response));
  for (const secret of [userId, designId, 'private@example.test', '私人内容', '#FC3D46', 'snapshot']) expect(responses).not.toContain(secret);
  // 撤回公开不删除私人资产；授权代理不再开放该修订。
  expect(store.objects.size).toBe(1);
  expect((await readOriginal(new Request(`http://localhost/api/community/revisions/${created.revisionId}/original`), params(created.revisionId))).status).toBe(404);
});
it('修改后重投要求沿用上一版原图而沿用不了时直接拒绝，不留下挡路的草稿', async () => {
  const created = await (await create(request(input(), 'inherit-first'))).json();
  // 上一版已公开但没有原图记录（例如历史数据）：没有可沿用的原图。
  await db.update(communityRevisions).set({ status: 'published' }).where(eq(communityRevisions.id, created.revisionId));
  const refused = await revise(request({ ...input(), inheritOriginal: true }, 'inherit-refused'), params(created.workId));
  expect(refused.status).toBe(409);
  expect(await refused.json()).toMatchObject({ error: { code: 'ORIGINAL_REQUIRED' } });
  expect(await db.select().from(communityRevisions)).toHaveLength(1);
  // 带新原图重投（不要求沿用）照常建草稿，并如实告知没有沿用。
  const draft = await revise(request(input(), 'inherit-upload'), params(created.workId));
  expect(draft.status).toBe(201);
  expect(await draft.json()).toMatchObject({ status: 'draft', originalInherited: false });
});

it('版本过期、非本人设计和缺少许可都不创建作品', async () => {
  await db.update(designs).set({ revision: 2 }).where(eq(designs.id, designId));
  expect((await create(request(input()))).status).toBe(409);
  expect((await create(request({ ...input(), expectedDesignRevision: 2, licenseVersion: '' }))).status).toBe(400);
  const [other] = await db.insert(users).values({ email: 'other@example.test', emailVerifiedAt: new Date() }).returning();
  token = (await createSession(db, other.id)).token;
  expect((await create(request({ ...input(), expectedDesignRevision: 2 }))).status).toBe(404);
  expect(await db.select().from(communityWorks)).toHaveLength(0);
});
it('首次投稿和新修订都必须明确确认所见的云端设计版本', async () => {
  const { expectedDesignRevision: _expected, ...withoutVersion } = input();
  expect((await create(request(withoutVersion))).status).toBe(400);
  const created = await (await create(request(input()))).json();
  expect((await revise(request(withoutVersion), params(created.workId))).status).toBe(400);
  expect(await db.select().from(communityRevisions)).toHaveLength(1);
});
it('幂等重放仍检查账号权限，不能让注销、暂停或未验证账号执行投稿', async () => {
  expect((await create(request(input()))).status).toBe(201);
  await db.update(users).set({ emailVerifiedAt: null }).where(eq(users.id, userId));
  expect((await create(request(input()))).status).toBe(403);
  await db.update(users).set({ accountStatus: 'suspended' }).where(eq(users.id, userId));
  expect((await create(request(input()))).status).toBe(401);
});

it('私人保存与投稿共用原图计数，失败计次；拒绝前不读取图片或写入对象存储', async () => {
  const { PUT: savePrivateOriginal } = await import('../../designs/[id]/original/route');
  const created = await (await create(request(input(), 'rate-limit-draft'))).json();
  const put = vi.spyOn(store, 'put');
  const privateRequest = () => new Request(`http://localhost/api/designs/${designId}/original`, {
    method: 'PUT', headers: {origin:'http://localhost',host:'localhost','content-type':'application/octet-stream','if-match':'1'},
    body: new Uint8Array([0,1,2]),
  });
  for (let attempt=0;attempt<10;attempt++) expect((await savePrivateOriginal(privateRequest(),params(designId))).status).toBe(400);
  const rejected=privateRequest();const body=vi.spyOn(rejected,'body','get');
  const limited=await savePrivateOriginal(rejected,params(designId));
  expect(limited.status).toBe(429);expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
  expect(Number(limited.headers.get('retry-after'))).toBeLessThanOrEqual(60);
  expect(body).not.toHaveBeenCalled();
  const communityRequest=new Request(`http://localhost/api/community/revisions/${created.revisionId}/original`, {
    method:'PUT',headers:{origin:'http://localhost',host:'localhost','content-type':'application/octet-stream'},body:new Uint8Array(TEST_PNG),
  });
  const publicBody=vi.spyOn(communityRequest,'body','get');
  expect((await uploadOriginal(communityRequest,params(created.revisionId))).status).toBe(429);
  expect(publicBody).not.toHaveBeenCalled();expect(put).not.toHaveBeenCalled();
  token=undefined;
  const guest=privateRequest();const guestBody=vi.spyOn(guest,'body','get');
  expect((await savePrivateOriginal(guest,params(designId))).status).toBe(401);expect(guestBody).not.toHaveBeenCalled();
});
