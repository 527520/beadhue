import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestClient, type TestDatabase } from './testClient';
import { users } from './schema';
import { getMyProfile, profileDisplayName } from '@/lib/me/profile';

describe('getMyProfile / profileDisplayName', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestClient();
  });

  it('返回本人资料字段，与顶栏同一口径的展示名', async () => {
    const publicAuthorId = randomUUID();
    const changedAt = new Date('2026-09-01T08:00:00.000Z');
    const [user] = await db.insert(users).values({
      email: 'me@example.com', username: '豆豆', passwordHash: 'hash', emailVerifiedAt: new Date(),
      avatarColor: '#3160E6', passwordChangedAt: changedAt, publicAuthorId,
    }).returning();

    const profile = await getMyProfile(db, user.id);
    expect(profile).toMatchObject({
      email: 'me@example.com', username: '豆豆', publicAuthorId, avatarColor: '#3160E6', passwordChangedAt: changedAt,
    });
    expect(profileDisplayName(profile!)).toBe('豆豆');
    expect(profileDisplayName({ email: 'me@example.com', username: '  ' })).toBe('me');
    expect(profileDisplayName({ email: 'no-at-sign', username: null })).toBe('no-at-sign');
  });

  it('匿名化账号（无邮箱）不再有「我的」资料', async () => {
    const [user] = await db.insert(users).values({ passwordHash: null, accountStatus: 'anonymized', anonymizedAt: new Date() }).returning();

    await expect(getMyProfile(db, user.id)).resolves.toBeNull();
  });

  it('不存在的用户返回 null', async () => {
    await expect(getMyProfile(db, randomUUID())).resolves.toBeNull();
  });
});
