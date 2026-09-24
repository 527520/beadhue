import { and, desc, eq, gte, ilike, inArray, isNotNull, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AnyDatabase } from '@/../db/client';
import { adminAuditLogs, maintenanceRuns, slowQueries, systemLogs, users } from '@/../db/schema';
import { APP_VERSION } from '@/lib/appInfo';
import { countExpression, ordered, pageMeta, pageOffset, pageQueryFields, readCount, sortQueryFields } from '@/lib/admin/pagination';
import { maskEmailForPublic } from '@/lib/identity/publicAuthor';
import { pushSpan } from '@/lib/observability/context';
import migrationJournal from '@/../db/migrations/meta/_journal.json';
import { AppError } from '@/lib/errors';
import { zhCN } from '@/messages/zh-CN';
import { sanitizeAuditState } from './audit';
import { containsPattern, excerpt, loadBatchLabels, loadCommentLabels, loadPeople, loadReportTargets, loadRevisionLabels, loadTagNames, loadWorkLabels } from './lookups';

const usersQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  role: z.enum(['user', 'moderator', 'admin']).optional(),
  accountStatus: z.enum(['active', 'suspended', 'anonymized']).optional(),
  ...sortQueryFields(['works', 'joined']),
  ...pageQueryFields,
}).strict();

export async function listGovernedUsers(db: AnyDatabase, input: unknown = {}) {
  pushSpan({ kind: 'service', name: 'admin.listGovernedUsers' });
  const query = usersQuerySchema.parse(input);
  const q = query.q?.trim().slice(0, 80);
  const where = and(
    q ? or(ilike(users.email, `%${q}%`), ilike(users.username, `%${q}%`), sql`${users.id}::text = ${q}`) : undefined,
    query.role ? eq(users.role, query.role) : undefined,
    query.accountStatus ? eq(users.accountStatus, query.accountStatus) : undefined,
  );
  // 作品 / 获赞 / 评论与最近活跃（最近一次登录或保存设计）：一页最多 100 行，用关联子查询即可。
  // 子查询里外层列必须写全名：drizzle 在 SELECT 列表里把 ${users.id} 渲染成不带表名的 "id"，会被解析成子查询表自己的 id。
  const workCount = sql<number>`(select count(*) from community_works cw where cw.author_user_id = "users"."id" and cw.author_type = 'user')`.mapWith(Number);
  const likeCount = sql<number>`(select coalesce(sum(cw.like_count), 0) from community_works cw where cw.author_user_id = "users"."id" and cw.author_type = 'user')`.mapWith(Number);
  const commentCount = sql<number>`(select count(*) from community_comments cc where cc.author_user_id = "users"."id" and cc.deleted_at is null)`.mapWith(Number);
  const lastActiveAt = sql<string | null>`greatest((select max(s.created_at) from sessions s where s.user_id = "users"."id"), (select max(d.updated_at) from designs d where d.user_id = "users"."id"))`;
  const [rows, totalRows] = await Promise.all([
    db.select({
      id: users.id, email: users.email, username: users.username, role: users.role,
      accountStatus: users.accountStatus, governanceVersion: users.governanceVersion,
      emailVerifiedAt: users.emailVerifiedAt, createdAt: users.createdAt,
      publicAuthorId: users.publicAuthorId, avatarColor: users.avatarColor,
      workCount, likeCount, commentCount, lastActiveAt,
    }).from(users).where(where)
      .orderBy(...(query.sort === 'works' ? [ordered(workCount, query.order ?? 'desc')] : []), ordered(users.createdAt, query.sort === 'joined' ? query.order ?? 'desc' : 'desc'), desc(users.id))
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
    avatar: { id: row.publicAuthorId ?? row.id, color: row.accountStatus === 'anonymized' ? null : row.avatarColor },
    stats: { works: row.workCount, likes: row.likeCount, comments: row.commentCount, lastActiveAt: row.lastActiveAt ? new Date(row.lastActiveAt).toISOString() : null },
  }));
  return { items, ...pageMeta(readCount(totalRows), query.page, query.size) };
}

const commaList = (item: z.ZodType<string, string>) => z.string().max(4000).transform((value) => value.split(',').filter(Boolean)).pipe(z.array(item).max(100)).optional();
const auditQuerySchema = z.object({
  q: z.string().trim().max(120).optional(), from: z.iso.date().optional(), to: z.iso.date().optional(),
  /** 动作（逗号分隔的动作键）与操作人（逗号分隔的账号编号），多选。 */
  action: commaList(z.string().min(1).max(80)), actor: commaList(z.uuid()),
  ...sortQueryFields(['time']),
  ...pageQueryFields,
}).strict().refine((value) => !value.from || !value.to || value.from <= value.to);

/** 审计对象的可读名称（作品标题、评论开头、账号名、标签名、批次名）；查不到（已删除等）为 null。 */
async function auditTargetNames(db: AnyDatabase, rows: Array<{ targetType: string; targetId: string }>): Promise<Map<string, { name: string | null; revisionNumber?: number }>> {
  // 目标编号是文本列，个别历史记录不是 UUID；只查合法的，免得 uuid 列比较直接报错。
  const of = (type: string) => rows.filter((row) => row.targetType === type && z.uuid().safeParse(row.targetId).success).map((row) => row.targetId);
  const reports = await loadReportTargets(db, of('community_report'));
  const reported = [...reports.values()];
  const [works, revisions, comments, people, tags, batches] = await Promise.all([
    loadWorkLabels(db, [...of('community_work'), ...reported.filter((item) => item.targetType === 'work').map((item) => item.targetId)]),
    loadRevisionLabels(db, of('community_revision')),
    loadCommentLabels(db, [...of('community_comment'), ...reported.filter((item) => item.targetType === 'comment').map((item) => item.targetId)]),
    loadPeople(db, of('user')),
    loadTagNames(db, of('community_tag')),
    loadBatchLabels(db, of('official_batch')),
  ]);
  const names = new Map<string, { name: string | null; revisionNumber?: number }>();
  for (const row of rows) {
    const key = `${row.targetType}:${row.targetId}`;
    const id = row.targetId;
    switch (row.targetType) {
      case 'community_work': names.set(key, { name: works.get(id)?.title ?? null }); break;
      case 'community_revision': { const revision = revisions.get(id); names.set(key, { name: revision?.title ?? null, revisionNumber: revision?.revisionNumber }); break; }
      case 'community_comment': { const comment = comments.get(id); names.set(key, { name: comment ? excerpt(comment.body, 24) : null }); break; }
      case 'community_report': {
        const target = reports.get(id);
        const name = target?.targetType === 'work' ? works.get(target.targetId)?.title : target ? comments.get(target.targetId)?.body : undefined;
        names.set(key, { name: name ? excerpt(name, 24) : null });
        break;
      }
      case 'user': names.set(key, { name: people.get(id)?.name ?? null }); break;
      case 'community_tag': names.set(key, { name: tags.get(id) ?? null }); break;
      case 'official_batch': names.set(key, { name: batches.get(id)?.name ?? null }); break;
      default: names.set(key, { name: null });
    }
  }
  return names;
}

export async function listAdminAudit(db: AnyDatabase, input: unknown = {}) {
  pushSpan({ kind: 'service', name: 'admin.listAdminAudit' });
  const query = auditQuerySchema.parse(input);
  const pattern = query.q ? containsPattern(query.q) : null;
  // 动作按中文名也能搜：「精选」命中 community.work_feature 等。
  const labelled = query.q ? Object.entries(zhCN.communityAdmin.audit.actions).filter(([, label]) => label.includes(query.q!)).map(([key]) => key) : [];
  const where = and(
    pattern ? or(
      ilike(adminAuditLogs.action, pattern), ilike(adminAuditLogs.targetId, pattern), ilike(adminAuditLogs.requestId, pattern),
      labelled.length ? inArray(adminAuditLogs.action, labelled) : undefined,
      sql`exists (select 1 from users au where au.id = ${adminAuditLogs.actorUserId} and au.username ilike ${pattern})`,
    ) : undefined,
    query.action?.length ? inArray(adminAuditLogs.action, query.action) : undefined,
    query.actor?.length ? inArray(adminAuditLogs.actorUserId, query.actor) : undefined,
    query.from ? gte(adminAuditLogs.createdAt, new Date(`${query.from}T00:00:00+08:00`)) : undefined,
    query.to ? lt(adminAuditLogs.createdAt, new Date(new Date(`${query.to}T00:00:00+08:00`).getTime() + 86400000)) : undefined,
  );
  const [rows, totalRows] = await Promise.all([
    db.select().from(adminAuditLogs).where(where).orderBy(ordered(adminAuditLogs.createdAt, query.order ?? 'desc'), ordered(adminAuditLogs.id, query.order ?? 'desc'))
      .limit(query.size).offset(pageOffset(query.page, query.size)),
    db.select({ count: countExpression }).from(adminAuditLogs).where(where),
  ]);
  const [people, targets] = await Promise.all([loadPeople(db, rows.map((row) => row.actorUserId)), auditTargetNames(db, rows)]);
  return {
    items: rows.map((row) => ({
      ...row, beforeState: sanitizeAuditState(row.beforeState), afterState: sanitizeAuditState(row.afterState), createdAt: row.createdAt.toISOString(),
      actor: row.actorUserId ? people.get(row.actorUserId) ?? null : null,
      target: targets.get(`${row.targetType}:${row.targetId}`) ?? { name: null },
    })),
    ...pageMeta(readCount(totalRows), query.page, query.size),
  };
}

/** 审计「操作人」筛选的候选：在记录里出现过的后台账号。 */
export async function listAuditActors(db: AnyDatabase) {
  const rows = await db.selectDistinct({ userId: adminAuditLogs.actorUserId }).from(adminAuditLogs).where(isNotNull(adminAuditLogs.actorUserId)).limit(200);
  const people = await loadPeople(db, rows.map((row) => row.userId));
  return rows.flatMap((row) => (row.userId && people.has(row.userId) ? [{ userId: row.userId, ...people.get(row.userId)! }] : []))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
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
  // tag：数据库里最后一条已执行迁移对应的迁移文件名（如 0021_account_profile_and_batch_names），界面大字取其序号。
  let databaseMigration: { id: number | null; tag: string | null; appliedAt: string | null; journalTimestamp: string | null; status: 'recorded' | 'unavailable' } = { id: null, tag: null, appliedAt: null, journalTimestamp: null, status: 'unavailable' };
  const rowsOf = <T>(result: unknown): T[] => (result as { rows?: T[] }).rows ?? (result as T[]);
  const missingTable = (error: unknown) => {
    const failure = error as { code?: string; cause?: { code?: string } };
    return (failure.code ?? failure.cause?.code) === '42P01';
  };
  try {
    const [row] = rowsOf<{ id: number; hash: string; created_at: number }>(await db.execute(sql`select id, hash, created_at from drizzle.__drizzle_migrations order by created_at desc, id desc limit 1`));
    // Drizzle stores journalEntry.when, not wall-clock migration execution time.
    if (row) {
      const [evidence] = await db.select({ completedAt: maintenanceRuns.completedAt }).from(maintenanceRuns).where(and(
        eq(maintenanceRuns.task, 'database.migrate'), eq(maintenanceRuns.status, 'succeeded'), eq(maintenanceRuns.cursor, String(row.id)),
        sql`${maintenanceRuns.summary}->>'journalTimestamp' = ${String(row.created_at)}`, sql`${maintenanceRuns.summary}->>'hash' = ${row.hash}`,
      )).orderBy(desc(maintenanceRuns.completedAt), desc(maintenanceRuns.id)).limit(1);
      const tag = migrationJournal.entries.find((entry) => entry.when === Number(row.created_at))?.tag ?? null;
      databaseMigration = { id: Number(row.id), tag, appliedAt: evidence?.completedAt?.toISOString() ?? null, journalTimestamp: new Date(Number(row.created_at)).toISOString(), status: 'recorded' };
    }
  } catch (error) {
    if (!missingTable(error)) throw error;
    // 开发 / E2E 的进程内 PGlite 用 _doupu_migrations 记账（见 lib/auth/db.ts），执行时间就是真实时间。
    try {
      const [row] = rowsOf<{ name: string; applied_at: string | Date }>(await db.execute(sql`select name, applied_at from _doupu_migrations order by name desc limit 1`));
      if (row) databaseMigration = { id: null, tag: row.name.replace(/\.sql$/u, ''), appliedAt: new Date(row.applied_at).toISOString(), journalTimestamp: null, status: 'recorded' };
    } catch (fallbackError) {
      if (!missingTable(fallbackError)) throw fallbackError;
    }
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
  ...sortQueryFields(['time']),
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
    db.select(systemLogListColumns).from(systemLogs).where(where).orderBy(ordered(systemLogs.createdAt, query.order ?? 'desc'), ordered(systemLogs.id, query.order ?? 'desc'))
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
  ...sortQueryFields(['duration']),
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
    db.select().from(slowQueries).where(where).orderBy(ordered(slowQueries.durationMs, query.order ?? 'desc'), desc(slowQueries.createdAt))
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
