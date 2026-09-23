/**
 * 保留期清理单测（用户第 15 条）：错误日志 30 天、慢查询 14 天，超期才删。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestClient, type TestDatabase } from '@/../db/testClient';
import { slowQueries, systemLogs } from '@/../db/schema';
import { config } from '@/lib/config';
import { cleanupObservabilityLogs } from './retention';

let db: TestDatabase;
beforeEach(async () => { db = await createTestClient(); });

const daysAgo = (days: number, now: Date) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

describe('cleanupObservabilityLogs', () => {
  it('删除超过保留期的行并返回条数，未超期的一行不动', async () => {
    const now = new Date('2026-03-01T00:00:00.000Z');
    const systemRetention = config.observability.syslogRetentionDays;
    const slowRetention = config.observability.slowQueryRetentionDays;
    await db.insert(systemLogs).values([
      { createdAt: daysAgo(systemRetention + 1, now), level: 'error', source: 'api', event: 'api.unhandled' },
      { createdAt: daysAgo(systemRetention - 1, now), level: 'error', source: 'api', event: 'api.unhandled' },
    ]);
    await db.insert(slowQueries).values([
      { createdAt: daysAgo(slowRetention + 1, now), statement: 'select 1', durationMs: 900, chain: [] },
      { createdAt: daysAgo(slowRetention - 1, now), statement: 'select 2', durationMs: 900, chain: [] },
    ]);
    const removed = await cleanupObservabilityLogs(db, now);
    expect(removed).toEqual({ systemLogs: 1, slowQueries: 1 });
    expect((await db.select().from(systemLogs)).map((row) => row.event)).toEqual(['api.unhandled']);
    expect((await db.select().from(slowQueries)).map((row) => row.statement)).toEqual(['select 2']);
  });

  it('保留期默认值即隐私政策写明的 30 天 / 14 天', () => {
    expect(config.observability.syslogRetentionDays).toBe(30);
    expect(config.observability.slowQueryRetentionDays).toBe(14);
  });
});
