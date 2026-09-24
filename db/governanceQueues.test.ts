import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestClient } from './testClient';
import { communityComments, communityReports, communityRevisions, users } from './schema';
import { seedAuthor, seedWork } from './testCommunity';
import { listGovernanceComments, listGovernanceReports } from '@/lib/community/interactions';
import { inspectCommunityRevision } from '@/lib/community/queries';

async function setup() {
  const db = await createTestClient();
  const author = await seedAuthor(db, { email: 'author@example.com', username: '橙子手作' });
  const reporter = await seedAuthor(db, { email: 'reporter@example.com', username: '星星收集者' });
  await db.update(users).set({ avatarColor: '#47A35B' }).where(eq(users.id, author.id));
  const { workId, revisionId } = await seedWork(db, { author, title: '草莓小甜心' });
  const other = await seedWork(db, { author, title: '呱呱青蛙' });
  const [comment] = await db.insert(communityComments).values([
    { workId, authorUserId: author.id, publicAuthorId: author.publicAuthorId!, frozenDisplayName: '橙子手作', status: 'pending_review', body: '加我 V 领取全套图纸，另有代拼服务' },
    { workId: other.workId, authorUserId: reporter.id, publicAuthorId: reporter.publicAuthorId!, frozenDisplayName: '星星收集者', status: 'pending_review', body: '配色有点怪' },
  ]).returning();
  await db.insert(communityReports).values([
    { targetType: 'work', targetId: workId, targetVersion: 1, category: 'copyright', reporterUserId: reporter.id, details: '疑似搬运' },
    { targetType: 'comment', targetId: comment.id, targetVersion: 1, category: 'spam', reporterUserId: reporter.id },
  ]);
  return { db, author, reporter, workId, revisionId };
}

describe('审核台的上次驳回', () => {
  it('重投的修订带上一次被驳回的理由；首次提交没有', async () => {
    const db = await createTestClient();
    const author = await seedAuthor(db, { email: 'author@example.com', username: '橙子手作' });
    const { workId, revisionId } = await seedWork(db, { author, title: '戴花小黄鸡', status: 'pending_review' });
    expect((await inspectCommunityRevision(db, revisionId)).lastRejection).toBeNull();
    await db.update(communityRevisions).set({ status: 'rejected', reviewReason: '图纸与原图主体不一致' }).where(eq(communityRevisions.id, revisionId));
    const [original] = await db.select().from(communityRevisions).where(eq(communityRevisions.id, revisionId));
    const [second] = await db.insert(communityRevisions).values({ ...original, id: crypto.randomUUID(), workId, revisionNumber: 2, status: 'pending_review', reviewReason: null }).returning();
    expect((await inspectCommunityRevision(db, second.id)).lastRejection).toEqual({ revisionNumber: 1, reason: '图纸与原图主体不一致' });
  });
});

describe('治理队列的可读名称与搜索', () => {
  it('评论带作者（头像色）与所在作品（缩略图用的版本）；按内容、作者或作品标题搜索', async () => {
    const { db, author, revisionId } = await setup();
    const { items } = await listGovernanceComments(db);
    const ad = items.find((item) => item.body.startsWith('加我'))!;
    expect(ad).toMatchObject({ author: { id: author.publicAuthorId, name: '橙子手作', color: '#47A35B' }, workTitle: '草莓小甜心', workRevisionId: revisionId });
    expect(JSON.stringify(items)).not.toContain(author.id);
    expect((await listGovernanceComments(db, { q: '代拼' })).total).toBe(1);
    expect((await listGovernanceComments(db, { q: '星星' })).total).toBe(1);
    expect((await listGovernanceComments(db, { q: '青蛙' })).total).toBe(1);
    expect((await listGovernanceComments(db, { q: '100%' })).total).toBe(0);
  });

  it('举报带对象名（作品标题 / 评论开头）与举报人；按对象、原因、举报人或说明搜索', async () => {
    const { db, reporter, revisionId } = await setup();
    const { items } = await listGovernanceReports(db);
    expect(items.find((item) => item.targetType === 'work')).toMatchObject({
      target: { title: '草莓小甜心', revisionId }, reporter: { id: reporter.publicAuthorId, name: '星星收集者' },
    });
    expect(items.find((item) => item.targetType === 'comment')).toMatchObject({ target: { excerpt: '加我 V 领取全套图纸，另有代拼服务', authorName: '橙子手作', workTitle: '草莓小甜心' } });
    expect(JSON.stringify(items)).not.toContain(reporter.id);
    expect((await listGovernanceReports(db, { q: '草莓' })).total).toBe(1);
    expect((await listGovernanceReports(db, { q: '领取' })).total).toBe(1);
    expect((await listGovernanceReports(db, { q: '星星收集' })).total).toBe(2);
    expect((await listGovernanceReports(db, { q: '搬运' })).total).toBe(1);
    expect((await listGovernanceReports(db, { q: items[0].id.slice(0, 8) })).total).toBe(1);
  });
});
