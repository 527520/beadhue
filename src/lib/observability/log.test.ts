/**
 * 写入器单测（用户第 15 条）：截断、脱敏后的上下文、每分钟抑制计数、以及「绝不抛回调用方」。
 * 用进程内 PGlite 落真表，验证的是真实列映射而不是 mock 的调用次数。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestClient, type TestDatabase } from '@/../db/testClient';
import { systemLogs, users } from '@/../db/schema';
import type { AnyDatabase } from '@/../db/client';
import { withLogContext, setLogActor } from './context';
import {
  MAX_CONTEXT_BYTES, MAX_MESSAGE_BYTES, MAX_STACK_BYTES,
  awaitLogWrites, createLogThrottle, normalizeContext, resetLogThrottle, resolveLogDb, truncateText, utf8Bytes, writeSlowQuery, writeSystemLog, writeSystemLogBestEffort,
} from './log';

let db: TestDatabase;
beforeEach(async () => { db = await createTestClient(); });
afterEach(() => { vi.useRealTimers(); resetLogThrottle(); });

describe('truncateText（按 UTF-8 字节预算截断）', () => {
  it('未超预算原样返回，null 仍是 null', () => {
    expect(truncateText('短消息', MAX_MESSAGE_BYTES)).toBe('短消息');
    expect(truncateText(null, MAX_MESSAGE_BYTES)).toBeNull();
    expect(truncateText(undefined, MAX_MESSAGE_BYTES)).toBeNull();
  });

  it('超预算时截断并加省略号，且不切开多字节字符', () => {
    const message = '错'.repeat(2000);
    const truncated = truncateText(message, MAX_MESSAGE_BYTES) ?? '';
    expect(utf8Bytes(truncated)).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
    expect(truncated.endsWith('…')).toBe(true);
    expect(truncated).not.toContain('\uFFFD');
    const stack = truncateText('x'.repeat(20_000), MAX_STACK_BYTES) ?? '';
    expect(utf8Bytes(stack)).toBeLessThanOrEqual(MAX_STACK_BYTES);
  });
});

describe('normalizeContext（先脱敏再限长）', () => {
  it('剥掉禁止字段', () => {
    expect(normalizeContext({ email: 'a@b.test', ok: 1 })).toEqual({ email: '[已脱敏]', ok: 1 });
  });

  it('超大上下文退化成截断标记，仍保持合法 jsonb', () => {
    // 单串先被 redact 限到 512 字节，所以要用「很多键」把总量顶过 8 KB。
    const many = Object.fromEntries(Array.from({ length: 60 }, (_, index) => [`k${index}`, 'y'.repeat(512)]));
    const huge = normalizeContext(many);
    expect(huge).toMatchObject({ truncated: true });
    expect(utf8Bytes(JSON.stringify(huge))).toBeLessThanOrEqual(MAX_CONTEXT_BYTES);
    expect(normalizeContext(undefined)).toBeNull();
  });
});

describe('createLogThrottle（每分钟抑制计数）', () => {
  it('放行到上限，之后计数抑制；跨窗口交回抑制数', () => {
    const throttle = createLogThrottle(2);
    expect(throttle(0)).toEqual({ allowed: true, suppressedNotice: 0 });
    expect(throttle(1)).toEqual({ allowed: true, suppressedNotice: 0 });
    expect(throttle(2)).toEqual({ allowed: false, suppressedNotice: 0 });
    expect(throttle(3)).toEqual({ allowed: false, suppressedNotice: 0 });
    expect(throttle(60_000)).toEqual({ allowed: true, suppressedNotice: 2 });
    // 新窗口重新计数
    expect(throttle(60_001)).toEqual({ allowed: true, suppressedNotice: 0 });
    expect(throttle(60_002)).toEqual({ allowed: false, suppressedNotice: 0 });
  });

  it('上限至少为 1（配 0 也不会把日志全关掉）', () => {
    const throttle = createLogThrottle(0);
    expect(throttle(0).allowed).toBe(true);
    expect(throttle(1).allowed).toBe(false);
  });
});

describe('writeSystemLog（尽力而为）', () => {
  it('写入真实行，requestId / 账号 / 掩码 IP 从当前上下文补齐', async () => {
    const [account] = await db.insert(users).values({ email: 'logs-admin@example.test', role: 'admin', emailVerifiedAt: new Date() }).returning();
    await withLogContext({ requestId: 'req-abc', ipMasked: '203.0.113.0', method: 'POST', path: '/api/x', route: '/api/x' }, async () => {
      setLogActor({ userId: account.id, role: 'admin' });
      await writeSystemLog(db, { level: 'error', source: 'api', event: 'api.unhandled', status: 500, message: 'boom', stack: 'stack-line' });
    });
    const rows = await db.select().from(systemLogs);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      level: 'error', source: 'api', event: 'api.unhandled', status: 500,
      requestId: 'req-abc', ipMasked: '203.0.113.0', method: 'POST', path: '/api/x', message: 'boom',
      actorUserId: account.id, actorRole: 'admin',
    });
  });

  it('写入前后都不抛错：句柄为 null、insert 失败、库不可达都只是少一条日志', async () => {
    await expect(writeSystemLog(null, { level: 'error', source: 'api', event: 'x' })).resolves.toBeUndefined();
    const failing = { insert: () => { throw new Error('db down'); } } as unknown as AnyDatabase;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(writeSystemLog(failing, { level: 'error', source: 'api', event: 'x' })).resolves.toBeUndefined();
    await expect(writeSlowQuery(failing, { statement: 'select 1', durationMs: 900 })).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('超过每分钟上限后不再写行，下一个窗口补一条抑制说明行', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    resetLogThrottle(1);
    await writeSystemLog(db, { level: 'error', source: 'api', event: 'api.unhandled', message: '第一条' });
    await writeSystemLog(db, { level: 'error', source: 'api', event: 'api.unhandled', message: '第二条' });
    await writeSystemLog(db, { level: 'error', source: 'api', event: 'api.unhandled', message: '第三条' });
    expect(await db.select().from(systemLogs)).toHaveLength(1);
    vi.setSystemTime(new Date('2026-01-01T00:01:30.000Z'));
    await writeSystemLog(db, { level: 'error', source: 'api', event: 'api.unhandled', message: '下个窗口' });
    const rows = await db.select().from(systemLogs);
    expect(rows).toHaveLength(3);
    const notice = rows.find((row) => row.event === 'syslog.suppressed');
    expect(notice?.message).toContain('2');
    expect(notice?.level).toBe('warn');
  });

  it('writeSystemLogBestEffort 在测试库（PGlite 注入）里落库', async () => {
    const { setTestDb } = await import('@/lib/auth/db');
    setTestDb(db);
    expect(resolveLogDb()).toBe(db);
    await writeSystemLogBestEffort({ level: 'warn', source: 'security', event: 'security.mail_budget_exhausted', message: '邮件预算已用完' });
    await awaitLogWrites();
    const rows = await db.select().from(systemLogs);
    expect(rows.map((row) => row.event)).toEqual(['security.mail_budget_exhausted']);
  });
});
