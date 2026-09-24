/**
 * /api/me/sessions*（R15-06）：登录设备列表与退出其他设备——鉴权、只看本人、当前会话保留、Origin 防护；
 * /api/originals/designs：只列本人仍绑定原图的设计。
 */
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestClient, type TestDatabase } from '@/../db/testClient';
import { designs, originalAssets, sessions, users } from '@/../db/schema';
import { setTestDb } from '@/lib/auth/db';
import { createSession } from '@/lib/auth/session';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookies';

let token: string | undefined;
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === SESSION_COOKIE_NAME && token ? { value: token } : undefined), set: () => undefined }),
}));

import { GET as list } from './route';
import { POST as revoke } from './revoke-others/route';
import { GET as originals } from '../../originals/designs/route';

let db: TestDatabase;
let userId: string;
let otherId: string;
const post = (headers: Record<string, string> = { origin: 'http://localhost', host: 'localhost', 'content-type': 'application/json' }) =>
  revoke(new Request('http://localhost/api/me/sessions/revoke-others', { method: 'POST', headers, body: '{}' }));

beforeEach(async () => {
  db = await createTestClient();
  setTestDb(db);
  token = undefined;
  const [user] = await db.insert(users).values({ email: 'devices@example.test', emailVerifiedAt: new Date() }).returning();
  const [other] = await db.insert(users).values({ email: 'devices-other@example.test', emailVerifiedAt: new Date() }).returning();
  userId = user.id;
  otherId = other.id;
});

describe('登录设备', () => {
  it('未登录 401', async () => {
    expect((await list()).status).toBe(401);
    expect((await post()).status).toBe(401);
  });

  it('列出本人会话（当前在前），退出其他设备只留当前会话，不影响别人', async () => {
    await createSession(db, userId, new Date(Date.now() - 86_400_000));
    await createSession(db, userId, new Date(Date.now() - 3_600_000));
    await createSession(db, otherId);
    token = (await createSession(db, userId)).token;
    const listed = await (await list()).json();
    expect(listed.count).toBe(3);
    expect(listed.items[0].current).toBe(true);
    expect(listed.items.filter((item: { current: boolean }) => item.current)).toHaveLength(1);

    expect((await post({ host: 'localhost', 'content-type': 'application/json', origin: 'http://evil.test' })).status).toBe(403);
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revoked: 2 });
    expect(await db.select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(1);
    expect(await db.select().from(sessions).where(eq(sessions.userId, otherId))).toHaveLength(1);
    expect((await (await list()).json()).count).toBe(1);
  });
});

describe('管理原图列表', () => {
  it('只列本人仍绑定、未删除原图的设计', async () => {
    token = (await createSession(db, userId)).token;
    const [asset] = await db.insert(originalAssets).values({ userId, sha256: 'a'.repeat(64), cosKey: 'k1', mimeType: 'image/png', byteSize: 2048, width: 64, height: 48 }).returning();
    const [released] = await db.insert(originalAssets).values({ userId, sha256: 'b'.repeat(64), cosKey: 'k2', mimeType: 'image/png', byteSize: 1024, deletedAt: new Date() }).returning();
    const project = (assetId?: string) => ({ original: assetId ? { assetId, sha256: 'x' } : undefined, pattern: { width: 1, height: 1, cells: [] } });
    await db.insert(designs).values([
      { id: '00000000-0000-4000-8000-000000000001', userId, name: '有原图', project: project(asset.id), revision: 3 },
      { id: '00000000-0000-4000-8000-000000000002', userId, name: '原图已删', project: project(released.id) },
      { id: '00000000-0000-4000-8000-000000000003', userId, name: '没有原图', project: project() },
      { id: '00000000-0000-4000-8000-000000000004', userId: otherId, name: '别人的', project: project(asset.id) },
    ]);
    const body = await (await originals()).json();
    expect(body.items).toEqual([{ designId: '00000000-0000-4000-8000-000000000001', name: '有原图', revision: 3, byteSize: 2048, width: 64, height: 48 }]);
    token = undefined;
    expect((await originals()).status).toBe(401);
  });
});
