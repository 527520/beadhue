/**
 * GET /api/designs/:id/thumbnail（R15-02）：仅本人、按修订长期缓存 + ETag、按账号限流；
 * GET /api/designs 列表项带 thumbnailUrl。
 */
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestClient, type TestDatabase } from '@/../db/testClient';
import { designs, users } from '@/../db/schema';
import { setTestDb } from '@/lib/auth/db';
import { createSession } from '@/lib/auth/session';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookies';
import { DEFAULT_GENERATION_PARAMS } from '@/lib/types';
import { thumbnailPixelSize } from '@/lib/render/thumbnailSize';

vi.mock('@/lib/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/config')>();
  return { ...actual, config: { ...actual.config, security: { ...actual.config.security, designThumbnailRateLimit: 5 } } };
});

let token: string | undefined;
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === SESSION_COOKIE_NAME && token ? { value: token } : undefined), set: () => undefined }),
}));

import { GET } from './route';
import { GET as list } from '../../route';

let db: TestDatabase;
let userId: string;
const designId = '00000000-0000-4000-8000-0000000000d1';

function project(width = 3, height = 2) {
  return {
    format: 'beadhue-project', version: 3, engineVersion: 'test', boardProfile: '5mm-29', name: '私人设计',
    createdAt: '2026-09-05T00:00:00Z', updatedAt: '2026-09-05T00:00:00Z', params: DEFAULT_GENERATION_PARAMS,
    paletteSelection: { palette: { kind: 'builtin', brand: 'MARD' }, kitTier: 0 },
    pattern: { width, height, cells: Array.from({ length: width * height }, () => ({ hex: '#FC3D46', code: 'F02', transparent: false })) },
  };
}

const request = (id: string, query = '', headers: Record<string, string> = {}) =>
  GET(new Request(`http://localhost/api/designs/${id}/thumbnail${query}`, { headers }), { params: Promise.resolve({ id }) });

beforeEach(async () => {
  db = await createTestClient();
  setTestDb(db);
  const [user] = await db.insert(users).values({ email: 'thumb-owner@example.test', emailVerifiedAt: new Date() }).returning();
  userId = user.id;
  token = (await createSession(db, userId)).token;
  await db.insert(designs).values({ id: designId, userId, name: '私人设计', project: project(), payloadBytes: 1, revision: 3 });
});

describe('GET /api/designs/:id/thumbnail', () => {
  it('修订一致：返回豆粒 PNG，长期私有缓存并带 ETag；If-None-Match 命中返回 304', async () => {
    const response = await request(designId, '?rev=3&v=2');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
    const etag = response.headers.get('etag');
    expect(etag).toMatch(/^"[0-9a-f]{64}"$/u);
    const png = Buffer.from(await response.arrayBuffer());
    expect(png.toString('latin1', 1, 4)).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual(Object.values(thumbnailPixelSize(3, 2)));

    const revalidated = await request(designId, '?rev=3', { 'if-none-match': etag! });
    expect(revalidated.status).toBe(304);
    expect(revalidated.headers.get('etag')).toBe(etag);
    expect(await revalidated.text()).toBe('');

    // 设计被改：ETag 随修订变化，旧 ETag 不再命中。
    await db.update(designs).set({ revision: 4, project: project(4, 4) }).where(eq(designs.id, designId));
    const changed = await request(designId, '?rev=4', { 'if-none-match': etag! });
    expect(changed.status).toBe(200);
    expect(changed.headers.get('etag')).not.toBe(etag);
  });

  it('修订不一致或缺省：照常返回当前图但不缓存；修订号非法返回 400', async () => {
    const stale = await request(designId, '?rev=2');
    expect(stale.status).toBe(200);
    expect(stale.headers.get('cache-control')).toBe('private, no-store');
    expect((await request(designId)).headers.get('cache-control')).toBe('private, no-store');
    const invalid = await request(designId, '?rev=abc');
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error).toMatchObject({ code: 'VALIDATION', field: 'rev' });
  });

  it('未登录 401；他人、已删除、不存在与非法编号一律 404', async () => {
    token = undefined;
    expect((await request(designId, '?rev=3')).status).toBe(401);
    const [other] = await db.insert(users).values({ email: 'thumb-other@example.test', emailVerifiedAt: new Date() }).returning();
    token = (await createSession(db, other.id)).token;
    expect((await request(designId, '?rev=3')).status).toBe(404);
    token = (await createSession(db, userId)).token;
    expect((await request('not-a-uuid')).status).toBe(404);
    expect((await request('00000000-0000-4000-8000-0000000000ff')).status).toBe(404);
    await db.update(designs).set({ deletedAt: new Date(), project: null, name: '', payloadBytes: 0 }).where(eq(designs.id, designId));
    expect((await request(designId, '?rev=3')).status).toBe(404);
  });

  it('按账号限流：第 6 次（含 304）返回 429 + Retry-After', async () => {
    const first = await request(designId, '?rev=3');
    const etag = first.headers.get('etag')!;
    for (let i = 0; i < 4; i += 1) expect((await request(designId, '?rev=3', { 'if-none-match': etag })).status).toBe(304);
    const limited = await request(designId, '?rev=3');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
    expect((await limited.json()).error.code).toBe('RATE_LIMITED');
  });

  it('GET /api/designs 列表项带版本化 thumbnailUrl，墓碑为 null', async () => {
    await db.insert(designs).values({ id: '00000000-0000-4000-8000-0000000000d2', userId, name: '', project: null, payloadBytes: 0, revision: 2, deletedAt: new Date() });
    const body = await (await list(new Request('http://localhost/api/designs'))).json() as { items: Array<{ id: string; thumbnailUrl: string | null }> };
    expect(body.items.find((item) => item.id === designId)?.thumbnailUrl).toBe(`/api/designs/${designId}/thumbnail?rev=3&v=2`);
    expect(body.items.find((item) => item.id !== designId)?.thumbnailUrl).toBeNull();
  });
});
