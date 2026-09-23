import { and, desc, eq, gte, ilike, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AnyDatabase } from '@/../db/client';
import { adminAuditLogs, maintenanceRuns, slowQueries, systemLogs, users } from '@/../db/schema';
import { APP_VERSION } from '@/lib/appInfo';
import { countExpression, pageMeta, pageOffset, pageQueryFields, readCount } from '@/lib/admin/pagination';
import { maskEmailForPublic } from '@/lib/identity/publicAuthor';
import { pushSpan } from '@/lib/observability/context';
import migrationJournal from '@/../db/migrations/meta/_journal.json';
import { AppError } from '@/lib/errors';
import { sanitizeAuditState } from './audit';

const usersQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  ...pageQueryFields,
}).strict();

export async function listGovernedUsers(db: AnyDatabase, input: unknown = {}) {
  pushSpan({ kind: 'service', name: 'admin.listGovernedUsers' });
  const query = usersQuerySchema.parse(input);
  const q = query.q?.trim().slice(0, 80);
  const where = q ? or(ilike(users.email, `%${q}%`), ilike(users.username, `%${q}%`), sql`${users.id}::text = ${q}`) : undefined;
  const [rows, totalRows] = await Promise.all([
    db.select({
      id: users.id, email: users.email, username: users.username, role: users.role,
      accountStatus: users.accountStatus, governanceVersion: users.governanceVersion,
      emailVerifiedAt: users.emailVerifiedAt, createdAt: users.createdAt,
    }).from(users).where(where).orderBy(desc(users.createdAt), desc(users.id))
      .limit(query.size).offset(pageOffset(query.page, query.size)),
    db.select({ count: countExpression }).from(users).where(where),
  ]);
  const items = rows.map((row) => ({
    userId: row.id,
    maskedEmail: row.email ? maskEmailForPublic(row.email) : null,
    username: row.username,
    role: row.role,
    accountStatus: row.accountStatus,
    governanceVersion: row.governanceVersion,
    emailVerified: row.emailVerifiedAt !== null,
    createdAt: row.createdAt.toISOString(),
  }));
  return { items, ...pageMeta(readCount(totalRows), query.page, query.size) };
}

const auditQuerySchema = z.object({
  q: z.string().trim().max(120).optional(), from: z.iso.date().optional(), to: z.iso.date().optional(),
  ...pageQueryFields,
}).strict().refine((value) => !value.from || !value.to || value.from <= value.to);

export async function listAdminAudit(db: AnyDatabase, input: unknown = {}) {
  pushSpan({ kind: 'service', name: 'admin.listAdminAudit' });
  const query = auditQuerySchema.parse(input);
  const where = and(
    query.q ? or(ilike(adminAuditLogs.action, `%${query.q}%`), ilike(adminAuditLogs.targetId, `%${query.q}%`), ilike(adminAuditLogs.requestId, `%${query.q}%`)) : undefined,
    query.from ? gte(adminAuditLogs.createdAt, new Date(`${query.from}T00:00:00+08:00`)) : undefined,
    query.to ? lt(adminAuditLogs.createdAt, new Date(new Date(`${query.to}T00:00:00+08:00`).getTime() + 86400000)) : undefined,
  );
  const [rows, totalRows] = await Promise.all([
    db.select().from(adminAuditLogs).where(where).orderBy(desc(adminAuditLogs.createdAt), desc(adminAuditLogs.id))
      .limit(query.size).offset(pageOffset(query.page, query.size)),
    db.select({ count: countExpression }).from(adminAuditLogs).where(where),
  ]);
  return {
    items: rows.map((row) => ({ ...row, beforeState: sanitizeAuditState(row.beforeState), afterState: sanitizeAuditState(row.afterState), createdAt: row.createdAt.toISOString() })),
    ...pageMeta(readCount(totalRows), query.page, query.size),
  };
}
export type AdminAuditEntry = Awaited<ReturnType<typeof listAdminAudit>>['items'][number];

export async function getSystemInfo(db: AnyDatabase) {
  pushSpan({ kind: 'service', name: 'admin.getSystemInfo' });
  const selection = {
    task: maintenanceRuns.task, status: maintenanceRuns.status, startedAt: maintenanceRuns.startedAt,
    completedAt: maintenanceRuns.completedAt, errorCode: maintenanceRuns.errorCode,
  };
  const [maintenance, latestByStatus] = await Promise.all([
    db.select(selection).from(maintenanceRuns).orderBy(desc(maintenanceRuns.startedAt), desc(maintenanceRuns.id)).limit(50),
    db.selectDistinctOn([maintenanceRuns.task, maintenanceRuns.status], selection).from(maintenanceRuns)
      .orderBy(maintenanceRuns.task, maintenanceRuns.status, desc(maintenanceRuns.startedAt), desc(maintenanceRuns.id)),
  ]);
  const serialize = (row: typeof maintenance[number]) => ({ ...row, startedAt: row.startedAt.toISOString(), completedAt: row.completedAt?.toISOString() ?? null });
  const taskNames = [...new Set(['analytics.daily', ...latestByStatus.map((row) => row.task)])];
  const maintenanceTasks = taskNames.map((task) => {
    const runs = latestByStatus.filter((row) => row.task === task).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    const success = runs.find((row) => row.status === 'succeeded');
    const failure = runs.find((row) => row.status === 'failed');
    return { task, latest: runs[0] ? serialize(runs[0]) : null, lastSuccess: success ? serialize(success) : null, lastFailure: failure ? serialize(failure) : null };
  });
  let databaseMigration: { id: number | null; appliedAt: string | null; journalTimestamp: string | null; status: 'recorded' | 'unavailable' } = { id: null, appliedAt: null, journalTimestamp: null, status: 'unavailable' };
  try {
    const result = await db.execute(sql`select id, hash, created_at from drizzle.__drizzle_migrations order by created_at desc, id desc limit 1`);
    const row = (result as unknown as { rows?: Array<{ id: number; hash: string; created_at: number }> }).rows?.[0]
      ?? (result as unknown as Array<{ id: number; hash: string; created_at: number }>)[0];
    // Drizzle stores journalEntry.when, not wall-clock migration execution time.
    if (row) {
      const [evidence] = await db.select({ completedAt: maintenanceRuns.completedAt }).from(maintenanceRuns).where(and(
        eq(maintenanceRuns.task, 'database.migrate'), eq(maintenanceRuns.status, 'succeeded'), eq(maintenanceRuns.cursor, String(row.id)),
        sql`${maintenanceRuns.summary}->>'journalTimestamp' = ${String(row.created_at)}`, sql`${maintenanceRuns.summary}->>'hash' = ${row.hash}`,
      )).orderBy(desc(maintenanceRuns.completedAt), desc(maintenanceRuns.id)).limit(1);
      databaseMigration = { id: Number(row.id), appliedAt: evidence?.completedAt?.toISOString() ?? null, journalTimestamp: new Date(Number(row.created_at)).toISOString(), status: 'recorded' };
    }
  } catch (error) {
    const failure = error as { code?: string; cause?: { code?: string } };
    if ((failure.code ?? failure.cause?.code) !== '42P01') throw error;
  }
  return {
    applicationVersion: APP_VERSION,
    migrationJournalLatest: migrationJournal.entries.at(-1)?.tag ?? null,
    databaseMigration,
    maintenance: maintenance.map(serialize), maintenanceTasks,
    backup: { status: 'not_integrated', label: '未接入' },
  };
}

/* ------------------------------------------------------------------ *
 * 运行日志（用户第 15 条）：错误与事件 / 慢查询的只读查询。
 * 全部走与审计同一套分页（page/size → { items, total, page, size, totalPages }）。
 * ------------------------------------------------------------------ */

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

const systemLogsQuerySchema = z.object({
  level: z.enum(LOG_LEVELS).optional(),
  source: z.string().trim().max(64).optional(),
  event: z.string().trim().max(160).optional(),
  actorUserId: z.uuid().optional(),
  requestId: z.string().trim().max(64).optional(),
  q: z.string().trim().max(120).optional(),
  from: z.iso.date().optional(), to: z.iso.date().optional(),
  ...pageQueryFields,
}).strict().refine((value) => !value.from || !value.to || value.from <= value.to);

/** 从/到（含当天）→ 上海时区的闭开区间，与审计查询保持同一口径。 */
function createdRange(from?: string, to?: string) {
  return {
    start: from ? new Date(`${from}T00:00:00+08:00`) : undefined,
    end: to ? new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86_400_000) : undefined,
  };
}

const serializeSystemLog = <T extends { createdAt: Date }>(row: T) => ({ ...row, createdAt: row.createdAt.toISOString() });

/**
 * 列表只取展示需要的列：堆栈（最多 16 KB）与上下文（最多 8 KB）只在详情接口返回，
 * 否则一页 100 条就是几 MB 的 JSON。
 */
const systemLogListColumns = {
  id: systemLogs.id, createdAt: systemLogs.createdAt, level: systemLogs.level, source: systemLogs.source,
  event: systemLogs.event, actorUserId: systemLogs.actorUserId, actorRole: systemLogs.actorRole,
  ipMasked: systemLogs.ipMasked, requestId: systemLogs.requestId, method: systemLogs.method,
  path: systemLogs.path, route: systemLogs.route, status: systemLogs.status,
  durationMs: systemLogs.durationMs, errorCode: systemLogs.errorCode, message: systemLogs.message,
};

export async function listSystemLogs(db: AnyDatabase, input: unknown = {}) {
  pushSpan({ kind: 'service', name: 'admin.listSystemLogs' });
  const query = systemLogsQuerySchema.parse(input);
  const range = createdRange(query.from, query.to);
  const where = and(
    query.level ? eq(systemLogs.level, query.level) : undefined,
    query.source ? eq(systemLogs.source, query.source) : undefined,
    query.event ? ilike(systemLogs.event, `%${query.event}%`) : undefined,
    query.actorUserId ? eq(systemLogs.actorUserId, query.actorUserId) : undefined,
    query.requestId ? eq(systemLogs.requestId, query.requestId) : undefined,
    query.q ? or(
      ilike(systemLogs.message, `%${query.q}%`),
      ilike(systemLogs.event, `%${query.q}%`),
      ilike(systemLogs.path, `%${query.q}%`),
      ilike(systemLogs.errorCode, `%${query.q}%`),
      // 排障时最常被粘贴的就是请求编号：关键词也必须能命中它（admin-round-3 13）。
      ilike(systemLogs.requestId, `%${query.q}%`),
    ) : undefined,
    range.start ? gte(systemLogs.createdAt, range.start) : undefined,
    range.end ? lt(systemLogs.createdAt, range.end) : undefined,
  );
  const [rows, totalRows] = await Promise.all([
    db.select(systemLogListColumns).from(systemLogs).where(where).orderBy(desc(systemLogs.createdAt), desc(systemLogs.id))
      .limit(query.size).offset(pageOffset(query.page, query.size)),
    db.select({ count: countExpression }).from(systemLogs).where(where),
  ]);
  return { items: rows.map(serializeSystemLog), ...pageMeta(readCount(totalRows), query.page, query.size) };
}
export type AdminSystemLogEntry = Awaited<ReturnType<typeof listSystemLogs>>['items'][number];

/** 单条详情 + 同一 request_id 的全部行（排障时最需要的是「这一次请求都发生了什么」）。 */
export async function readSystemLog(db: AnyDatabase, id: string) {
  pushSpan({ kind: 'service', name: 'admin.readSystemLog' });
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) throw new AppError('VALIDATION', '日志编号不合法');
  const [row] = await db.select().from(systemLogs).where(eq(systemLogs.id, parsedId.data)).limit(1);
  if (!row) throw new AppError('NOT_FOUND', '日志不存在或已过保留期');
  const related = row.requestId
    ? await db.select(systemLogListColumns).from(systemLogs).where(eq(systemLogs.requestId, row.requestId))
      .orderBy(systemLogs.createdAt, systemLogs.id).limit(50)
    : [];
  return { item: serializeSystemLog(row), related: related.map(serializeSystemLog) };
}
export type AdminSystemLogDetail = Awaited<ReturnType<typeof readSystemLog>>;

const slowQueriesQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  route: z.string().trim().max(160).optional(),
  minDurationMs: z.coerce.number().int().min(0).max(600_000).optional(),
  from: z.iso.date().optional(), to: z.iso.date().optional(),
  ...pageQueryFields,
}).strict().refine((value) => !value.from || !value.to || value.from <= value.to);

export async function listSlowQueries(db: AnyDatabase, input: unknown = {}) {
  pushSpan({ kind: 'service', name: 'admin.listSlowQueries' });
  const query = slowQueriesQuerySchema.parse(input);
  const range = createdRange(query.from, query.to);
  const where = and(
    query.q ? or(ilike(slowQueries.statement, `%${query.q}%`), ilike(slowQueries.route, `%${query.q}%`)) : undefined,
    query.route ? ilike(slowQueries.route, `%${query.route}%`) : undefined,
    query.minDurationMs !== undefined ? gte(slowQueries.durationMs, query.minDurationMs) : undefined,
    range.start ? gte(slowQueries.createdAt, range.start) : undefined,
    range.end ? lt(slowQueries.createdAt, range.end) : undefined,
  );
  const [rows, totalRows] = await Promise.all([
    db.select().from(slowQueries).where(where).orderBy(desc(slowQueries.durationMs), desc(slowQueries.createdAt))
      .limit(query.size).offset(pageOffset(query.page, query.size)),
    db.select({ count: countExpression }).from(slowQueries).where(where),
  ]);
  return {
    items: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    ...pageMeta(readCount(totalRows), query.page, query.size),
  };
}
export type AdminSlowQueryEntry = Awaited<ReturnType<typeof listSlowQueries>>['items'][number];

/**
 * 24 小时 5xx 计数（系统信息页与总览用）。
 * 口径：HTTP 状态码 ≥ 500 的接口错误行；4xx 与限流按设计不落库，因此不计入。
 */
export async function countRecentServerErrors(db: AnyDatabase, now: Date = new Date()): Promise<number> {
  pushSpan({ kind: 'service', name: 'admin.countRecentServerErrors' });
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const rows = await db.select({ count: countExpression }).from(systemLogs)
    .where(and(gte(systemLogs.createdAt, since), gte(systemLogs.status, 500)));
  return readCount(rows);
}
