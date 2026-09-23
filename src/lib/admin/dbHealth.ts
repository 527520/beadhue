/**
 * 数据库健康读数（用户第 15 条）：连接池 + `pg_stat_activity` + 库大小，
 * 以及「pg_stat_statements 未启用」的说明与启用步骤。
 *
 * 三条设计原则：
 * - 只读，不写任何东西，也不改动会话参数；
 * - 逐项 try/catch：普通角色看不到别人的会话、PGlite 没有统计视图，都只让对应字段降级，
 *   绝不因为「看不到」而整页报错；
 * - 明确区分「事实」与「看不到」：读不到就写清楚原因（如可见范围仅限自己的连接），
 *   不猜成 0。
 */
import { sql } from 'drizzle-orm';
import type { AnyDatabase } from '@/../db/client';
import { pushSpan } from '@/lib/observability/context';
import { readProdPool } from '@/lib/observability/dbInstrumentation';
import { zhCN } from '@/messages/zh-CN';

export interface PoolStats {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  max: number;
}

export interface ActivityStats {
  available: boolean;
  total: number | null;
  active: number | null;
  idle: number | null;
  idleInTransaction: number | null;
  /** 当前运行最久的一条活动查询（毫秒）。 */
  longestRunningMs: number | null;
  /**
   * 当前角色能否看到全部会话（超级用户或 pg_read_all_stats 成员）。
   * false 表示上面的计数只覆盖自己的连接，界面上要照实说明。
   */
  canReadAll: boolean | null;
  /** 读不到时的原因（未接入 / 权限不足 / 执行失败）。 */
  reason: string | null;
}

export interface DatabaseHealth {
  pool: PoolStats | null;
  activity: ActivityStats;
  size: { available: boolean; bytes: number | null };
  statements: { available: boolean; hint: string };
  checkedAt: string;
}

/** drizzle 的 `execute` 在 node-postgres 下返回 QueryResult，在 PGlite 下返回 Results，这里统一取首行。 */
function firstRow<T>(result: unknown): T | null {
  const rows = (result as { rows?: unknown }).rows;
  if (Array.isArray(rows)) return (rows[0] as T) ?? null;
  if (Array.isArray(result)) return (result[0] as T) ?? null;
  return null;
}

const toInt = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
};

/** 连接池读数：来自 globalThis 上注册的同一个池（PGlite 回退时为空）。 */
export function readPoolStats(): PoolStats | null {
  const pool = readProdPool();
  if (!pool) return null;
  const max = (pool as unknown as { options?: { max?: unknown } }).options?.max;
  return {
    totalCount: pool.totalCount ?? 0,
    idleCount: pool.idleCount ?? 0,
    waitingCount: pool.waitingCount ?? 0,
    max: typeof max === 'number' ? max : 0,
  };
}

async function readActivity(db: AnyDatabase): Promise<ActivityStats> {
  const empty: ActivityStats = { available: false, total: null, active: null, idle: null, idleInTransaction: null, longestRunningMs: null, canReadAll: null, reason: null };
  pushSpan({ kind: 'db', name: 'pg_stat_activity 汇总' });
  try {
    const result = await db.execute(sql`
      select
        count(*)::int as total,
        count(*) filter (where state = 'active')::int as active,
        count(*) filter (where state = 'idle')::int as idle,
        count(*) filter (where state = 'idle in transaction')::int as idle_in_transaction,
        coalesce(max(extract(epoch from (now() - query_start)) * 1000) filter (where state = 'active' and query_start is not null), 0)::int as longest_ms
      from pg_stat_activity
    `);
    const row = firstRow<Record<string, unknown>>(result);
    if (!row) return { ...empty, reason: zhCN.communityAdmin.logs.database.empty };
    // 能否看到别人的会话：决定上面的计数是「全部连接」还是「只有自己」。
    let canReadAll: boolean | null = null;
    try {
      const privilege = await db.execute(sql`
        select (select rolsuper from pg_roles where rolname = current_user) as is_superuser,
               pg_has_role(current_user, 'pg_read_all_stats', 'member') as can_read_all
      `);
      const privilegeRow = firstRow<{ is_superuser?: unknown; can_read_all?: unknown }>(privilege);
      canReadAll = privilegeRow ? Boolean(privilegeRow.is_superuser) || Boolean(privilegeRow.can_read_all) : null;
    } catch {
      canReadAll = null;
    }
    return {
      available: true,
      total: toInt(row.total),
      active: toInt(row.active),
      idle: toInt(row.idle),
      idleInTransaction: toInt(row.idle_in_transaction),
      longestRunningMs: toInt(row.longest_ms),
      canReadAll,
      reason: null,
    };
  } catch {
    return { ...empty, reason: zhCN.communityAdmin.logs.database.unavailable };
  }
}

async function readSize(db: AnyDatabase): Promise<DatabaseHealth['size']> {
  pushSpan({ kind: 'db', name: 'pg_database_size' });
  try {
    const result = await db.execute(sql`select pg_database_size(current_database())::bigint as bytes`);
    const row = firstRow<{ bytes?: unknown }>(result);
    return { available: row?.bytes != null, bytes: row?.bytes != null ? Number(row.bytes) : null };
  } catch {
    return { available: false, bytes: null };
  }
}

/**
 * pg_stat_statements 探测：本平台**不依赖**它（决议见 ADR-0026），
 * 因此这里只回答「有没有装」，没装时给出启用步骤，不在代码里假装能采全量 SQL。
 */
async function readStatements(db: AnyDatabase): Promise<DatabaseHealth['statements']> {
  const hint = zhCN.communityAdmin.logs.database.statStatementsHint;
  pushSpan({ kind: 'db', name: 'pg_stat_statements 探测' });
  try {
    const result = await db.execute(sql`select count(*)::int as installed from pg_extension where extname = 'pg_stat_statements'`);
    const row = firstRow<{ installed?: unknown }>(result);
    return { available: toInt(row?.installed ?? 0) !== 0, hint };
  } catch {
    return { available: false, hint };
  }
}

/** 汇总一次数据库健康读数（后台「数据库」页调用）。 */
export async function readDatabaseHealth(db: AnyDatabase): Promise<DatabaseHealth> {
  pushSpan({ kind: 'service', name: 'admin.dbHealth' });
  const [activity, size, statements] = await Promise.all([readActivity(db), readSize(db), readStatements(db)]);
  return { pool: readPoolStats(), activity, size, statements, checkedAt: new Date().toISOString() };
}
