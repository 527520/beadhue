/**
 * R15-02 标签与建议标签（D68）：
 * - 公开标签接口返回 icon / sortOrder / featured；后台可编辑三项并写审计（展示调整免理由，改名仍需理由）；
 * - 投稿接收 suggestedTags（≤5、每个 ≤8 字、规范化去重），审核队列与详情返回；
 * - 「采纳建议标签」把选中的建议加入作品正式标签，写审计，只能采纳建议过的标签。
 */
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestClient, type TestDatabase } from '@/../db/testClient';
import { adminAuditLogs, communityRevisions, communityTags, communityWorkTags, designs, users } from '@/../db/schema';
import { setTestDb } from '@/lib/auth/db';
import { createSession } from '@/lib/auth/session';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookies';
import { COMMUNITY_LICENSE_VERSION } from '@/lib/community/snapshot';
import { DEFAULT_GENERATION_PARAMS } from '@/lib/types';

let token: string | undefined;
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === SESSION_COOKIE_NAME && token ? { value: token } : undefined), set: () => undefined }),
}));

import { POST as adopt } from './route';
import { GET as reviewQueue } from '../../route';
import { GET as inspect } from '../route';
import { POST as createWork } from '@/app/api/community/works/route';
import { GET as publicTags } from '@/app/api/community/tags/route';
import { POST as createTag } from '@/app/api/admin/community/tags/route';
import { PATCH as updateTag } from '@/app/api/admin/community/tags/[id]/route';

let db: TestDatabase;
let authorId: string;
let moderatorId: string;
let designId: string;
const headers = (key: string) => ({ origin: 'http://localhost', host: 'localhost', 'content-type': 'application/json', 'idempotency-key': key });
const post = (url: string, body: unknown, key = crypto.randomUUID()) => new Request(url, { method: 'POST', headers: headers(key), body: JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(async () => {
  db = await createTestClient();
  setTestDb(db);
  const [author] = await db.insert(users).values({ email: 'suggest-author@example.test', username: '小豆', emailVerifiedAt: new Date() }).returning();
  const [moderator] = await db.insert(users).values({ email: 'suggest-mod@example.test', role: 'moderator', emailVerifiedAt: new Date() }).returning();
  authorId = author.id; moderatorId = moderator.id;
  designId = crypto.randomUUID();
  await db.insert(designs).values({ id: designId, userId: authorId, name: '投稿设计', payloadBytes: 1, project: {
    format: 'beadhue-project', version: 3, engineVersion: 'test', boardProfile: '5mm-29', name: '投稿设计',
    createdAt: '2026-09-05T00:00:00Z', updatedAt: '2026-09-05T00:00:00Z', params: DEFAULT_GENERATION_PARAMS,
    paletteSelection: { palette: { kind: 'builtin', brand: 'MARD' }, kitTier: 0 },
    pattern: { width: 1, height: 1, cells: [{ hex: '#FC3D46', code: 'F02', transparent: false }] },
  } });
});

async function submit(suggestedTags?: string[]) {
  token = (await createSession(db, authorId)).token;
  return createWork(post('http://localhost/api/community/works', { designId, expectedDesignRevision: 1, title: '橘猫', licenseVersion: COMMUNITY_LICENSE_VERSION, ...(suggestedTags ? { suggestedTags } : {}) }));
}

describe('投稿的建议标签', () => {
  it('规范化去重后保存，审核队列与审核详情都能看到', async () => {
    const response = await submit([' 猫咪 ', '橘猫', '猫咪', 'Cute']);
    expect(response.status).toBe(201);
    const { revisionId } = await response.json();
    token = (await createSession(db, moderatorId)).token;
    // 审核队列只列待审修订：先看详情，再把修订置为待审验证队列。
    const detail = await (await inspect(new Request(`http://localhost/api/admin/community/revisions/${revisionId}`), params(revisionId))).json();
    expect(detail).toMatchObject({ suggestedTags: ['猫咪', '橘猫', 'Cute'], workTags: [] });
    await db.update(communityRevisions).set({ status: 'pending_review', submittedAt: new Date() }).where(eq(communityRevisions.id, revisionId));
    const queue = await (await reviewQueue(new Request('http://localhost/api/admin/community/revisions'))).json();
    expect(queue.items[0]).toMatchObject({ revisionId, suggestedTags: ['猫咪', '橘猫', 'Cute'] });
  });

  it('超过 5 个或单个超过 8 个字返回 400', async () => {
    for (const tags of [['a', 'b', 'c', 'd', 'e', 'f'], ['一二三四五六七八九']]) {
      const response = await submit(tags);
      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatchObject({ code: 'VALIDATION', field: 'suggestedTags' });
    }
  });
});

describe('POST /api/admin/community/revisions/:id/suggested-tags', () => {
  it('采纳选中的建议：创建缺失标签、加入作品、写审计；重放幂等', async () => {
    const { revisionId, workId } = await (await submit(['猫咪', '橘猫', '可爱'])).json();
    await db.insert(communityTags).values({ name: '猫咪', slug: 'cats' });
    token = (await createSession(db, moderatorId)).token;
    const request = () => adopt(post(`http://localhost/api/admin/community/revisions/${revisionId}/suggested-tags`, { tags: ['猫咪', ' 橘猫 '] }, 'adopt-1'), params(revisionId));
    const response = await request();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ workId, version: 2, adopted: ['猫咪', '橘猫'] });
    expect(body.tags.map((tag: { name: string }) => tag.name).sort()).toEqual(['橘猫', '猫咪']);
    expect(await (await request()).json()).toEqual(body);
    const audits = await db.select().from(adminAuditLogs).where(eq(adminAuditLogs.action, 'community.suggested_tags_adopted'));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ targetType: 'community_work', targetId: workId, reason: '采纳建议标签', afterState: { revision: 2, count: 2 } });
    // 缺省采纳全部：已有的跳过，只新增「可爱」。
    const all = await (await adopt(post(`http://localhost/api/admin/community/revisions/${revisionId}/suggested-tags`, {}), params(revisionId))).json();
    expect(all.adopted).toEqual(['可爱']);
    expect(await db.select().from(communityWorkTags).where(eq(communityWorkTags.workId, workId))).toHaveLength(3);
  });

  it('权限、未建议过的标签、缺幂等键与不存在的修订', async () => {
    const { revisionId } = await (await submit(['猫咪'])).json();
    const url = `http://localhost/api/admin/community/revisions/${revisionId}/suggested-tags`;
    expect((await adopt(post(url, {}), params(revisionId))).status).toBe(403);
    token = undefined;
    expect((await adopt(post(url, {}), params(revisionId))).status).toBe(401);
    token = (await createSession(db, moderatorId)).token;
    const foreign = await adopt(post(url, { tags: ['狗狗'] }), params(revisionId));
    expect(foreign.status).toBe(400);
    expect((await foreign.json()).error.field).toBe('tags');
    const noKey = new Request(url, { method: 'POST', headers: { origin: 'http://localhost', host: 'localhost', 'content-type': 'application/json' }, body: '{}' });
    expect((await adopt(noKey, params(revisionId))).status).toBe(400);
    const missing = crypto.randomUUID();
    expect((await adopt(post(`http://localhost/api/admin/community/revisions/${missing}/suggested-tags`, {}), params(missing))).status).toBe(404);
  });
});

describe('标签的图标、排序与精选', () => {
  it('后台新建 / 编辑三项并写审计，公开接口返回；展示调整免理由，改名仍需理由', async () => {
    token = (await createSession(db, moderatorId)).token;
    const created = await createTag(post('http://localhost/api/admin/community/tags', { name: '星星人', icon: 'star', featured: true, sortOrder: 2, expectedVersion: 0 }));
    expect(created.status).toBe(201);
    const tag = await created.json();
    expect(tag).toMatchObject({ icon: 'star', featured: true, sortOrder: 2 });
    const patch = (body: unknown) => updateTag(new Request(`http://localhost/api/admin/community/tags/${tag.id}`, { method: 'PATCH', headers: headers(crypto.randomUUID()), body: JSON.stringify(body) }), params(tag.id));
    const updated = await patch({ expectedVersion: 1, icon: null, featured: false, sortOrder: 5 });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ icon: null, featured: false, sortOrder: 5, version: 2 });
    const [log] = await db.select().from(adminAuditLogs).where(and(eq(adminAuditLogs.action, 'community.tag_updated'), eq(adminAuditLogs.targetId, tag.id)));
    expect(log).toMatchObject({ reason: '标签管理：调整展示', beforeState: { featured: true, hasIcon: true, sortOrder: 2 }, afterState: { featured: false, hasIcon: false, sortOrder: 5 } });
    expect((await patch({ expectedVersion: 2, name: '星星' })).status).toBe(400);
    expect((await patch({ expectedVersion: 2, icon: 'dragon' })).status).toBe(400);
    expect((await patch({ expectedVersion: 2, icon: 'cat', featured: true })).status).toBe(200);
    const items = (await (await publicTags(new Request('http://localhost/api/community/tags'))).json()).items;
    expect(items).toEqual([{ id: tag.id, name: '星星人', slug: tag.slug, icon: 'cat', sortOrder: 5, featured: true }]);
  });
});
