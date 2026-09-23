import { beforeEach, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestClient, type TestDatabase } from '@/../db/testClient';
import { communityRevisions, communityTags, communityWorks, communityWorkTags, users } from '@/../db/schema';
import { setTestDb } from '@/lib/auth/db';
import { createSession } from '@/lib/auth/session';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookies';
import { DEFAULT_GENERATION_PARAMS } from '@/lib/types';
import { COMMUNITY_LICENSE_VERSION, deriveCommunityPreview } from '@/lib/community/snapshot';
import { GET } from './route';

let token: string | undefined;
let db: TestDatabase;
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => name === SESSION_COOKIE_NAME && token ? { value: token } : undefined }) }));
const pattern = { width: 1, height: 1, cells: [{ hex: '#FAF4C8', code: 'A01', transparent: false }] };
const snapshot = { version: 1, engineVersion: 'test', boardProfile: '5mm-29', paletteSelection: { palette: { kind: 'builtin', brand: 'MARD' }, kitTier: 0 }, params: { ...DEFAULT_GENERATION_PARAMS, backgroundPrototype: null }, pattern };
let tagId: string;
let taggedId: string;
let untaggedId: string;
const list = (query = '') => GET(new Request(`http://localhost/api/admin/community/tags/${tagId}/works${query}`), { params: Promise.resolve({ id: tagId }) });

beforeEach(async () => {
  db = await createTestClient(); setTestDb(db); token = undefined;
  const [moderator, author] = await db.insert(users).values([
    { email: 'picker-moderator@example.test', role: 'moderator', emailVerifiedAt: new Date() },
    { email: 'picker-author@example.test', role: 'user', emailVerifiedAt: new Date() },
  ]).returning();
  const [tag] = await db.insert(communityTags).values({ name: '星星人', slug: 'stars' }).returning(); tagId = tag.id;
  const [tagged, untagged] = await db.insert(communityWorks).values([{ authorUserId: author.id }, { authorUserId: author.id }]).returning();
  taggedId = tagged.id; untaggedId = untagged.id;
  for (const [workId, title] of [[taggedId, '已打标签的作品'], [untaggedId, '还没打标签的作品']] as const) {
    await db.insert(communityRevisions).values({
      workId, revisionNumber: 1, status: 'draft', title, authorType: 'user', publicAuthorId: crypto.randomUUID(),
      frozenDisplayName: '豆友', licenseVersion: COMMUNITY_LICENSE_VERSION, licenseConfirmedAt: new Date(), engineVersion: 'test',
      boardProfile: '5mm-29', paletteKind: 'builtin', paletteId: 'MARD', width: 1, height: 1, colorCount: 1, snapshot, preview: deriveCommunityPreview(pattern),
    });
  }
  await db.insert(communityWorkTags).values({ workId: taggedId, tagId });
  token = (await createSession(db, moderator.id)).token;
});

it('默认只给还没打这个标签的作品，并可用 tagState 取相反集合', async () => {
  const missing = await (await list()).json() as { items: Array<{ id: string }>; total: number };
  expect(missing.items.map((item) => item.id)).toEqual([untaggedId]); expect(missing.total).toBe(1);
  const has = await (await list('?tagState=has')).json() as { items: Array<{ id: string }> };
  expect(has.items.map((item) => item.id)).toEqual([taggedId]);
  const all = await (await list('?tagState=all')).json() as { items: Array<{ id: string }>; total: number };
  expect(all.total).toBe(2);
  // 列表 DTO 必须带缩略图材料，后台才画得出来；且不能泄露内部作者身份。
  const first = (missing.items[0] ?? {}) as { thumbnail?: unknown };
  expect(JSON.stringify(missing)).not.toContain('authorUserId');
  expect(first).toHaveProperty('thumbnail');
});

it('搜索与分页沿用作品管理口径，非法参数与权限同样受控', async () => {
  expect((await list('?q=还没打标签')).json()).toBeTruthy();
  const searched = await (await list('?q=还没打标签')).json() as { total: number };
  expect(searched.total).toBe(1);
  expect((await list('?size=7')).status).toBe(400);
  const [anonWorks] = await db.select({ id: communityWorks.id }).from(communityWorks).where(eq(communityWorks.id, untaggedId));
  expect(anonWorks.id).toBe(untaggedId);
  token = undefined;
  expect((await list()).status).toBe(401);
});
