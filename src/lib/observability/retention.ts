/**
 * 运行日志保留期清理（用户第 15 条）。
 *
 * 与 rate_limits / 同步墓碑一样挂在 instrumentation 的每日清理里：
 * system_logs 默认 30 天（隐私政策写明的上限），slow_queries 默认 14 天。
 * 两个天数都由 `SYSLOG_RETENTION_DAYS` / `SLOW_QUERY_RETENTION_DAYS` 配置。
 */
import { lt } from 'drizzle-orm';
import type { AnyDatabase } from '@/../db/client';
import { slowQueries, systemLogs } from '@/../db/schema';
import { config } from '@/lib/config';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ObservabilityCleanupResult {
  systemLogs: number;
  slowQueries: number;
}

/** 删除超过保留期的行；返回删除条数供清理日志打印。 */
export async function cleanupObservabilityLogs(
  db: AnyDatabase,
  now: Date = new Date(),
): Promise<ObservabilityCleanupResult> {
  const systemCutoff = new Date(now.getTime() - config.observability.syslogRetentionDays * DAY_MS);
  const slowCutoff = new Date(now.getTime() - config.observability.slowQueryRetentionDays * DAY_MS);
  const [logs, slow] = await Promise.all([
    db.delete(systemLogs).where(lt(systemLogs.createdAt, systemCutoff)).returning(),
    db.delete(slowQueries).where(lt(slowQueries.createdAt, slowCutoff)).returning(),
  ]);
  return { systemLogs: logs.length, slowQueries: slow.length };
}
