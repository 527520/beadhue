/**
 * 运行日志写入器（用户第 15 条）。
 *
 * 设计约束（与需求逐条对应）：
 * - **尽力而为**：任何写入失败只打 stdout，绝不把异常抛回请求处理；
 * - **限流**：每进程每分钟最多 `SYSLOG_MAX_ROWS_PER_MINUTE` 行，超出的行按分钟汇总成
 *   一条 `syslog.suppressed` 说明行，不做静默丢弃；
 * - **截断**：message 2 KB、stack 16 KB、context 8 KB、慢查询语句 2 KB；
 * - **脱敏**：所有 context 先过 `redact()`；网络地址只接受掩码后的值。
 *
 * 写入失败与「库不可达」都只是少一条日志，绝不能让日志系统成为新的故障点。
 */
import type { AnyDatabase } from '@/../db/client';
import { slowQueries, systemLogs } from '@/../db/schema';
import { config } from '@/lib/config';
import { getDb, usesPgliteFallback } from '@/lib/auth/db';
import { currentLogContext, currentSpans, redact, type LogSpan } from './context';

export type SystemLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface SystemLogEntry {
  level: SystemLogLevel;
  /** 产生日志的通道：api / render / route / action / client / mail / security / cleanup… */
  source: string;
  /** 稳定事件名（如 `api.unhandled` / `mail.send_failed`），用于筛选与聚合。 */
  event: string;
  actorUserId?: string | null;
  actorRole?: string | null;
  ipMasked?: string | null;
  requestId?: string | null;
  method?: string | null;
  path?: string | null;
  route?: string | null;
  status?: number | null;
  durationMs?: number | null;
  errorCode?: string | null;
  message?: string | null;
  stack?: string | null;
  /** 附加事实；写入前经 redact() 脱敏，序列化后超过 8 KB 会被截断标记。 */
  context?: unknown;
}

export interface SlowQueryEntry {
  statement: string;
  durationMs: number;
  rowCount?: number | null;
  /** 调用链（route → service → db），来自当前 ALS 上下文。 */
  chain?: LogSpan[];
  requestId?: string | null;
  actorUserId?: string | null;
  route?: string | null;
  method?: string | null;
}

export const MAX_MESSAGE_BYTES = 2048;
export const MAX_STACK_BYTES = 16 * 1024;
export const MAX_CONTEXT_BYTES = 8 * 1024;
export const MAX_STATEMENT_BYTES = 2048;

const encoder = new TextEncoder();

/** UTF-8 字节数（Postgres 的 text 无上限，截断是为了别让一行日志吃掉整页内存）。 */
export function utf8Bytes(value: string): number {
  return encoder.encode(value).byteLength;
}

/**
 * 按 UTF-8 字节预算截断，并补一个省略号表示「后面还有」。
 * 多字节字符不会被切断（避免写入非法 UTF-8），因此结果可能略小于 maxBytes。
 */
export function truncateText(value: string | null | undefined, maxBytes: number): string | null {
  if (value === null || value === undefined) return null;
  if (maxBytes <= 0) return null;
  if (utf8Bytes(value) <= maxBytes) return value;
  let low = 0;
  let high = value.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (utf8Bytes(value.slice(0, middle)) <= maxBytes - 3) low = middle;
    else high = middle - 1;
  }
  return `${value.slice(0, low)}…`;
}

/** context 归一化：先脱敏，再序列化；超过预算时退化成「截断标记 + 预览」，保持 jsonb 合法。 */
export function normalizeContext(context: unknown): Record<string, unknown> | null {
  if (context === undefined || context === null) return null;
  const redacted = redact(context);
  let json: string;
  try {
    json = JSON.stringify(redacted) ?? 'null';
  } catch {
    return { truncated: true, notice: '上下文无法序列化' };
  }
  if (utf8Bytes(json) <= MAX_CONTEXT_BYTES) {
    return typeof redacted === 'object' && !Array.isArray(redacted) ? redacted as Record<string, unknown> : { value: redacted };
  }
  return { truncated: true, notice: '上下文过大已截断', preview: truncateText(json, MAX_CONTEXT_BYTES - 200) };
}

const WINDOW_MS = 60_000;

export interface LogThrottleVerdict {
  allowed: boolean;
  /** 上一个窗口被抑制的行数（> 0 时写入器补一条说明行，而不是静默丢弃）。 */
  suppressedNotice: number;
}

/**
 * 进程内计数器（每分钟窗口从「本窗口第一条日志」起算）。
 * 返回一个判定函数：放行返回 allowed，超限返回 allowed=false 并累加抑制计数；
 * 跨入新窗口时把上一窗口的抑制数交回给调用方去补说明行。
 */
export function createLogThrottle(maxPerMinute: number): (now?: number) => LogThrottleVerdict {
  const limit = Math.max(1, Math.floor(maxPerMinute));
  let windowStart = Number.NEGATIVE_INFINITY;
  let written = 0;
  let suppressed = 0;
  return (now: number = Date.now()): LogThrottleVerdict => {
    if (now - windowStart >= WINDOW_MS) {
      const notice = suppressed;
      windowStart = now;
      written = 0;
      suppressed = 0;
      written += 1;
      return { allowed: true, suppressedNotice: notice };
    }
    if (written < limit) {
      written += 1;
      return { allowed: true, suppressedNotice: 0 };
    }
    suppressed += 1;
    return { allowed: false, suppressedNotice: 0 };
  };
}

let throttle = createLogThrottle(config.observability.syslogMaxRowsPerMinute);

/** 测试与配置变更后重置计数器。 */
export function resetLogThrottle(maxPerMinute: number = config.observability.syslogMaxRowsPerMinute): void {
  throttle = createLogThrottle(maxPerMinute);
}

/**
 * 进程内未完成的日志写入。
 * 生产上写入是「响应返回前不等待」的尽力而为；测试需要在断言前等它们落库。
 */
const inflight = new Set<Promise<void>>();

function track(write: Promise<void>): void {
  inflight.add(write);
  void write.finally(() => inflight.delete(write));
}

/** 等待尚未完成的日志写入（测试与优雅停机使用）。 */
export async function awaitLogWrites(): Promise<void> {
  while (inflight.size > 0) await Promise.all([...inflight]);
}

/**
 * 取数据库句柄；库不可达/未初始化时返回 null。
 * 日志是尽力而为的旁路：这里绝不让启动期的数据库异常冒到调用点。
 */
export function resolveLogDb(): AnyDatabase | null {
  try {
    return getDb();
  } catch {
    return null;
  }
}

/** 从当前请求上下文补齐字段；调用方显式给的字段优先。 */
function withContext(entry: SystemLogEntry): SystemLogEntry {
  const context = currentLogContext();
  if (!context) return entry;
  return {
    ...entry,
    requestId: entry.requestId ?? context.requestId,
    actorUserId: entry.actorUserId ?? context.actorUserId ?? null,
    actorRole: entry.actorRole ?? context.actorRole ?? null,
    ipMasked: entry.ipMasked ?? context.ipMasked,
    method: entry.method ?? (context.method || null),
    path: entry.path ?? (context.path || null),
    route: entry.route ?? (context.route || null),
  };
}

const clampInt = (value: number | null | undefined): number | null =>
  value === null || value === undefined || !Number.isFinite(value) ? null : Math.max(-2_147_483_648, Math.min(2_147_483_647, Math.round(value)));

/**
 * 写入一条 system_logs 行（尽力而为）。
 * `db` 为 null 表示调用点没有句柄，由 `writeSystemLogBestEffort` 负责解析。
 */
export async function writeSystemLog(db: AnyDatabase | null, entry: SystemLogEntry): Promise<void> {
  if (!db) return;
  const resolved = withContext(entry);
  const verdict = throttle();
  if (verdict.allowed && verdict.suppressedNotice > 0) {
    await insertSystemLog(db, {
      level: 'warn', source: 'observability', event: 'syslog.suppressed',
      message: `上一分钟内超过每分钟上限，已抑制 ${verdict.suppressedNotice} 条日志（SYSLOG_MAX_ROWS_PER_MINUTE=${config.observability.syslogMaxRowsPerMinute}）`,
      context: { suppressed: verdict.suppressedNotice },
    });
  }
  if (!verdict.allowed) return;
  await insertSystemLog(db, resolved);
}

async function insertSystemLog(db: AnyDatabase, entry: SystemLogEntry): Promise<void> {
  try {
    await db.insert(systemLogs).values({
      level: entry.level,
      source: entry.source.slice(0, 64),
      event: entry.event.slice(0, 160),
      actorUserId: entry.actorUserId ?? null,
      actorRole: entry.actorRole ? entry.actorRole.slice(0, 32) : null,
      ipMasked: entry.ipMasked ?? null,
      requestId: entry.requestId ?? null,
      method: entry.method ? entry.method.slice(0, 16) : null,
      path: truncateText(entry.path, 512),
      route: truncateText(entry.route, 512),
      status: clampInt(entry.status),
      durationMs: clampInt(entry.durationMs),
      errorCode: entry.errorCode ? entry.errorCode.slice(0, 64) : null,
      message: truncateText(entry.message, MAX_MESSAGE_BYTES),
      stack: truncateText(entry.stack, MAX_STACK_BYTES),
      context: normalizeContext(entry.context),
    });
  } catch (error) {
    // 落库失败只留 stdout：绝不能因为日志表写不进去而影响主流程。
    console.error('[observability] system_logs 写入失败:', error instanceof Error ? error.message : error);
  }
}

/**
 * 没有数据库句柄时的入口（instrumentation / mailer / 启动钩子）：
 * 生产路径下拿不到句柄即视为库不可达，直接放弃；开发/E2E 的 PGlite 回退继续尝试。
 */
export async function writeSystemLogBestEffort(entry: SystemLogEntry): Promise<void> {
  const db = resolveLogDb();
  if (!db && !usesPgliteFallback()) return;
  await writeSystemLog(db, entry);
}

/** 非阻塞写入（fire-and-forget），供错误边界这类不能等待的路径使用。 */
export function fireSystemLog(entry: SystemLogEntry): void {
  track(writeSystemLogBestEffort(entry));
}

/** 非阻塞慢查询写入。 */
export function fireSlowQuery(entry: SlowQueryEntry): void {
  const db = resolveLogDb();
  if (!db && !usesPgliteFallback()) return;
  track(writeSlowQuery(db, entry));
}

/** 写入一条慢查询（含调用链）。语句文本已由调用方去除参数值（drizzle 只发 $n 占位符）。 */
export async function writeSlowQuery(db: AnyDatabase | null, entry: SlowQueryEntry): Promise<void> {
  if (!db) return;
  const context = currentLogContext();
  try {
    await db.insert(slowQueries).values({
      requestId: entry.requestId ?? context?.requestId ?? null,
      actorUserId: entry.actorUserId ?? context?.actorUserId ?? null,
      route: truncateText(entry.route ?? context?.route ?? null, 512),
      method: entry.method ?? (context?.method || null),
      statement: truncateText(entry.statement, MAX_STATEMENT_BYTES) ?? '',
      durationMs: clampInt(entry.durationMs) ?? 0,
      rowCount: clampInt(entry.rowCount),
      chain: (entry.chain ?? currentSpans()).slice(0, 24),
    });
  } catch (error) {
    console.error('[observability] slow_queries 写入失败:', error instanceof Error ? error.message : error);
  }
}

/**
 * 显式安全事件（邮件预算耗尽、登录锁定、越权访问…）。
 * 与普通错误分开命名（source=security），便于后台单独筛出「需要人看的事件」。
 */
export async function recordSecurityEvent(
  db: AnyDatabase | null,
  input: { event: string; level?: SystemLogLevel; message?: string; context?: unknown; actorUserId?: string | null; actorRole?: string | null },
): Promise<void> {
  await writeSystemLog(db ?? resolveLogDb(), {
    level: input.level ?? 'warn',
    source: 'security',
    event: input.event,
    message: input.message ?? null,
    context: input.context,
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole ?? null,
  });
}
