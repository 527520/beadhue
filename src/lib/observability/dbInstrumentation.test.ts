/**
 * 慢查询采集单测（用户第 15 条）：
 * 阈值判定是纯函数，连接池计时只验证「不改返回值 / 不吞异常 / 正常查询零写入」。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { createTestClient, type TestDatabase } from '@/../db/testClient';
import { slowQueries } from '@/../db/schema';
import { setTestDb } from '@/lib/auth/db';
import { withLogContext, pushSpan } from './context';
import { LOG_WRITE_STATEMENT, evaluateSlowQuery, extractStatement, instrumentPool, readProdPool, registerProdPool, shouldRecordSlowQuery } from './dbInstrumentation';
import { awaitLogWrites, writeSlowQuery } from './log';

let db: TestDatabase;
beforeEach(async () => { db = await createTestClient(); setTestDb(db); });
afterEach(() => { vi.restoreAllMocks(); });

describe('shouldRecordSlowQuery（阈值判定）', () => {
  it('只有严格超过阈值才算慢查询', () => {
    expect(shouldRecordSlowQuery(501, 500)).toBe(true);
    expect(shouldRecordSlowQuery(500, 500)).toBe(false);
    expect(shouldRecordSlowQuery(12, 500)).toBe(false);
  });

  it('阈值为 0 表示停用采集', () => {
    expect(shouldRecordSlowQuery(10_000, 0)).toBe(false);
  });

  it('耗时不是有效数字时不采集', () => {
    expect(shouldRecordSlowQuery(Number.NaN, 500)).toBe(false);
    expect(shouldRecordSlowQuery(Number.POSITIVE_INFINITY, 500)).toBe(false);
  });
});

describe('extractStatement（两种调用形式）', () => {
  it('支持字符串与 { text, values } 配置对象，且只取语句文本', () => {
    expect(extractStatement(['select 1'])).toBe('select 1');
    expect(extractStatement([{ text: 'select $1', values: ['secret'] }])).toBe('select $1');
    expect(extractStatement([undefined])).toBe('');
  });

  it('日志表自身的写入不参与慢查询判定（否则会自我放大）', () => {
    expect(LOG_WRITE_STATEMENT.test('insert into "system_logs" ("level") values ($1)')).toBe(true);
    expect(LOG_WRITE_STATEMENT.test('insert into "slow_queries" default values')).toBe(true);
    expect(LOG_WRITE_STATEMENT.test('select * from "system_logs"')).toBe(false);
  });
});

describe('evaluateSlowQuery（调用链拼接）', () => {
  it('未超过阈值返回 null', () => {
    expect(evaluateSlowQuery('select 1', 10, 1, [], 500)).toBeNull();
  });

  it('超过阈值时把语句作为调用链最后一环，并带上发起方的 requestId / 账号', () => {
    const entry = evaluateSlowQuery('select * from community_works where id = $1', 812.4, 3,
      [{ kind: 'route', name: 'GET /api/admin/logs' }, { kind: 'service', name: 'admin.listSystemLogs' }], 500,
      { requestId: 'req-9', actorUserId: 'user-9', route: '/admin/logs', method: 'GET' });
    expect(entry?.durationMs).toBe(812.4);
    expect(entry?.rowCount).toBe(3);
    expect(entry?.requestId).toBe('req-9');
    expect(entry?.actorUserId).toBe('user-9');
    expect(entry?.chain?.map((span) => span.kind)).toEqual(['route', 'service', 'db']);
    expect(entry?.chain?.at(-1)?.detail).toBe('812 ms');
  });
});

describe('instrumentPool（生产连接池计时）', () => {
  it('不改返回值、不吞异常，正常查询零写入', async () => {
    const pool = {
      query: vi.fn(async () => ({ rowCount: 2, rows: [{ a: 1 }] })),
      totalCount: 3, idleCount: 2, waitingCount: 0, options: { max: 10 },
    } as unknown as Pool;
    registerProdPool(pool);
    expect(readProdPool()).toBe(pool);
    const result = await (pool.query as unknown as (text: string) => Promise<{ rowCount: number }>)('select 1');
    expect(result.rowCount).toBe(2);
    await awaitLogWrites();
    expect(await db.select().from(slowQueries)).toHaveLength(0);
  });

  it('抛错的查询原样抛出（计时层不改变错误语义）', async () => {
    const pool = { query: vi.fn(async () => { throw new Error('query failed'); }) } as unknown as Pool;
    instrumentPool(pool);
    await expect((pool.query as unknown as (text: string) => Promise<unknown>)('select bad')).rejects.toThrow('query failed');
  });

  it('慢查询按列落库：语句、耗时、行数、requestId 与调用链', async () => {
    await withLogContext({ requestId: 'req-slow', ipMasked: '203.0.113.0', method: 'GET', path: '/admin/logs', route: '/admin/logs' }, async () => {
      pushSpan({ kind: 'service', name: 'admin.listSlowQueries' });
      const entry = evaluateSlowQuery('select pg_sleep(1)', 1200, 7, [{ kind: 'service', name: 'admin.listSlowQueries' }], 1, { requestId: 'req-slow', route: '/admin/logs' });
      await writeSlowQuery(db, entry!);
    });
    const rows = await db.select().from(slowQueries);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      statement: 'select pg_sleep(1)', durationMs: 1200, rowCount: 7, requestId: 'req-slow', route: '/admin/logs', method: 'GET',
    });
    expect((rows[0].chain as Array<{ kind: string }>).map((span) => span.kind)).toEqual(['service', 'db']);
  });

  it('createProdClient 建池后立刻注册到 globalThis（跨模块副本的唯一通道）', async () => {
    const { createProdClient } = await import('@/../db/client');
    // 只建池不查询：pg 在第一次查询前不会发起连接，这里验证的是注册与包装本身。
    const client = createProdClient('postgres://doupu:doupu@127.0.0.1:1/doupu');
    expect(client).toBeTruthy();
    const pool = readProdPool();
    expect(pool).not.toBeNull();
    await pool?.end();
  });
});
