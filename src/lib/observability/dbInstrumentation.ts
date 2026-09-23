/**
 * 慢查询采集（用户第 15 条：只采慢查询，不做全量 SQL 日志）。
 *
 * 做法：`db/client.ts#createProdClient` 建好 `pg` 连接池后调用 `registerProdPool()`，
 * 把池挂到 globalThis 并给 `pool.query` 套一层计时。为什么要挂 globalThis：
 * webpack 会把 instrumentation 与各路由打包成互相独立的模块副本（与 PGlite 回退同一原因），
 * 模块级变量不共享，globalThis 是唯一可靠的跨副本通道。
 *
 * 三条硬约束：
 * - 超过 `SLOW_QUERY_MS` 才落库（0 表示停用），正常查询零写入；
 * - 只存语句文本，**绝不存参数值**（drizzle 发的是 `$n` 占位符，保持原样）；
 * - 日志自身的写入不计时，否则「写慢查询」会再触发慢查询，自我放大。
 */
import type { Pool } from 'pg';
import { config } from '@/lib/config';
import { currentLogContext, type LogSpan } from './context';
import { fireSlowQuery, type SlowQueryEntry } from './log';

/**
 * 生产连接池的 globalThis 键（与 `src/lib/auth/db.ts` 的 PGlite 回退同一个套路）。
 * 后台「数据库」页与 instrumentation 都通过它读到同一个池的真实计数。
 */
const POOL_KEY = '__doupu_prod_pool__';

/** 打标记的 symbol：同一个池被多个模块副本注册时只包装一次。 */
const INSTRUMENTED = Symbol.for('doupu.pg.pool.instrumented');

/** 日志表自身的写入（system_logs / slow_queries）不参与慢查询判定。 */
export const LOG_WRITE_STATEMENT = /^\s*insert\s+into\s+"?(?:public"?\."?)?(system_logs|slow_queries)"?/i;

/** 池查询参数可能是字符串，也可能是 `{ text, values }` 配置对象（pg 的两种调用形式）。 */
export function extractStatement(args: readonly unknown[]): string {
  const first = args[0];
  if (typeof first === 'string') return first;
  if (first && typeof first === 'object' && typeof (first as { text?: unknown }).text === 'string') {
    return (first as { text: string }).text;
  }
  return '';
}

/** 阈值判定：显式 0 停用；刚好等于阈值不算慢（`>` 而不是 `>=`，与需求一致）。 */
export function shouldRecordSlowQuery(durationMs: number, thresholdMs: number): boolean {
  return thresholdMs > 0 && Number.isFinite(durationMs) && durationMs > thresholdMs;
}

function rowCountOf(result: unknown): number | null {
  if (Array.isArray(result)) {
    const counts = result.map((item) => rowCountOf(item)).filter((value): value is number => value !== null);
    return counts.length > 0 ? counts.reduce((total, value) => total + value, 0) : null;
  }
  if (result && typeof result === 'object') {
    const rowCount = (result as { rowCount?: unknown }).rowCount;
    if (typeof rowCount === 'number') return rowCount;
  }
  return null;
}

/** 语句摘要：调用链最后展示一环，长语句只保留头部（完整语句在慢查询详情里）。 */
function statementLabel(statement: string): string {
  const oneLine = statement.replace(/\s+/g, ' ').trim();
  return oneLine.length > 96 ? `${oneLine.slice(0, 96)}…` : oneLine;
}

/**
 * 纯函数判定：给定语句、耗时、行数与调用链，返回要落库的慢查询记录或 null。
 * 抽出来是为了让「阈值判定 + 调用链拼接」可以在单元测试里直接断言，
 * 不必真的造一条 500 毫秒的语句。
 */
export function evaluateSlowQuery(
  statement: string,
  durationMs: number,
  rowCount: number | null,
  chain: readonly LogSpan[],
  thresholdMs: number,
  context?: { requestId?: string | null; actorUserId?: string | null; route?: string | null; method?: string | null },
): SlowQueryEntry | null {
  if (!shouldRecordSlowQuery(durationMs, thresholdMs)) return null;
  return {
    statement,
    durationMs,
    rowCount,
    // 调用链末尾补上真正慢下来的这条语句，后台按面包屑展示「从入口到语句」的路径。
    chain: [...chain, { kind: 'db', name: statementLabel(statement), detail: `${Math.round(durationMs)} ms` }],
    requestId: context?.requestId ?? null,
    actorUserId: context?.actorUserId ?? null,
    route: context?.route ?? null,
    method: context?.method ?? null,
  };
}

function reportSlowQuery(statement: string, durationMs: number, rowCount: number | null, chain: LogSpan[]): void {
  const context = currentLogContext();
  const entry = evaluateSlowQuery(statement, durationMs, rowCount, chain, config.observability.slowQueryMs, {
    requestId: context?.requestId ?? null,
    actorUserId: context?.actorUserId ?? null,
    route: context?.route || null,
    method: context?.method || null,
  });
  if (entry) fireSlowQuery(entry);
}

/**
 * 包装 `pool.query`：只在查询结束后判定耗时，不改变返回值、不吞异常。
 * PGlite 回退路径不会创建 `pg` 池，因此天然不采集（也无需开关）。
 */
export function instrumentPool(pool: Pool): void {
  const target = pool as unknown as { query: (...args: unknown[]) => unknown; [INSTRUMENTED]?: boolean };
  if (target[INSTRUMENTED]) return;
  target[INSTRUMENTED] = true;
  const original = pool.query.bind(pool) as (...args: unknown[]) => unknown;
  target.query = (...args: unknown[]): unknown => {
    const statement = extractStatement(args);
    if (config.observability.slowQueryMs <= 0 || LOG_WRITE_STATEMENT.test(statement)) return original(...args);
    const startedAt = performance.now();
    // 在查询发起时取上下文：调用链属于发起方，而不是恰好先结束的其它请求。
    const chain = currentLogContext()?.spans.map((span) => ({ ...span })) ?? [];
    const result = original(...args);
    if (!result || typeof (result as PromiseLike<unknown>).then !== 'function') return result;
    return (result as Promise<unknown>).then(
      (value) => {
        reportSlowQuery(statement, performance.now() - startedAt, rowCountOf(value), chain);
        return value;
      },
      (error: unknown) => {
        throw error;
      },
    );
  };
}

/** 生产客户端建池后调用：注册到 globalThis + 开启慢查询计时。 */
export function registerProdPool(pool: Pool): void {
  (globalThis as Record<string, unknown>)[POOL_KEY] = pool;
  instrumentPool(pool);
}

/** 读取当前进程的生产连接池（PGlite 回退/未建池时为 null）。 */
export function readProdPool(): Pool | null {
  const pool = (globalThis as Record<string, unknown>)[POOL_KEY];
  return pool && typeof (pool as { query?: unknown }).query === 'function' ? pool as Pool : null;
}
