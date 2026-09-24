import { describe, expect, it } from 'vitest';
import { createTestClient } from './testClient';
import { adminAuditLogs } from './schema';
import { seedAuthor, seedWork } from './testCommunity';
import { listAdminAudit, listGovernedUsers } from '@/lib/admin/queries';
import { createSession } from '@/lib/auth/session';
import { listManagedCommunityWorks } from '@/lib/community/adminQueries';

describe('后台表头整表排序', () => {
  it('作品按点赞、账号按作品数排序跨页生效；未知列键被拒绝', async () => {
    const db = await createTestClient();
    const busy = await seedAuthor(db, { email: 'busy@example.com', username: '多产作者', createdAt: new Date('2026-01-01T00:00:00Z') });
    const quiet = await seedAuthor(db, { email: 'quiet@example.com', username: '新人', createdAt: new Date('2026-09-01T00:00:00Z') });
    await seedWork(db, { author: busy, title: '少赞', likes: 1 });
    await seedWork(db, { author: busy, title: '多赞', likes: 99 });
    await seedWork(db, { author: quiet, title: '中赞', likes: 50 });
    const byLikes = await listManagedCommunityWorks(db, { sort: 'likes', size: 10 });
    expect(byLikes.items.map((item) => item.title)).toEqual(['多赞', '中赞', '少赞']);
    const firstPageAsc = await listManagedCommunityWorks(db, { sort: 'likes', order: 'asc', size: 10 });
    expect(firstPageAsc.items[0].title).toBe('少赞');
    await createSession(db, busy.id);
    const users = await listGovernedUsers(db, { sort: 'works' });
    expect(users.items.map((item) => item.username)).toEqual(['多产作者', '新人']);
    expect(users.items[0].stats).toMatchObject({ works: 2, likes: 100, comments: 0 });
    expect(users.items[0].stats.lastActiveAt).not.toBeNull();
    expect(users.items[1].stats.lastActiveAt).toBeNull();
    const joinedAsc = await listGovernedUsers(db, { sort: 'joined', order: 'asc' });
    expect(joinedAsc.items.map((item) => item.username)).toEqual(['多产作者', '新人']);
    await expect(listManagedCommunityWorks(db, { sort: 'title' })).rejects.toBeTruthy();
  });

  it('审计时间列可正序查看最早的记录', async () => {
    const db = await createTestClient();
    await db.insert(adminAuditLogs).values([
      { actorRole: 'admin', action: 'a.first', targetType: 'user', targetId: 'x', reason: '最早', requestId: 'r1', createdAt: new Date('2026-09-01T00:00:00Z') },
      { actorRole: 'admin', action: 'a.last', targetType: 'user', targetId: 'y', reason: '最新', requestId: 'r2', createdAt: new Date('2026-09-02T00:00:00Z') },
    ]);
    expect((await listAdminAudit(db, {})).items[0].requestId).toBe('r2');
    expect((await listAdminAudit(db, { sort: 'time', order: 'asc' })).items[0].requestId).toBe('r1');
  });
});
