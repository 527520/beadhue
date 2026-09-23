/**
 * 发信成本防护测试（PGlite 真实限流语义）：
 * 每邮箱每日 / 每 IP 每小时 / 全局每日三层，验证优先级与窗口隔离；
 * 全局桶按账号档位一分为二（admin-round-3 12），互相不挤占。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestClient, type TestDatabase } from '@/../db/testClient';
import { users } from '@/../db/schema';
import { checkMailSendLimits, mailBudgetBucket, reserveMailSendLimits } from './mailLimits';

let db: TestDatabase;
const now = new Date('2026-08-15T08:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  db = await createTestClient();
  // 成本防护仅在配置真实发信渠道时生效（测试需显式开启）
  process.env.SES_SECRET_ID = 'test-id';
});

afterAll(async () => {
  // PGlite 内存库无需显式关闭；清 env 防串扰
  delete process.env.SES_SECRET_ID;
  delete process.env.MAIL_DAILY_SEND_LIMIT;
});

describe('checkMailSendLimits', () => {
  it('释放失败发送的预占后，不消耗实际发送配额', async () => {
    const freshDb = await createTestClient();
    const first = await reserveMailSendLimits(freshDb, {
      email: 'failed@example.com', ip: '8.8.8.8', emailLimit: 1, now,
    });
    expect(first.result).toBe('ok');
    await first.release();
    const retry = await reserveMailSendLimits(freshDb, {
      email: 'failed@example.com', ip: '8.8.8.8', emailLimit: 1, now,
    });
    expect(retry.result).toBe('ok');
  });

  it('每邮箱每日：同邮箱不同 IP 换着来，超过上限后返回 emailLimited', async () => {
    const email = 'victim@example.com';
    for (let i = 0; i < 5; i++) {
      const result = await checkMailSendLimits(db, { email, ip: `1.1.1.${i}`, now });
      expect(result).toBe('ok');
    }
    const sixth = await checkMailSendLimits(db, { email, ip: '9.9.9.9', now });
    expect(sixth).toBe('emailLimited');
  });

  it('每 IP 每小时：同 IP 换邮箱，超过 20 后返回 ipLimited', async () => {
    const ip = '10.0.0.99';
    for (let i = 0; i < 20; i++) {
      const result = await checkMailSendLimits(db, { email: `user${i}@example.com`, ip, now });
      expect(result).toBe('ok');
    }
    const extra = await checkMailSendLimits(db, { email: 'user99@example.com', ip, now });
    expect(extra).toBe('ipLimited');
  });

  it('全局每日：MAIL_DAILY_SEND_LIMIT=3 时第 4 封（全新邮箱+IP）返回 globalLimited', async () => {
    // 独立库实例：全局计数不受本文件其他用例累积影响
    const freshDb = await createTestClient();
    process.env.MAIL_DAILY_SEND_LIMIT = '3';
    for (let i = 0; i < 3; i++) {
      const result = await checkMailSendLimits(freshDb, {
        email: `g${i}@example.com`,
        ip: `2.2.2.${i}`,
        now: new Date(now.getTime() + i * 1000),
      });
      expect(result).toBe('ok');
    }
    const fourth = await checkMailSendLimits(freshDb, { email: 'g9@example.com', ip: '2.2.2.9', now });
    expect(fourth).toBe('globalLimited');
    delete process.env.MAIL_DAILY_SEND_LIMIT;
  });

  it('窗口隔离：下一个窗口（明天）计数归零', async () => {
    const email = 'tomorrow@example.com';
    for (let i = 0; i < 6; i++) {
      await checkMailSendLimits(db, { email, ip: `3.3.3.${i}`, now });
    }
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const result = await checkMailSendLimits(db, { email, ip: '3.3.3.9', now: tomorrow });
    expect(result).toBe('ok');
  });
});

describe('邮件预算分桶（新账号 / 已建立账号）', () => {
  it('桶判定：已验证且注册满 7 天才算已建立账号，其余（含不存在的邮箱）算新账号', () => {
    const established = new Date(now.getTime() - 30 * DAY_MS);
    const tooFresh = new Date(now.getTime() - 3 * DAY_MS);
    expect(mailBudgetBucket({ emailVerifiedAt: now, createdAt: established }, now)).toBe('established');
    expect(mailBudgetBucket({ emailVerifiedAt: now, createdAt: tooFresh }, now)).toBe('new');
    expect(mailBudgetBucket({ emailVerifiedAt: null, createdAt: established }, now)).toBe('new');
    expect(mailBudgetBucket(null, now)).toBe('new');
  });

  it('烧掉新账号桶不影响已建立账号的找回密码', async () => {
    const freshDb = await createTestClient();
    process.env.MAIL_DAILY_SEND_LIMIT = '2';
    process.env.MAIL_ESTABLISHED_DAILY_LIMIT = '5';
    try {
      // 攻击者拿一堆不存在（或全新）的邮箱把「新账号」桶烧穿
      expect(await checkMailSendLimits(freshDb, { email: 'ghost-1@example.com', ip: '9.9.9.1', now })).toBe('ok');
      expect(await checkMailSendLimits(freshDb, { email: 'ghost-2@example.com', ip: '9.9.9.2', now })).toBe('ok');
      expect(await checkMailSendLimits(freshDb, { email: 'ghost-3@example.com', ip: '9.9.9.3', now })).toBe('globalLimited');

      // 已建立账号（已验证 + 注册满 30 天）走另一个桶：发信照常
      const veteran = new Date(now.getTime() - 30 * DAY_MS);
      await freshDb.insert(users).values({ email: 'veteran@example.com', emailVerifiedAt: now, createdAt: veteran });
      expect(await checkMailSendLimits(freshDb, { email: 'veteran@example.com', ip: '9.9.9.4', now })).toBe('ok');

      // 未验证账号仍算新账号：跟着被烧掉的桶一起受限
      await freshDb.insert(users).values({ email: 'unverified@example.com', emailVerifiedAt: null, createdAt: veteran });
      expect(await checkMailSendLimits(freshDb, { email: 'unverified@example.com', ip: '9.9.9.5', now })).toBe('globalLimited');
    } finally {
      delete process.env.MAIL_DAILY_SEND_LIMIT;
      delete process.env.MAIL_ESTABLISHED_DAILY_LIMIT;
    }
  });
});
