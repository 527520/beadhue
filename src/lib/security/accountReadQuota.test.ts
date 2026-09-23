/**
 * 按账号读配额（admin-round-3 12）：档位判定、不同作品数窗口、两道闸门的 429 语义。
 * 这里用默认阈值（新账号 120 次 / 60 件，已建立账号 1200 次 / 300 件）。
 */
import { describe, expect, it } from 'vitest';
import { createTestClient } from '@/../db/testClient';
import { config } from '@/lib/config';
import {
  accountReadKey,
  accountReadTier,
  accountReadTierLimits,
  enforceAccountReadQuota,
  recordDistinctWorks,
  resetAccountWorkWindow,
} from './accountReadQuota';

const now = new Date('2026-09-11T08:00:00.000Z');

describe('档位判定', () => {
  it('注册未满 24 小时是新账号档；满 24 小时或时间未知按已建立账号档', () => {
    expect(accountReadTier(new Date(now.getTime() - 60 * 60 * 1000), now)).toBe('new');
    expect(accountReadTier(new Date(now.getTime() - 25 * 60 * 60 * 1000), now)).toBe('established');
    expect(accountReadTier(null, now)).toBe('established');
    expect(accountReadTier(undefined, now)).toBe('established');
  });

  it('两档阈值来自配置，且新账号档更紧', () => {
    const fresh = accountReadTierLimits('new');
    const veteran = accountReadTierLimits('established');
    expect(fresh.requests).toBe(config.security.newAccountReadRateLimit);
    expect(fresh.distinctWorks).toBe(config.security.newAccountReadDistinctWorks);
    expect(veteran.requests).toBe(config.security.accountReadRateLimit);
    expect(veteran.distinctWorks).toBe(config.security.accountReadDistinctWorks);
    expect(fresh.requests).toBeLessThan(veteran.requests);
    expect(fresh.distinctWorks).toBeLessThan(veteran.distinctWorks);
    expect(accountReadKey('user-1')).toBe('account:read:user-1');
  });
});

describe('每小时不同作品数窗口', () => {
  it('同一作品重复访问不计数，超上限返回 false，跨小时窗口与跨账号互不影响', () => {
    resetAccountWorkWindow();
    expect(recordDistinctWorks('u1', ['a'], now, 2)).toBe(true);
    expect(recordDistinctWorks('u1', ['a', 'a'], now, 2)).toBe(true);
    expect(recordDistinctWorks('u1', ['b'], now, 2)).toBe(true);
    expect(recordDistinctWorks('u1', ['c'], now, 2)).toBe(false);
    // 超出上限被拒的作品不入账：重复请求仍被拒
    expect(recordDistinctWorks('u1', ['c'], now, 2)).toBe(false);
    // 下一个小时窗口清零
    expect(recordDistinctWorks('u1', ['c'], new Date(now.getTime() + 60 * 60 * 1000), 2)).toBe(true);
    // 另一个账号有自己的窗口
    expect(recordDistinctWorks('u2', ['c'], now, 2)).toBe(true);
  });
});

describe('enforceAccountReadQuota', () => {
  it('新账号超过每小时总量抛 RATE_LIMITED，已建立账号同小时仍通畅', async () => {
    const db = await createTestClient();
    resetAccountWorkWindow();
    const fresh = new Date(Date.now() - 60 * 1000);
    const veteran = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const limit = config.security.newAccountReadRateLimit;
    for (let i = 0; i < limit; i += 1) {
      await enforceAccountReadQuota(db, { userId: 'fresh-user', accountCreatedAt: fresh });
    }
    await expect(enforceAccountReadQuota(db, { userId: 'fresh-user', accountCreatedAt: fresh }))
      .rejects.toMatchObject({ code: 'RATE_LIMITED' });
    await enforceAccountReadQuota(db, { userId: 'veteran-user', accountCreatedAt: veteran });
  });

  it('新账号每小时不同作品数超限抛 RATE_LIMITED，重复看同一件作品不占额度', async () => {
    const db = await createTestClient();
    resetAccountWorkWindow();
    const fresh = new Date(Date.now() - 60 * 1000);
    const cap = config.security.newAccountReadDistinctWorks;
    for (let i = 0; i < cap; i += 1) {
      await enforceAccountReadQuota(db, { userId: 'fresh-user', accountCreatedAt: fresh, workIds: [`work-${i}`] });
    }
    // 已看过的作品再看不占新额度
    await enforceAccountReadQuota(db, { userId: 'fresh-user', accountCreatedAt: fresh, workIds: ['work-0'] });
    await expect(enforceAccountReadQuota(db, { userId: 'fresh-user', accountCreatedAt: fresh, workIds: ['work-new'] }))
      .rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });
});
