import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestClient } from './testClient';
import { adminAuditLogs, communityTags, maintenanceRuns, users } from './schema';
import { getSystemInfo, listAdminAudit, listGovernedUsers } from '@/lib/admin/queries';

describe('admin query privacy and system evidence', () => {
  it('uses only successful execution evidence matching the current migration identity', async () => {
    const db = await createTestClient();
    const result = await db.execute(sql`select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 1`);
    const row = result.rows[0] as { id: number; hash: string; created_at: string };
    const completedAt = new Date('2026-09-05T05:00:00Z');
    await db.insert(maintenanceRuns).values([
      { task: 'database.migrate', status: 'succeeded', cursor: String(row.id), summary: { journalTimestamp: String(row.created_at), hash: 'wrong-hash' }, startedAt: completedAt, completedAt },
      { task: 'database.migrate', status: 'failed', cursor: String(row.id), summary: { journalTimestamp: String(row.created_at), hash: row.hash }, startedAt: completedAt, completedAt },
    ]);
    expect((await getSystemInfo(db)).databaseMigration.appliedAt).toBeNull();
    await db.insert(maintenanceRuns).values({ task: 'database.migrate', status: 'succeeded', cursor: String(row.id), summary: { journalTimestamp: String(row.created_at), hash: row.hash }, startedAt: new Date('2026-09-05T04:59:59Z'), completedAt });
    expect((await getSystemInfo(db)).databaseMigration.appliedAt).toBe(completedAt.toISOString());
  });

  it('masks account email and reports unavailable backup truthfully', async () => {
    const db = await createTestClient();
    await db.insert(users).values({ email: 'private@example.com', passwordHash: 'secret', emailVerifiedAt: new Date() });
    const { items: userRows, total } = await listGovernedUsers(db);
    const [user] = userRows;
    expect(user).toMatchObject({ maskedEmail: 'p***e@example.com', emailVerified: true, stats: { works: 0, likes: 0, comments: 0, lastActiveAt: null } });
    expect(total).toBe(1);
    expect(user).not.toHaveProperty('email');
    expect(user).not.toHaveProperty('passwordHash');
    const info = await getSystemInfo(db);
    expect(info.backup).toEqual({ status: 'not_integrated', label: '未接入' });
    expect(info.migrationJournalLatest).toBe('0021_account_profile_and_batch_names');
    expect(info.databaseMigration.id).not.toBeNull();
    expect(info.databaseMigration.tag).toBe(info.migrationJournalLatest);
    expect(info.databaseMigration.appliedAt).toBeNull();
    expect(info.databaseMigration.journalTimestamp).not.toBeNull();
  });

  it('paginates identical audit times without skips, filters and clips historical state', async () => {
    const db = await createTestClient();
    await db.insert(adminAuditLogs).values(Array.from({ length: 55 }, (_, index) => ({
      actorRole: 'admin' as const, action: 'community.approve', targetType: 'community_revision', targetId: `target-${index}`,
      reason: 'verified material', requestId: `request-${index}`, createdAt: new Date('2026-09-01T01:00:00Z'),
      beforeState: { status: 'pending_review', email: 'private@example.com', token: 'secret' }, afterState: { status: 'published' },
    })));
    // 时间完全相同也必须不重不漏：改成页码分页后由 (created_at desc, id desc) 的稳定排序保证。
    const first = await listAdminAudit(db, { size: 50 });
    expect(first.items).toHaveLength(50); expect(first.total).toBe(55); expect(first.totalPages).toBe(2);
    const second = await listAdminAudit(db, { size: 50, page: 2 });
    expect(second.items).toHaveLength(5);
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(55);
    expect(first.items[0].beforeState).toEqual({ status: 'pending_review' });
    expect((await listAdminAudit(db, { q: 'request-54', from: '2026-09-01', to: '2026-09-01' })).items).toHaveLength(1);
    expect((await listAdminAudit(db, { from: '2026-09-02' })).items).toHaveLength(0);
    // 每页条数只接受 10 / 20 / 50 / 100 白名单。
    await expect(listAdminAudit(db, { size: 7 })).rejects.toBeTruthy();
    await expect(listAdminAudit(db, { from: '2026-09-03', to: '2026-09-01' })).rejects.toBeTruthy();
  });

  it('audit rows carry readable actor and target names; filters by action and actor', async () => {
    const db = await createTestClient();
    const [admin, member] = await db.insert(users).values([
      { email: 'admin@example.com', username: '小鹿拼豆', role: 'admin', publicAuthorId: crypto.randomUUID(), avatarColor: '#3F7FD9', emailVerifiedAt: new Date() },
      { email: 'member@example.com', username: '阿布的豆盒', emailVerifiedAt: new Date() },
    ]).returning();
    const [tag] = await db.insert(communityTags).values({ name: '猫咪', slug: 'cat' }).returning();
    await db.insert(adminAuditLogs).values([
      { actorUserId: admin.id, actorRole: 'admin', action: 'user.role_changed', targetType: 'user', targetId: member.id, reason: '协助审核', requestId: 'req-a' },
      { actorUserId: admin.id, actorRole: 'admin', action: 'community.tag_updated', targetType: 'community_tag', targetId: tag.id, reason: '改名', requestId: 'req-b' },
      { actorUserId: null, actorRole: 'moderator', action: 'community.tag_updated', targetType: 'community_tag', targetId: 'not-a-uuid', reason: '历史记录', requestId: 'req-c' },
    ]);
    const { items } = await listAdminAudit(db, {});
    const byRequest = new Map(items.map((item) => [item.requestId, item]));
    expect(byRequest.get('req-a')).toMatchObject({ actor: { id: admin.publicAuthorId, name: '小鹿拼豆', color: '#3F7FD9' }, target: { name: '阿布的豆盒' } });
    expect(byRequest.get('req-b')).toMatchObject({ target: { name: '猫咪' } });
    expect(byRequest.get('req-c')).toMatchObject({ actor: null, target: { name: null } });
    expect((await listAdminAudit(db, { action: 'community.tag_updated' })).total).toBe(2);
    expect((await listAdminAudit(db, { actor: admin.id })).total).toBe(2);
    expect((await listAdminAudit(db, { q: '小鹿' })).total).toBe(2);
    await expect(listAdminAudit(db, { actor: 'nope' })).rejects.toBeTruthy();
  });

  it('retains latest success and failure per task beyond the recent history window', async () => {
    const db = await createTestClient();
    await db.insert(maintenanceRuns).values([
      { task: 'analytics.daily', status: 'failed', startedAt: new Date('2026-08-01'), completedAt: new Date('2026-08-01T01:00:00Z'), errorCode: 'DATABASE_UNAVAILABLE' },
      ...Array.from({ length: 55 }, (_, index) => ({ task: 'analytics.daily', status: 'succeeded' as const, startedAt: new Date(Date.UTC(2026, 7, 2 + index)), completedAt: new Date(Date.UTC(2026, 7, 2 + index, 1)) })),
      { task: 'analytics.daily', status: 'running', startedAt: new Date('2026-10-01') },
    ]);
    const info = await getSystemInfo(db);
    expect(info.maintenance).toHaveLength(50);
    expect(info.maintenanceTasks).toEqual([expect.objectContaining({ task: 'analytics.daily', latest: expect.objectContaining({ status: 'running' }), lastSuccess: expect.objectContaining({ status: 'succeeded' }), lastFailure: expect.objectContaining({ errorCode: 'DATABASE_UNAVAILABLE' }) })]);
  });
});
