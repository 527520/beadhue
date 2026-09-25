import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestClient, type TestDatabase } from './testClient';
import { communityComments, communityReports, communityRevisions, communityWorks, users } from './schema';
import { getAdminOverview } from '@/lib/admin/overview';

function pendingRevision(workId: string, revisionNumber: number) {
  return {
    workId, revisionNumber, status: 'pending_review' as const, title: '待审小猫', authorType: 'user' as const,
    publicAuthorId: 'pa-author', frozenDisplayName: '作者', licenseVersion: 'v1', licenseConfirmedAt: new Date(),
    engineVersion: 'test', boardProfile: '5mm-29', paletteKind: 'builtin', width: 20, height: 10, colorCount: 3,
    snapshot: { version: 3 }, preview: { version: 1 },
  };
}

describe('getAdminOverview', () => {
  let db: TestDatabase;
  let workId: string;
  const NOW = new Date('2026-09-15T00:00:00.000Z');

  beforeEach(async () => {
    db = await createTestClient();
    const [author] = await db.insert(users).values({ email: 'author@example.com', passwordHash: 'hash', emailVerifiedAt: new Date() }).returning();
    const [work] = await db.insert(communityWorks).values({ authorUserId: author.id }).returning();
    workId = work.id;
    await db.insert(communityRevisions).values([
      pendingRevision(workId, 1),
      { ...pendingRevision(workId, 2), status: 'published' },
    ]);
    await db.insert(communityComments).values([
      { workId, publicAuthorId: 'pa-author', frozenDisplayName: '作者', status: 'pending_review', body: '待审评论' },
      { workId, publicAuthorId: 'pa-author', frozenDisplayName: '作者', status: 'rejected', body: '被拦评论', createdAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000) },
      { workId, publicAuthorId: 'pa-author', frozenDisplayName: '作者', status: 'rejected', body: '过期被拦', createdAt: new Date(NOW.getTime() - 31 * 24 * 60 * 60 * 1000) },
      { workId, publicAuthorId: 'pa-author', frozenDisplayName: '作者', status: 'published', body: '公开评论' },
    ]);
    const targetId = randomUUID();
    await db.insert(communityReports).values([
      { targetType: 'work', targetId, targetVersion: 1, category: 'other', status: 'open' },
      { targetType: 'comment', targetId, targetVersion: 2, category: 'spam', status: 'accepted' },
      { targetType: 'comment', targetId, targetVersion: 3, category: 'other', status: 'dismissed' },
    ]);
  });

  it('includeSystem=false 只统计待办，不读系统健康', async () => {
    const overview = await getAdminOverview(db, { includeSystem: false, now: NOW });
    expect(overview).toEqual({ pendingRevisions: 1, pendingComments: 2, openReports: 2, moderationDegraded: null });
  });

  it('includeSystem=true 附带内容安全降级状态（未配置即降级）', async () => {
    const overview = await getAdminOverview(db, { includeSystem: true, now: NOW });
    expect(overview.pendingRevisions).toBe(1);
    expect(overview.pendingComments).toBe(2);
    expect(overview.openReports).toBe(2);
    expect(typeof overview.moderationDegraded).toBe('boolean');
  });
});
