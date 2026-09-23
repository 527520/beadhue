/**
 * 登录失败按邮箱计数与临时锁定（admin-round-3 12）：
 * 15 分钟窗口内错 10 次 → 锁 15 分钟（密码正确也拒绝），到期自动解锁，成功登录清零。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestClient, type TestDatabase } from '@/../db/testClient';
import { config } from '@/lib/config';
import { clearLoginFailures, loginLockState, recordLoginFailure } from './rateLimit';

const EMAIL = 'brute@example.test';
const now = new Date('2026-09-11T08:00:00.000Z');
const lockMs = config.security.loginLockMinutes * 60 * 1000;

let db: TestDatabase;

beforeEach(async () => {
  db = await createTestClient();
});

/** 连续失败到阈值。 */
async function failUntilThreshold(at: Date = now): Promise<void> {
  for (let i = 0; i < config.security.loginFailureThreshold; i += 1) {
    await recordLoginFailure(db, EMAIL, at);
  }
}

describe('登录失败锁定', () => {
  it('未达阈值不锁定，第 10 次失败起锁定一个完整窗口', async () => {
    for (let i = 1; i < config.security.loginFailureThreshold; i += 1) {
      expect((await recordLoginFailure(db, EMAIL, now)).locked).toBe(false);
    }
    const locked = await recordLoginFailure(db, EMAIL, now);
    expect(locked.locked).toBe(true);
    expect(locked.retryAfterSeconds).toBe(config.security.loginLockMinutes * 60);

    const state = await loginLockState(db, EMAIL, now);
    expect(state.locked).toBe(true);
    expect(state.retryAfterSeconds).toBe(config.security.loginLockMinutes * 60);
  });

  it('锁定窗口到期自动解锁，无需人工清理', async () => {
    await failUntilThreshold();
    expect((await loginLockState(db, EMAIL, now)).locked).toBe(true);
    // 锁定期间：剩余时间随时钟递减
    const halfway = await loginLockState(db, EMAIL, new Date(now.getTime() + lockMs / 2));
    expect(halfway.locked).toBe(true);
    expect(halfway.retryAfterSeconds).toBe(Math.ceil(lockMs / 2000));
    // 到期后放行
    expect((await loginLockState(db, EMAIL, new Date(now.getTime() + lockMs + 1000))).locked).toBe(false);
  });

  it('失败计数按邮箱归一化：大小写与空白不同仍算同一个账号', async () => {
    for (let i = 0; i < config.security.loginFailureThreshold; i += 1) {
      await recordLoginFailure(db, i % 2 === 0 ? 'Brute@Example.test' : '  brute@example.test  ', now);
    }
    expect((await loginLockState(db, EMAIL, now)).locked).toBe(true);
  });

  it('成功登录清零：失败计数与锁定一起归零，可以重新试满一个窗口', async () => {
    await failUntilThreshold();
    await clearLoginFailures(db, EMAIL);
    expect((await loginLockState(db, EMAIL, now)).locked).toBe(false);
    // 清零后 9 次失败仍不锁定（计数确实从头开始）
    for (let i = 1; i < config.security.loginFailureThreshold; i += 1) {
      expect((await recordLoginFailure(db, EMAIL, now)).locked).toBe(false);
    }
    expect((await recordLoginFailure(db, EMAIL, now)).locked).toBe(true);
  });

  it('不同邮箱互不牵连；跨窗口（下一个 15 分钟）计数重置', async () => {
    await failUntilThreshold();
    expect((await loginLockState(db, 'someone-else@example.test', now)).locked).toBe(false);
    // 下一个失败窗口：计数从 1 起算，不再锁定
    const nextWindow = new Date(now.getTime() + config.security.loginFailureWindowMinutes * 60 * 1000);
    expect((await recordLoginFailure(db, EMAIL, nextWindow)).locked).toBe(false);
  });
});
