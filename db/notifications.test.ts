/**
 * 站内通知（D70）的写入时机：审核通过 / 驳回、下架 / 恢复、评论进入公开态（直接通过或复核后公开）；
 * 官方作品、作者自评与已注销账号不通知；主操作失败不留通知；90 天清理；注销删除本人通知。
 */
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestClient, type TestDatabase } from './testClient';
import { notifications, users } from './schema';
import { seedAuthor, seedWork } from './testCommunity';
import { actorFor, createTestUser, publishWorkFixture } from '@/app/api/community/communityRouteFixture';
import { reviewCommunityRevision, submitCommunityRevision } from '@/lib/community/service';
import { moderateCommunityWork } from '@/lib/community/adminService';
import { createCommunityComment, moderateCommunityComment, setCommentModerationDeps } from '@/lib/community/interactions';
import { E2E_MODERATION_DEPS } from '@/lib/moderation/e2eFake';
import { anonymizeAccount } from '@/lib/auth/accountLifecycle';
import { cleanupExpiredNotifications, createNotification, listNotifications } from '@/lib/notifications/service';

let db: TestDatabase;
const inbox = async (userId: string) => db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(notifications.createdAt);

beforeEach(async () => {
  db = await createTestClient();
  setCommentModerationDeps(E2E_MODERATION_DEPS);
});

describe('审核决定', () => {
  it('通过时通知作者，payload 带作品、修订与冻结标题', async () => {
    const fixture = await publishWorkFixture(db, { title: '橘猫团子', email: 'n-approve@example.test' });
    expect(await inbox(fixture.userId)).toMatchObject([{
      type: 'revision_approved', readAt: null,
      payload: { workId: fixture.workId, revisionId: fixture.revisionId, title: '橘猫团子' },
    }]);
  });

  it('驳回时通知作者并附理由；版本冲突导致审核失败时不留通知', async () => {
    const fixture = await publishWorkFixture(db, { title: '像素奶茶', email: 'n-reject@example.test', mode: 'draft' });
    const pending = await submitCommunityRevision(db, { actor: fixture.actor, revisionId: fixture.revisionId, expectedVersion: 1 });
    const moderator = actorFor(await createTestUser(db, { email: 'n-mod@example.test', role: 'moderator' }));
    await expect(reviewCommunityRevision(db, { actor: moderator, revisionId: pending.id, expectedVersion: 99, decision: 'rejected', reason: '标题含联系方式', requestId: 'r0' }))
      .rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    expect(await inbox(fixture.userId)).toHaveLength(0);
    await reviewCommunityRevision(db, { actor: moderator, revisionId: pending.id, expectedVersion: pending.version, decision: 'rejected', reason: '标题含联系方式', requestId: 'r1' });
    expect(await inbox(fixture.userId)).toMatchObject([{ type: 'revision_rejected', payload: { workId: fixture.workId, title: '像素奶茶', reason: '标题含联系方式' } }]);
  });
});

describe('下架与恢复', () => {
  it('个人作品下架 / 恢复各通知一次，不带下架理由；官方作品不通知', async () => {
    const fixture = await publishWorkFixture(db, { title: '星空杯垫', email: 'n-remove@example.test' });
    const moderator = actorFor(await createTestUser(db, { email: 'n-remover@example.test', role: 'moderator' }));
    const removed = await moderateCommunityWork(db, { actor: moderator, workId: fixture.workId, action: 'remove', expectedVersion: 2, reason: '内部备注：举报核实', requestId: 'm1' });
    await moderateCommunityWork(db, { actor: moderator, workId: fixture.workId, action: 'restore', expectedVersion: removed.version, reason: '复核后恢复', requestId: 'm2' });
    const items = await inbox(fixture.userId);
    expect(items.map((item) => item.type)).toEqual(['revision_approved', 'work_removed', 'work_restored']);
    expect(items[1].payload).toEqual({ workId: fixture.workId, title: '星空杯垫' });
    expect(JSON.stringify(items)).not.toContain('内部备注');

    const admin = await seedAuthor(db, { email: 'n-official@example.test' });
    const official = await seedWork(db, { author: admin, official: true, title: '官方示范' });
    await moderateCommunityWork(db, { actor: moderator, workId: official.workId, action: 'remove', expectedVersion: 1, reason: '官方下架测试', requestId: 'm3' });
    expect(await inbox(admin.id)).toHaveLength(0);
  });
});

describe('公开评论', () => {
  it('他人评论直接公开时通知作者（只带评论编号），作者自评不通知', async () => {
    const fixture = await publishWorkFixture(db, { title: '草莓', email: 'n-comment@example.test' });
    const commenter = await createTestUser(db, { email: 'n-commenter@example.test', role: 'user' });
    const comment = await createCommunityComment(db, { actor: actorFor(commenter), workId: fixture.workId, body: '好可爱，想做一个！' });
    await createCommunityComment(db, { actor: fixture.actor, workId: fixture.workId, body: '谢谢喜欢' });
    const items = (await inbox(fixture.userId)).filter((item) => item.type === 'work_commented');
    expect(items).toMatchObject([{ payload: { workId: fixture.workId, title: '草莓', commentId: comment.id } }]);
    expect(JSON.stringify(items)).not.toContain('想做一个');
  });

  it('待审评论不通知，人工复核公开时才通知一次', async () => {
    const fixture = await publishWorkFixture(db, { title: '西瓜', email: 'n-pending@example.test' });
    const commenter = await createTestUser(db, { email: 'n-pending-c@example.test', role: 'user' });
    const pending = await createCommunityComment(db, { actor: actorFor(commenter), workId: fixture.workId, body: '这里有 E2E风险词' });
    expect(pending.status).toBe('pending_review');
    expect((await inbox(fixture.userId)).filter((item) => item.type === 'work_commented')).toHaveLength(0);
    const moderator = actorFor(await createTestUser(db, { email: 'n-pending-m@example.test', role: 'moderator' }));
    await moderateCommunityComment(db, { actor: moderator, commentId: pending.id, decision: 'published', expectedVersion: pending.version, reason: '复核通过', requestId: 'c1' });
    expect((await inbox(fixture.userId)).filter((item) => item.type === 'work_commented')).toMatchObject([{ payload: { commentId: pending.id } }]);
  });
});

describe('收件人与保留期', () => {
  it('已注销账号不再收通知，注销时删除本人全部通知', async () => {
    const fixture = await publishWorkFixture(db, { title: '熊猫', email: 'n-anon@example.test' });
    const other = await createTestUser(db, { email: 'n-anon-admin@example.test' });
    expect(await inbox(fixture.userId)).toHaveLength(1);
    await anonymizeAccount(db, { userId: fixture.userId, requestId: 'erase' });
    expect(await inbox(fixture.userId)).toHaveLength(0);
    expect(await createNotification(db, { userId: fixture.userId, type: 'work_restored', payload: { workId: fixture.workId, title: '熊猫' } })).toBe(false);
    expect(await createNotification(db, { userId: other.id, type: 'work_restored', payload: { workId: fixture.workId, title: '熊猫' } })).toBe(true);
    expect((await db.select().from(users).where(eq(users.id, fixture.userId)))[0].accountStatus).toBe('anonymized');
  });

  it('清理删除超过 90 天的通知，列表按时间倒序分页并给未读数', async () => {
    const user = await createTestUser(db, { email: 'n-retention@example.test', role: 'user' });
    const now = new Date('2026-09-23T00:00:00Z');
    const payload = { workId: crypto.randomUUID(), title: 't' };
    await createNotification(db, { userId: user.id, type: 'work_removed', payload, now: new Date(now.getTime() - 91 * 86_400_000) });
    for (let index = 0; index < 3; index += 1) await createNotification(db, { userId: user.id, type: 'work_restored', payload, now: new Date(now.getTime() - index * 1000) });
    expect(await cleanupExpiredNotifications(db, now)).toBe(1);
    const first = await listNotifications(db, user.id, { limit: 2 });
    expect(first).toMatchObject({ unreadCount: 3, nextCursor: expect.any(String) });
    expect(first.items.map((item) => item.createdAt)).toEqual([now.toISOString(), new Date(now.getTime() - 1000).toISOString()]);
    const second = await listNotifications(db, user.id, { limit: 2, cursor: first.nextCursor });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
  });
});
