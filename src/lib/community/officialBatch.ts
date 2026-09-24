import { and, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AnyDatabase } from '@/../db/client';
import { adminAuditLogs, communityOriginals, communityRevisions, communityWorks, officialBatches } from '@/../db/schema';
import type { Actor } from '@/lib/auth/authorization';
import { sanitizeAuditState } from '@/lib/admin/audit';
import { containsPattern, loadPeople, startsWithPattern } from '@/lib/admin/lookups';
import { countExpression, ordered, pageMeta, pageOffset, pageQueryFields, readCount, sortQueryFields } from '@/lib/admin/pagination';
import { AppError } from '@/lib/errors';
import { compatibleBoardProfilesForPalette } from '@/lib/boardProfiles';
import { officialBatchDefaultsSchema } from './batchDefaults';
import { communityPreviewSchema, communitySnapshotSchema, COMMUNITY_LICENSE_VERSION, deriveCommunityPreview, snapshotColorCount, snapshotPaletteIdentity, type CommunitySnapshotV1 } from './snapshot';

const reasonSchema = z.string().trim().min(3).max(500);
const titleSchema = z.string().trim().min(1).max(80);
/** 生成参数 + 可选制作规格（底板 / 色板 / 套装档位）。 */
export const officialBatchDefaultParamsSchema = officialBatchDefaultsSchema;

/** 批次名：新建批次弹窗里起的名字，最多 20 个字。 */
export const officialBatchNameSchema = z.string().trim().min(1).max(20);

export async function createOfficialBatch(db: AnyDatabase, input: {
  actor: Actor; itemCount: number; name?: string; defaultParams: unknown; engineVersion: string; reason: string; requestId: string; now?: Date;
}) {
  if (!Number.isInteger(input.itemCount) || input.itemCount < 1 || input.itemCount > 50) throw new AppError('VALIDATION', '单批文件数需为 1–50');
  if (!input.engineVersion.trim() || input.engineVersion.length > 80) throw new AppError('VALIDATION', '引擎版本无效');
  const defaultParams = officialBatchDefaultParamsSchema.safeParse(input.defaultParams);
  if (!defaultParams.success) throw new AppError('VALIDATION', '批次默认参数无效', 'defaultParams');
  const name = input.name === undefined ? null : officialBatchNameSchema.safeParse(input.name);
  if (name && !name.success) throw new AppError('VALIDATION', '批次名称需为 1–20 个字', 'name');
  const reason = reasonSchema.parse(input.reason);
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [batch] = await tx.insert(officialBatches).values({
      name: name ? name.data : null,
      status: 'running', itemCount: input.itemCount, defaultParams: defaultParams.data,
      engineVersion: input.engineVersion, adminUserId: input.actor.userId,
      startedAt: now, createdAt: now, updatedAt: now,
    }).returning();
    await tx.insert(adminAuditLogs).values({
      actorUserId: input.actor.userId, actorRole: input.actor.role,
      action: 'official.batch_started', targetType: 'official_batch', targetId: batch.id,
      reason, requestId: input.requestId, beforeState: null,
      afterState: sanitizeAuditState({ status: batch.status, version: batch.version }),
    });
    return batch;
  });
}

export async function saveOfficialDraft(db: AnyDatabase, input: {
  actor: Actor; batchId: string; title: string; snapshot: unknown; reason: string; requestId: string; now?: Date;
}) {
  const title = titleSchema.safeParse(input.title);
  const snapshot = communitySnapshotSchema.safeParse(input.snapshot);
  if (!title.success || !snapshot.success) throw new AppError('VALIDATION', '官方草稿标题或图纸无效');
  if (!compatibleBoardProfilesForPalette(snapshot.data.paletteSelection.palette).some((profile) => profile.id === snapshot.data.boardProfile)) {
    throw new AppError('VALIDATION', '官方草稿的制作规格与色板不兼容', 'snapshot');
  }
  const reason = reasonSchema.parse(input.reason);
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [batch] = await tx.select().from(officialBatches).where(eq(officialBatches.id, input.batchId)).for('update');
    if (!batch || batch.adminUserId !== input.actor.userId) throw new AppError('NOT_FOUND', '批次不存在');
    if (!['running', 'paused'].includes(batch.status)) throw new AppError('STATE_CONFLICT', '批次当前不能保存草稿');
    if (batch.successCount >= batch.itemCount) throw new AppError('STATE_CONFLICT', '批次成功项已达到文件总数');
    const [work] = await tx.insert(communityWorks).values({ authorUserId: input.actor.userId, authorType: 'official', createdAt: now, updatedAt: now }).returning();
    const palette = snapshotPaletteIdentity(snapshot.data);
    const [revision] = await tx.insert(communityRevisions).values({
      workId: work.id, revisionNumber: 1, status: 'draft', title: title.data,
      authorType: 'official', publicAuthorId: 'beadhue-official', frozenDisplayName: '豆色绘官方',
      officialBatchId: batch.id, licenseVersion: COMMUNITY_LICENSE_VERSION, licenseConfirmedAt: now,
      engineVersion: snapshot.data.engineVersion, boardProfile: snapshot.data.boardProfile,
      paletteKind: palette.kind, paletteId: palette.id,
      width: snapshot.data.pattern.width, height: snapshot.data.pattern.height,
      colorCount: snapshotColorCount(snapshot.data), snapshot: snapshot.data,
      preview: deriveCommunityPreview(snapshot.data.pattern), createdAt: now, updatedAt: now,
    }).returning();
    await tx.update(officialBatches).set({ successCount: sql`${officialBatches.successCount} + 1`, updatedAt: now })
      .where(eq(officialBatches.id, batch.id));
    await tx.insert(adminAuditLogs).values({
      actorUserId: input.actor.userId, actorRole: input.actor.role,
      action: 'official.draft_saved', targetType: 'community_revision', targetId: revision.id,
      reason, requestId: input.requestId, beforeState: null,
      afterState: sanitizeAuditState({ revisionStatus: revision.status, revision: revision.version }),
    });
    return { batchId: batch.id, workId: work.id, revisionId: revision.id, version: revision.version, status: revision.status };
  });
}

/**
 * 未发布官方草稿原地修订（ADR-0024）：修订号、原图绑定与批次成功数都不变，
 * 只覆盖标题与图纸列并递增修订版本号；已发布修订继续遵守 ADR-0015 的不可变约束。
 */
export async function reviseOfficialDraft(db: AnyDatabase, input: {
  actor: Actor; batchId: string; revisionId: string; expectedVersion: number;
  title?: string; snapshot?: unknown; reason: string; requestId: string; now?: Date;
}) {
  let nextTitle: string | null = null;
  if (input.title !== undefined) {
    const parsed = titleSchema.safeParse(input.title);
    if (!parsed.success) throw new AppError('VALIDATION', '官方草稿标题无效', 'title');
    nextTitle = parsed.data;
  }
  let nextSnapshot: CommunitySnapshotV1 | null = null;
  if (input.snapshot !== undefined) {
    const parsed = communitySnapshotSchema.safeParse(input.snapshot);
    if (!parsed.success) throw new AppError('VALIDATION', '官方草稿图纸无效', 'snapshot');
    nextSnapshot = parsed.data;
  }
  if (nextTitle === null && nextSnapshot === null) throw new AppError('VALIDATION', '草稿修订内容为空');
  if (nextSnapshot && !compatibleBoardProfilesForPalette(nextSnapshot.paletteSelection.palette).some((profile) => profile.id === nextSnapshot.boardProfile)) {
    throw new AppError('VALIDATION', '官方草稿的制作规格与色板不兼容', 'snapshot');
  }
  const palette = nextSnapshot ? snapshotPaletteIdentity(nextSnapshot) : null;
  const reason = reasonSchema.parse(input.reason);
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [batch] = await tx.select().from(officialBatches).where(eq(officialBatches.id, input.batchId)).for('update');
    if (!batch || batch.adminUserId !== input.actor.userId) throw new AppError('NOT_FOUND', '批次不存在');
    const [revision] = await tx.select().from(communityRevisions).where(eq(communityRevisions.id, input.revisionId)).for('update');
    if (!revision || revision.officialBatchId !== batch.id) throw new AppError('NOT_FOUND', '草稿不存在');
    if (revision.authorType !== 'official' || revision.status !== 'draft') throw new AppError('STATE_CONFLICT', '只能修订未发布的官方草稿');
    const [work] = await tx.select({ id: communityWorks.id, currentPublishedRevisionId: communityWorks.currentPublishedRevisionId })
      .from(communityWorks).where(eq(communityWorks.id, revision.workId)).for('update');
    if (!work) throw new AppError('NOT_FOUND', '草稿不存在');
    // 作品已经指向公开修订时，草稿不能再被静默改写，否则公开内容与审核结论会脱钩。
    if (work.currentPublishedRevisionId !== null) throw new AppError('STATE_CONFLICT', '该草稿所属作品已发布，不能再原地修订');
    if (revision.version !== input.expectedVersion) throw new AppError('STATE_CONFLICT', '草稿版本已变化，请刷新后重试');
    const [updated] = await tx.update(communityRevisions).set({
      ...(nextTitle !== null ? { title: nextTitle } : {}),
      ...(nextSnapshot !== null && palette ? {
        engineVersion: nextSnapshot.engineVersion, boardProfile: nextSnapshot.boardProfile,
        paletteKind: palette.kind, paletteId: palette.id,
        width: nextSnapshot.pattern.width, height: nextSnapshot.pattern.height,
        colorCount: snapshotColorCount(nextSnapshot), snapshot: nextSnapshot,
        preview: deriveCommunityPreview(nextSnapshot.pattern),
      } : {}),
      version: revision.version + 1, updatedAt: now,
    }).where(and(eq(communityRevisions.id, revision.id), eq(communityRevisions.version, revision.version))).returning();
    if (!updated) throw new AppError('STATE_CONFLICT', '草稿版本已变化，请刷新后重试');
    // 审计只记录状态与版本，标题文本不入库（sanitizeAuditState 白名单同样会过滤）。
    await tx.insert(adminAuditLogs).values({
      actorUserId: input.actor.userId, actorRole: input.actor.role,
      action: 'official.draft_revised', targetType: 'community_revision', targetId: revision.id,
      reason, requestId: input.requestId,
      beforeState: sanitizeAuditState({ revisionStatus: revision.status, revision: revision.version }),
      afterState: sanitizeAuditState({ revisionStatus: updated.status, revision: updated.version }),
    });
    return { revisionId: updated.id, workId: updated.workId, version: updated.version, status: updated.status, title: updated.title };
  });
}

export async function transitionOfficialBatch(db: AnyDatabase, input: {
  actor: Actor; batchId: string; action: 'pause' | 'resume' | 'cancel' | 'finish'; expectedVersion: number;
  reason: string; requestId: string; now?: Date;
}) {
  const reason = reasonSchema.parse(input.reason);
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [batch] = await tx.select().from(officialBatches).where(eq(officialBatches.id, input.batchId)).for('update');
    if (!batch || batch.adminUserId !== input.actor.userId) throw new AppError('NOT_FOUND', '批次不存在');
    if (batch.version !== input.expectedVersion) throw new AppError('STATE_CONFLICT', '批次版本已变化');
    const next = input.action === 'pause' ? 'paused' : input.action === 'resume' ? 'running' : input.action === 'finish' ? 'completed' : 'cancelled';
    const allowed = (input.action === 'pause' && batch.status === 'running')
      || (input.action === 'resume' && (batch.status === 'paused'
        || (['completed', 'cancelled'].includes(batch.status) && batch.successCount < batch.itemCount)))
      || (input.action === 'finish' && ['running', 'paused'].includes(batch.status))
      || (input.action === 'cancel' && ['running', 'paused'].includes(batch.status));
    if (!allowed) throw new AppError('STATE_CONFLICT', '批次状态不能执行此操作');
    const [updated] = await tx.update(officialBatches).set({
      status: next, version: batch.version + 1, updatedAt: now,
      completedAt: ['cancelled', 'completed'].includes(next) ? now : null,
      failureCount: ['cancelled', 'completed'].includes(next) ? Math.max(0, batch.itemCount - batch.successCount) : 0,
    }).where(and(eq(officialBatches.id, batch.id), eq(officialBatches.version, batch.version))).returning();
    await tx.insert(adminAuditLogs).values({
      actorUserId: input.actor.userId, actorRole: input.actor.role,
      action: `official.batch_${input.action}`, targetType: 'official_batch', targetId: batch.id,
      reason, requestId: input.requestId,
      beforeState: sanitizeAuditState({ status: batch.status, version: batch.version }),
      afterState: sanitizeAuditState({ status: updated.status, version: updated.version }),
    });
    return updated;
  });
}

export async function publishOfficialBatch(db: AnyDatabase, input: {
  actor: Actor; batchId: string; revisionIds: string[]; expectedVersion: number;
  reason: string; requestId: string; now?: Date;
}) {
  const revisionIds = [...new Set(input.revisionIds)];
  if (revisionIds.length < 1 || revisionIds.length > 50) throw new AppError('VALIDATION', '请选择 1–50 个合法官方草稿');
  const reason = reasonSchema.parse(input.reason);
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [batch] = await tx.select().from(officialBatches).where(eq(officialBatches.id, input.batchId)).for('update');
    if (!batch || batch.adminUserId !== input.actor.userId) throw new AppError('NOT_FOUND', '批次不存在');
    if (batch.version !== input.expectedVersion) throw new AppError('STATE_CONFLICT', '批次状态已变化');
    // 下架按 work → revision 加锁；发布必须同序，并在取得锁后重新校验草稿。
    await tx.select({ id: communityWorks.id }).from(communityWorks).where(inArray(communityWorks.id,
      tx.select({ workId: communityRevisions.workId }).from(communityRevisions).where(and(
        eq(communityRevisions.officialBatchId, batch.id), inArray(communityRevisions.id, revisionIds),
      )),
    )).orderBy(communityWorks.id).for('update');
    const drafts = await tx.select().from(communityRevisions).where(and(
      eq(communityRevisions.officialBatchId, batch.id), eq(communityRevisions.status, 'draft'),
      eq(communityRevisions.authorType, 'official'), inArray(communityRevisions.id, revisionIds),
    )).orderBy(communityRevisions.id).for('update');
    if (drafts.length !== revisionIds.length) throw new AppError('STATE_CONFLICT', '所选草稿包含无效或已发布项目');
    // 官方作品同样受 D49 约束：没有原图的草稿不能公开。
    const originals = await tx.select({ revisionId: communityOriginals.revisionId }).from(communityOriginals)
      .where(and(inArray(communityOriginals.revisionId, revisionIds), isNull(communityOriginals.deletedAt)));
    const withOriginal = new Set(originals.map((row) => row.revisionId));
    const missing = drafts.filter((draft) => !withOriginal.has(draft.id));
    if (missing.length > 0) throw new AppError('ORIGINAL_REQUIRED', `有 ${missing.length} 个草稿尚未上传原图，请先重试上传`);
    for (const draft of drafts) {
      await tx.update(communityRevisions).set({
        status: 'published', version: draft.version + 1, reviewedAt: now,
        reviewedByUserId: input.actor.userId, reviewReason: reason, publishedAt: now, updatedAt: now,
      }).where(eq(communityRevisions.id, draft.id));
      await tx.update(communityWorks).set({ currentPublishedRevisionId: draft.id, version: sql`${communityWorks.version} + 1`, updatedAt: now })
        .where(eq(communityWorks.id, draft.workId));
      await tx.insert(adminAuditLogs).values({
        actorUserId: input.actor.userId, actorRole: input.actor.role,
        action: 'official.revision_published', targetType: 'community_revision', targetId: draft.id,
        reason, requestId: input.requestId,
        beforeState: sanitizeAuditState({ revisionStatus: draft.status, revision: draft.version }),
        afterState: sanitizeAuditState({ revisionStatus: 'published', revision: draft.version + 1 }),
      });
    }
    // 发布只消耗所选草稿；生成未结束时仍可保存、重试，取消也不丢弃已保存草稿。
    const [updated] = await tx.update(officialBatches).set({
      version: batch.version + 1, updatedAt: now,
    }).where(eq(officialBatches.id, batch.id)).returning();
    return { batch: updated, publishedRevisionIds: revisionIds };
  });
}

/** 后台批次历史分页参数（admin-round-3 06）。 */
const batchesQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(['running', 'paused', 'completed', 'cancelled']).optional(),
  ...sortQueryFields(['created']),
  ...pageQueryFields,
}).strict();

/**
 * 批次历史：所有管理员的批次都列出（带创建人），只有创建人能继续处理自己的批次（mine）。
 * 搜索批次名称或编号开头，按状态筛选。
 */
export async function listOfficialBatches(db: AnyDatabase, actorUserId: string, input: unknown = {}) {
  const query = batchesQuerySchema.parse(input);
  const where = and(
    query.status ? eq(officialBatches.status, query.status) : undefined,
    query.q ? or(ilike(officialBatches.name, containsPattern(query.q)), sql`${officialBatches.id}::text ilike ${startsWithPattern(query.q)}`) : undefined,
  );
  const [batches, totalRows] = await Promise.all([
    db.select().from(officialBatches).where(where)
      .orderBy(ordered(officialBatches.createdAt, query.order ?? 'desc'), ordered(officialBatches.id, query.order ?? 'desc'))
      .limit(query.size).offset(pageOffset(query.page, query.size)),
    db.select({ count: countExpression }).from(officialBatches).where(where),
  ]);
  const total = readCount(totalRows);
  if (batches.length === 0) return { items: [], ...pageMeta(total, query.page, query.size) };
  const revisions = await db.select({
    id: communityRevisions.id, workId: communityRevisions.workId, officialBatchId: communityRevisions.officialBatchId,
    title: communityRevisions.title, status: communityRevisions.status, version: communityRevisions.version,
    preview: communityRevisions.preview, width: communityRevisions.width, height: communityRevisions.height,
  }).from(communityRevisions).where(inArray(communityRevisions.officialBatchId, batches.map((batch) => batch.id)));
  const withOriginal = revisions.length === 0 ? new Set<string>() : new Set((await db.select({ revisionId: communityOriginals.revisionId }).from(communityOriginals)
    .where(and(inArray(communityOriginals.revisionId, revisions.map((revision) => revision.id)), isNull(communityOriginals.deletedAt)))).map((row) => row.revisionId));
  const people = await loadPeople(db, batches.map((batch) => batch.adminUserId));
  const items = batches.map(({ adminUserId, ...batch }) => ({
    ...batch, defaultParams: batch.defaultParams,
    creator: adminUserId ? people.get(adminUserId) ?? null : null,
    mine: adminUserId === actorUserId,
    startedAt: batch.startedAt?.toISOString() ?? null, completedAt: batch.completedAt?.toISOString() ?? null,
    createdAt: batch.createdAt.toISOString(), updatedAt: batch.updatedAt.toISOString(),
    drafts: revisions.filter((revision) => revision.officialBatchId === batch.id).flatMap((revision) => {
      const preview = communityPreviewSchema.safeParse(revision.preview);
      return preview.success ? [{ ...revision, hasOriginal: withOriginal.has(revision.id), preview: preview.data }] : [];
    }),
  }));
  return { items, ...pageMeta(total, query.page, query.size) };
}
