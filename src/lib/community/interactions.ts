import { lockOriginalReferences } from '@/lib/originals/lock';
import { config } from '@/lib/config';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, ilike, inArray, isNull, or, sql, type Column, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { AnyDatabase } from '@/../db/client';
import {
  adminAuditLogs,
  commentModerationChecks,
  communityComments,
  communityLikes,
  communityOriginals,
  originalAssets,
  originalGarbage,
  communityReports,
  communityReuses,
  communityRevisions,
  communityWorks,
  designs,
  users,
} from '@/../db/schema';
import type { Actor } from '@/lib/auth/authorization';
import { lockActiveAccount } from '@/lib/auth/writeAccess';
import { resolvePublicDisplayName, ANONYMIZED_DISPLAY_NAME } from '@/lib/identity/publicAuthor';
import { sanitizeAuditState } from '@/lib/admin/audit';
import { containsPattern, excerpt, loadCommentLabels, loadPeople, loadWorkLabels, startsWithPattern, type AdminPerson } from '@/lib/admin/lookups';
import { zhCN } from '@/messages/zh-CN';
import { countExpression, pageMeta, pageOffset, pageQueryFields, readCount } from '@/lib/admin/pagination';
import { AppError } from '@/lib/errors';
import type { ProjectFile } from '@/lib/types';
import { assertDesignQuota, lockDesignStorage } from '@/lib/sync/designQuota';
import { measureJsonBytes } from '@/lib/sync/revision';
import { moderateComment, type CommentModerationDeps } from '@/lib/moderation/commentModeration';
import { E2E_MODERATION_DEPS, isE2eModerationEnabled } from '@/lib/moderation/e2eFake';
import { parseCommunitySnapshot } from './snapshot';
import { signCursor, verifyCursor } from '@/lib/security/cursor';
import { notifyWorkCommented } from '@/lib/notifications/service';

const commentBodySchema = z.string().trim().min(1).max(500);
const reasonSchema = z.string().trim().min(3).max(500);
export const reportCategorySchema = z.enum(['harm', 'harassment', 'sexual', 'spam', 'copyright', 'other']);

async function activeWork(tx: AnyDatabase, workId: string, lock = false) {
  const query = tx.select().from(communityWorks).where(eq(communityWorks.id, workId));
  const [work] = lock ? await query.for('update') : await query;
  if (!work || work.lifecycleStatus !== 'active' || !work.currentPublishedRevisionId) {
    throw new AppError('NOT_FOUND', '作品不存在');
  }
  return work;
}

/** 评论版本可变，但所属作品不可变；先锁作品再锁评论，和注销计数清理一致。 */
async function lockCommentWork(tx: AnyDatabase, commentId: string) {
  const [target] = await tx.select({ workId: communityComments.workId }).from(communityComments)
    .where(eq(communityComments.id, commentId));
  if (target) await tx.select({ id: communityWorks.id }).from(communityWorks)
    .where(eq(communityWorks.id, target.workId)).for('update');
}

async function commentIdentity(tx: AnyDatabase, actor: Actor) {
  const [user] = await tx.select({
    email: users.email,
    username: users.username,
    publicAuthorId: users.publicAuthorId,
    accountStatus: users.accountStatus,
  }).from(users).where(eq(users.id, actor.userId)).for('no key update');
  if (!user || user.accountStatus !== 'active' || !user.email) throw new AppError('FORBIDDEN', '账号当前不可用');
  const publicAuthorId = user.publicAuthorId ?? randomUUID();
  if (!user.publicAuthorId) {
    await tx.update(users).set({ publicAuthorId, updatedAt: new Date() }).where(eq(users.id, actor.userId));
  }
  return { publicAuthorId, displayName: resolvePublicDisplayName(user.username, user.email) };
}

/** 测试与运维接缝：替换内容安全服务调用（缺省走真实腾讯云；E2E 种子环境走确定性假服务）。 */
let moderationDeps: CommentModerationDeps | null = null;
export function setCommentModerationDeps(deps: CommentModerationDeps): void { moderationDeps = deps; }
function resolveModerationDeps(): CommentModerationDeps {
  return moderationDeps ?? (isE2eModerationEnabled() ? E2E_MODERATION_DEPS : {});
}

export async function getCommunityLike(db: AnyDatabase, input: { workId: string; userId?: string }) {
  const work = await activeWork(db, input.workId);
  const likes = input.userId ? await db.select({ workId: communityLikes.workId }).from(communityLikes)
    .where(and(eq(communityLikes.workId, work.id), eq(communityLikes.userId, input.userId))).limit(1) : [];
  return { liked: likes.length > 0, likeCount: work.likeCount };
}

export async function setCommunityLike(db: AnyDatabase, input: { actor: Actor; workId: string; liked: boolean }) {
  return db.transaction(async (tx) => {
    await lockActiveAccount(tx, input.actor.userId, 'community:interact');
    const work = await activeWork(tx, input.workId, true);
    if (input.liked) {
      const inserted = await tx.insert(communityLikes).values({ workId: work.id, userId: input.actor.userId })
        .onConflictDoNothing().returning();
      if (inserted.length > 0) {
        const [updated] = await tx.update(communityWorks).set({
          likeCount: sql`${communityWorks.likeCount} + 1`, updatedAt: new Date(),
        }).where(eq(communityWorks.id, work.id)).returning();
        return { liked: true, likeCount: updated.likeCount };
      }
    } else {
      const removed = await tx.delete(communityLikes).where(and(
        eq(communityLikes.workId, work.id), eq(communityLikes.userId, input.actor.userId),
      )).returning();
      if (removed.length > 0) {
        const [updated] = await tx.update(communityWorks).set({
          likeCount: sql`greatest(0, ${communityWorks.likeCount} - 1)`, updatedAt: new Date(),
        }).where(eq(communityWorks.id, work.id)).returning();
        return { liked: false, likeCount: updated.likeCount };
      }
    }
    return { liked: input.liked, likeCount: work.likeCount };
  });
}

export async function reuseCommunityWork(db: AnyDatabase, input: { actor: Actor; workId: string; now?: Date }) {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    await lockDesignStorage(tx, input.actor.userId, now);
    const work = await activeWork(tx, input.workId, true);
    const [revision] = await tx.select().from(communityRevisions)
      .where(eq(communityRevisions.id, work.currentPublishedRevisionId!));
    const snapshot = parseCommunitySnapshot(revision?.snapshot);
    if (!revision || revision.status !== 'published' || !snapshot) throw new AppError('STATE_CONFLICT', '公开修订已变化');
    const designId = randomUUID();
    await lockOriginalReferences(tx);
    const [sourceOriginal] = await tx.select().from(communityOriginals).where(and(eq(communityOriginals.revisionId, revision.id), isNull(communityOriginals.deletedAt), isNull(communityOriginals.blockedAt)));
    let privateOriginal: ProjectFile['original'];
    const sourceGeometry = snapshot.original?.sha256 === sourceOriginal?.sha256 ? snapshot.original : undefined;
    const originalWidth = sourceOriginal?.width ?? sourceGeometry?.width;
    const originalHeight = sourceOriginal?.height ?? sourceGeometry?.height;
    if (sourceOriginal) {
      let [asset] = await tx.select().from(originalAssets).where(and(eq(originalAssets.userId, input.actor.userId), eq(originalAssets.sha256, sourceOriginal.sha256)));
      if (!asset || asset.deletedAt) {
        const [usage] = await tx.select({ bytes: sql<string>`coalesce(sum(${originalAssets.byteSize}),0)` }).from(originalAssets).where(and(eq(originalAssets.userId,input.actor.userId),isNull(originalAssets.deletedAt)));
        if (Number(usage.bytes) + sourceOriginal.byteSize > config.security.originalQuotaBytes) throw new AppError('CONFLICT','原图空间不足，请清理后再引用','originalQuota');
        if(asset && asset.cosKey !== sourceOriginal.cosKey) await tx.insert(originalGarbage).values({cosKey:asset.cosKey}).onConflictDoNothing();
        [asset] = await tx.insert(originalAssets).values({userId:input.actor.userId,sha256:sourceOriginal.sha256,cosKey:sourceOriginal.cosKey,mimeType:sourceOriginal.mimeType,byteSize:sourceOriginal.byteSize,width:sourceOriginal.width,height:sourceOriginal.height}).onConflictDoUpdate({target:[originalAssets.userId,originalAssets.sha256],set:{cosKey:sourceOriginal.cosKey,deletedAt:null,createdAt:now}}).returning();
      }
      privateOriginal = { assetId: asset.id, sha256: asset.sha256, width: originalWidth, height: originalHeight, geometry: snapshot.original?.sha256 === asset.sha256 ? snapshot.original.geometry : undefined };
    }
    const project: ProjectFile = {
      ...(privateOriginal ? {original:privateOriginal} : {}),
      format: 'beadhue-project', version: 3,
      communityOrigin: true,
      engineVersion: snapshot.engineVersion,
      boardProfile: snapshot.boardProfile,
      name: `${revision.title}（引用）`,
      createdAt: now.toISOString(), updatedAt: now.toISOString(),
      paletteSelection: snapshot.paletteSelection,
      params: snapshot.params,
      pattern: snapshot.pattern,
    };
    const payloadBytes = measureJsonBytes(project);
    await assertDesignQuota(tx, input.actor.userId, payloadBytes);
    await tx.insert(designs).values({
      id: designId, userId: input.actor.userId, name: project.name, project,
      payloadBytes, revision: 1,
      communitySourceWorkId: work.id, communitySourceRevisionId: revision.id,
      updatedAt: now,
    });
    await tx.insert(communityReuses).values({
      workId: work.id, revisionId: revision.id, userId: input.actor.userId, designId, createdAt: now,
    });
    const [updated] = await tx.update(communityWorks).set({
      reuseCount: sql`${communityWorks.reuseCount} + 1`, updatedAt: now,
    }).where(eq(communityWorks.id, work.id)).returning();
    // 引用者从此刻起可取回该修订的原图（D49）；客户端据此决定是否拉取并注入工作台。
    const [original] = await tx.select({ id: communityOriginals.id }).from(communityOriginals)
      .where(and(eq(communityOriginals.revisionId, revision.id), isNull(communityOriginals.deletedAt), isNull(communityOriginals.blockedAt))).limit(1);
    return { designId, workId: work.id, revisionId: revision.id, reuseCount: updated.reuseCount, originalAvailable: Boolean(original) };
  });
}

export async function createCommunityComment(db: AnyDatabase, input: {
  actor: Actor; workId: string; body: string; now?: Date; ip?: string | null;
}) {
  const body = commentBodySchema.safeParse(input.body);
  if (!body.success) throw new AppError('VALIDATION', '评论需为 1–500 个字符', 'body');
  const now = input.now ?? new Date();
  // 判定记录必须在事务提交后仍然存在：拒绝 / 限流的错误在事务外抛出。
  const outcome = await db.transaction(async (tx) => {
    await lockActiveAccount(tx, input.actor.userId, 'community:interact');
    const work = await activeWork(tx, input.workId, true);
    if (work.commentsLocked) throw new AppError('COMMENTS_LOCKED', '作品评论已锁定');
    const identity = await commentIdentity(tx, input.actor);
    const moderation = await moderateComment(tx, { userId: input.actor.userId, publicAuthorId: identity.publicAuthorId, workId: work.id, body: body.data, now, ip: input.ip }, resolveModerationDeps());
    if (moderation.status === 'rate_limited') return { kind: 'rate_limited' as const };
    const status = moderation.status;
    // rejected 评论也落库：正文只在治理台可见，供复核与审计，从不公开。
    const [comment] = await tx.insert(communityComments).values({
      workId: work.id, authorUserId: input.actor.userId,
      publicAuthorId: identity.publicAuthorId, frozenDisplayName: identity.displayName,
      status, body: body.data, riskCategories: moderation.categories,
      publishedAt: status === 'published' ? now : null,
      reviewReason: status === 'rejected' ? moderationReasonLabel(moderation.reason) : null,
      createdAt: now, updatedAt: now,
    }).returning();
    await tx.update(commentModerationChecks).set({ commentId: comment.id }).where(eq(commentModerationChecks.id, moderation.checkId));
    if (status === 'published') {
      await tx.update(communityWorks).set({ commentCount: sql`${communityWorks.commentCount} + 1`, updatedAt: now })
        .where(eq(communityWorks.id, work.id));
      await notifyWorkCommented(tx, { workId: work.id, commentId: comment.id, commenterUserId: input.actor.userId, now });
    }
    return { kind: status === 'rejected' ? 'rejected' as const : 'ok' as const, comment };
  });
  if (outcome.kind === 'rate_limited') throw new AppError('RATE_LIMITED', '评论过于频繁，请稍后再试');
  if (outcome.kind === 'rejected') throw new AppError('COMMENT_BLOCKED', '评论包含不适宜内容，未能发布');
  return outcome.comment;
}

function moderationReasonLabel(reason: string): string {
  return `content-safety:${reason}`;
}

export async function deleteCommunityComment(db: AnyDatabase, input: {
  actor: Actor; commentId: string; expectedVersion: number; now?: Date;
}) {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    await lockActiveAccount(tx, input.actor.userId);
    await lockCommentWork(tx, input.commentId);
    const [comment] = await tx.select().from(communityComments).where(eq(communityComments.id, input.commentId)).for('update');
    if (!comment || comment.authorUserId !== input.actor.userId || comment.status === 'deleted') throw new AppError('NOT_FOUND', '评论不存在');
    if (comment.version !== input.expectedVersion) throw new AppError('STATE_CONFLICT', '评论版本已变化');
    const [updated] = await tx.update(communityComments).set({
      status: 'deleted', body: '', riskCategories: [], deletedAt: now,
      version: comment.version + 1, updatedAt: now,
    }).where(and(eq(communityComments.id, comment.id), eq(communityComments.version, comment.version))).returning();
    if (comment.status === 'published') await tx.update(communityWorks).set({
      commentCount: sql`greatest(0, ${communityWorks.commentCount} - 1)`, updatedAt: now,
    }).where(eq(communityWorks.id, comment.workId));
    return updated;
  });
}

export const COMMENT_PAGE_SIZE = 30;

export type CommentOrder = 'asc' | 'desc';
/** 游标记下排序方向（旧游标没有 order 字段，按升序）；方向不一致的游标视为无效。 */
interface CommentCursor { createdAt: string; id: string; order?: 'desc' }

export function encodeCommentCursor(cursor: CommentCursor): string {
  return signCursor(cursor);
}

export function decodeCommentCursor(value: string | undefined | null): CommentCursor | null {
  const parsed = verifyCursor(value) as Partial<CommentCursor> | null;
  if (!parsed || typeof parsed !== 'object') return null;
  if (typeof parsed.createdAt !== 'string' || Number.isNaN(Date.parse(parsed.createdAt)) || typeof parsed.id !== 'string' || !/^[0-9a-f-]{36}$/iu.test(parsed.id)) return null;
  return { createdAt: parsed.createdAt, id: parsed.id, ...(parsed.order === 'desc' ? { order: 'desc' as const } : {}) };
}

/**
 * 评论按发表时间游标分页（此前固定 100 条且无分页，第 101 条起对所有人不可见）；
 * 默认升序，`order: 'desc'` 为最新在前（R15 详情页输入框在上）。本人未公开的评论（待审 / 隐藏）只对本人可见。
 */
export async function listCommunityComments(db: AnyDatabase, workId: string, viewerUserId?: string, page: { cursor?: string | null; limit?: number; order?: CommentOrder } = {}) {
  await activeWork(db, workId);
  const order = page.order ?? 'asc';
  const cursor = decodeCommentCursor(page.cursor);
  if (page.cursor && (!cursor || (cursor.order ?? 'asc') !== order)) throw new AppError('VALIDATION', '分页游标无效', 'cursor');
  const limit = Math.min(Math.max(page.limit ?? COMMENT_PAGE_SIZE, 1), 100);
  const visibility = or(
    eq(communityComments.status, 'published'),
    viewerUserId ? and(eq(communityComments.authorUserId, viewerUserId), inArray(communityComments.status, ['pending_review', 'hidden'])) : undefined,
  );
  const newest = order === 'desc';
  const after = cursor ? or(
    newest ? sql`${communityComments.createdAt} < ${new Date(cursor.createdAt)}` : sql`${communityComments.createdAt} > ${new Date(cursor.createdAt)}`,
    and(eq(communityComments.createdAt, new Date(cursor.createdAt)), newest ? sql`${communityComments.id} < ${cursor.id}::uuid` : sql`${communityComments.id} > ${cursor.id}::uuid`),
  ) : undefined;
  const rows = await db.select({
    id: communityComments.id, publicAuthorId: communityComments.publicAuthorId,
    authorUserId: communityComments.authorUserId,
    frozenDisplayName: communityComments.frozenDisplayName, accountStatus: users.accountStatus, avatarColor: users.avatarColor,
    body: communityComments.body, version: communityComments.version, status: communityComments.status,
    createdAt: communityComments.createdAt,
  }).from(communityComments).leftJoin(users, eq(users.id, communityComments.authorUserId))
    .where(and(eq(communityComments.workId, workId), visibility, after))
    .orderBy(...(newest ? [desc(communityComments.createdAt), desc(communityComments.id)] : [communityComments.createdAt, communityComments.id])).limit(limit + 1);
  const visible = rows.slice(0, limit);
  const last = visible.at(-1);
  return {
    items: visible.map((row) => ({
      id: row.id,
      author: row.accountStatus === 'anonymized'
        ? { publicAuthorId: row.publicAuthorId, displayName: ANONYMIZED_DISPLAY_NAME, avatarColor: null }
        : { publicAuthorId: row.publicAuthorId, displayName: row.frozenDisplayName, avatarColor: row.avatarColor },
      body: row.body, version: row.version, status: row.status,
      createdAt: row.createdAt.toISOString(),
      deletable: row.authorUserId === viewerUserId,
    })),
    nextCursor: rows.length > limit && last ? encodeCommentCursor({ createdAt: last.createdAt.toISOString(), id: last.id, ...(newest ? { order: 'desc' as const } : {}) }) : null,
  };
}

export async function reportCommunityTarget(db: AnyDatabase, input: {
  actor: Actor; targetType: 'work' | 'comment'; targetId: string; category: z.infer<typeof reportCategorySchema>; details?: string;
}) {
  const details = input.details?.trim();
  if (details && details.length > 500) throw new AppError('VALIDATION', '举报补充说明最多 500 字', 'details');
  return db.transaction(async (tx) => {
    await lockActiveAccount(tx, input.actor.userId);
    let targetVersion: number;
    if (input.targetType === 'work') {
      const work = await activeWork(tx, input.targetId);
      const [revision] = await tx.select({ revisionNumber: communityRevisions.revisionNumber }).from(communityRevisions)
        .where(eq(communityRevisions.id, work.currentPublishedRevisionId!));
      if (!revision) throw new AppError('NOT_FOUND', '作品不存在');
      targetVersion = revision.revisionNumber;
    } else {
      const [comment] = await tx.select({ version: communityComments.version, status: communityComments.status, workId: communityComments.workId })
        .from(communityComments).where(eq(communityComments.id, input.targetId));
      if (!comment || comment.status !== 'published') throw new AppError('NOT_FOUND', '评论不存在');
      // 评论所属作品已下架 / 撤回时评论本身也不可见，不应再进入举报队列。
      await activeWork(tx, comment.workId);
      targetVersion = comment.version;
    }
    const created = await tx.insert(communityReports).values({
      targetType: input.targetType, targetId: input.targetId, targetVersion,
      reporterUserId: input.actor.userId, category: input.category, details: details || null,
    }).onConflictDoNothing().returning();
    if (created.length === 0) throw new AppError('CONFLICT', '你已经举报过当前版本');
    return created[0];
  });
}

export async function moderateCommunityComment(db: AnyDatabase, input: {
  actor: Actor; commentId: string; decision: 'published' | 'hidden'; expectedVersion: number;
  reason: string; requestId: string; now?: Date;
}) {
  const reason = reasonSchema.parse(input.reason);
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    await lockActiveAccount(tx, input.actor.userId);
    await lockCommentWork(tx, input.commentId);
    const [comment] = await tx.select().from(communityComments).where(eq(communityComments.id, input.commentId)).for('update');
    if (!comment || comment.status === 'deleted') throw new AppError('NOT_FOUND', '评论不存在');
    // rejected（内容安全拦截）只能被人工复核后公开，不存在「隐藏被拒评论」这一步。
    const transitionable = comment.status === 'rejected' ? input.decision === 'published' : ['pending_review', 'published'].includes(comment.status);
    if (comment.version !== input.expectedVersion || !transitionable || comment.status === input.decision) {
      throw new AppError('STATE_CONFLICT', '评论状态已变化');
    }
    const [updated] = await tx.update(communityComments).set({
      status: input.decision, version: comment.version + 1,
      publishedAt: input.decision === 'published'
        ? (comment.status === 'published' ? comment.publishedAt ?? comment.reviewedAt ?? comment.createdAt : now)
        : null,
      reviewedByUserId: input.actor.userId, reviewReason: reason, reviewedAt: now, updatedAt: now,
    }).where(and(eq(communityComments.id, comment.id), eq(communityComments.version, comment.version))).returning();
    const delta = Number(input.decision === 'published') - Number(comment.status === 'published');
    if (delta !== 0) await tx.update(communityWorks).set({
      commentCount: sql`greatest(0, ${communityWorks.commentCount} + ${delta})`, updatedAt: now,
    }).where(eq(communityWorks.id, comment.workId));
    // 待审 / 被拦截的评论经人工复核首次公开：此刻才通知作品作者（D70）。
    if (delta > 0) await notifyWorkCommented(tx, { workId: comment.workId, commentId: comment.id, commenterUserId: comment.authorUserId, now });
    await tx.insert(adminAuditLogs).values({
      actorUserId: input.actor.userId, actorRole: input.actor.role,
      action: `community.comment_${input.decision}`, targetType: 'community_comment', targetId: comment.id,
      reason, requestId: input.requestId,
      beforeState: sanitizeAuditState({ status: comment.status, revision: comment.version }),
      afterState: sanitizeAuditState({ status: updated.status, revision: updated.version }),
    });
    return updated;
  });
}

export async function handleCommunityReport(db: AnyDatabase, input: {
  actor: Actor; reportId: string; decision: 'accepted' | 'resolved' | 'dismissed'; expectedVersion: number;
  reason: string; requestId: string; now?: Date;
}) {
  const reason = reasonSchema.parse(input.reason);
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    await lockActiveAccount(tx, input.actor.userId);
    const [report] = await tx.select().from(communityReports).where(eq(communityReports.id, input.reportId)).for('update');
    if (!report) throw new AppError('NOT_FOUND', '举报不存在');
    const allowed = input.decision === 'accepted'
      ? report.status === 'open'
      : input.decision === 'resolved'
        ? report.status === 'accepted'
        : ['open', 'accepted'].includes(report.status);
    if (!allowed || report.version !== input.expectedVersion) throw new AppError('STATE_CONFLICT', '举报状态已变化');
    const [updated] = await tx.update(communityReports).set({
      status: input.decision, version: report.version + 1,
      handledByUserId: input.actor.userId, handlingReason: reason, handledAt: now, updatedAt: now,
    }).where(and(eq(communityReports.id, report.id), eq(communityReports.version, report.version))).returning();
    await tx.insert(adminAuditLogs).values({
      actorUserId: input.actor.userId, actorRole: input.actor.role,
      action: `community.report_${input.decision}`, targetType: 'community_report', targetId: report.id,
      reason, requestId: input.requestId,
      beforeState: sanitizeAuditState({ status: report.status, revision: report.version }),
      afterState: sanitizeAuditState({ status: updated.status, revision: updated.version }),
    });
    return updated;
  });
}

/** 治理台队列的分页参数（admin-round-3 06）：评论与举报各自独立翻页。 */
/** 后台表格筛选（R15-10）：评论按判定、举报按状态与对象类型；两者都可搜索。 */
const queueSearch = z.string().trim().max(80).optional();
const commentQueueQuerySchema = z.object({ q: queueSearch, status: z.enum(['pending_review', 'rejected']).optional(), ...pageQueryFields }).strict();
const reportQueueQuerySchema = z.object({ q: queueSearch, status: z.enum(['open', 'accepted']).optional(), targetType: z.enum(['work', 'comment']).optional(), ...pageQueryFields }).strict();

/** 作品任一版本的标题命中搜索词。 */
const workTitleMatches = (workId: SQL | Column, pattern: string) => sql`exists (select 1 from community_revisions sr where sr.work_id = ${workId} and sr.title ilike ${pattern})`;

/** 治理台的评论队列：待审评论 + 最近 30 天被拦截的评论，附带最近一次内容安全判定。搜索评论内容、作者或作品标题。 */
export async function listGovernanceComments(db: AnyDatabase, input: unknown = {}, now: Date = new Date()) {
  const query = commentQueueQuerySchema.parse(input);
  const rejectedSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const pending = eq(communityComments.status, 'pending_review');
  const rejected = and(eq(communityComments.status, 'rejected'), gte(communityComments.createdAt, rejectedSince));
  const pattern = query.q ? containsPattern(query.q) : null;
  const where = and(
    query.status === 'pending_review' ? pending : query.status === 'rejected' ? rejected : or(pending, rejected),
    pattern ? or(ilike(communityComments.body, pattern), ilike(communityComments.frozenDisplayName, pattern), workTitleMatches(communityComments.workId, pattern)) : undefined,
  );
  const [rawComments, totalRows] = await Promise.all([
    db.select({ id: communityComments.id, workId: communityComments.workId, status: communityComments.status,
      version: communityComments.version, body: communityComments.body, riskCategories: communityComments.riskCategories,
      createdAt: communityComments.createdAt, reviewReason: communityComments.reviewReason,
      authorName: communityComments.frozenDisplayName, publicAuthorId: communityComments.publicAuthorId,
      accountStatus: users.accountStatus, avatarColor: users.avatarColor }).from(communityComments)
      .leftJoin(users, eq(users.id, communityComments.authorUserId))
      .where(where)
      .orderBy(communityComments.createdAt).limit(query.size).offset(pageOffset(query.page, query.size)),
    db.select({ count: countExpression }).from(communityComments).where(where),
  ]);
  const works = await loadWorkLabels(db, rawComments.map((row) => row.workId));
  const checks = rawComments.length === 0 ? [] : await db.select({
    commentId: commentModerationChecks.commentId, provider: commentModerationChecks.provider, suggestion: commentModerationChecks.suggestion,
    label: commentModerationChecks.label, subLabel: commentModerationChecks.subLabel, score: commentModerationChecks.score,
    keywords: commentModerationChecks.keywords, reason: commentModerationChecks.reason, createdAt: commentModerationChecks.createdAt,
  }).from(commentModerationChecks).where(inArray(commentModerationChecks.commentId, rawComments.map((row) => row.id)))
    .orderBy(desc(commentModerationChecks.createdAt));
  const latestCheck = new Map<string, typeof checks[number]>();
  for (const check of checks) if (check.commentId && !latestCheck.has(check.commentId)) latestCheck.set(check.commentId, check);
  const items = rawComments.map(({ publicAuthorId, accountStatus, avatarColor, ...row }) => {
    const check = latestCheck.get(row.id);
    const anonymized = !accountStatus || accountStatus === 'anonymized';
    const work = works.get(row.workId);
    return {
      ...row,
      authorName: anonymized ? ANONYMIZED_DISPLAY_NAME : row.authorName,
      author: { id: publicAuthorId, name: anonymized ? ANONYMIZED_DISPLAY_NAME : row.authorName, color: anonymized ? null : avatarColor } satisfies AdminPerson,
      workTitle: work?.title ?? null,
      workRevisionId: work?.revisionId ?? null,
      moderation: check ? {
        provider: check.provider, suggestion: check.suggestion, label: check.label, subLabel: check.subLabel, score: check.score,
        keywords: Array.isArray(check.keywords) ? (check.keywords as string[]) : [], reason: check.reason, checkedAt: check.createdAt.toISOString(),
      } : null,
    };
  });
  return { items, ...pageMeta(readCount(totalRows), query.page, query.size) };
}

/**
 * 治理台的举报队列：待受理与已受理的案件。每条带上被举报对象的可读名称（作品标题与缩略图 / 评论开头）与举报人。
 * 搜索对象（作品标题、评论内容）、原因、举报人、举报说明或案件编号开头。
 */
export async function listGovernanceReports(db: AnyDatabase, input: unknown = {}) {
  const query = reportQueueQuerySchema.parse(input);
  const pattern = query.q ? containsPattern(query.q) : null;
  const categories = query.q
    ? Object.entries(zhCN.communityAdmin.states.risk).filter(([key, label]) => label.includes(query.q!) || key === query.q).map(([key]) => key)
    : [];
  const search = pattern ? or(
    sql`${communityReports.id}::text ilike ${startsWithPattern(query.q!)}`,
    ilike(communityReports.details, pattern),
    categories.length ? inArray(communityReports.category, categories) : undefined,
    sql`exists (select 1 from users ru where ru.id = ${communityReports.reporterUserId} and ru.username ilike ${pattern})`,
    and(eq(communityReports.targetType, 'work'), workTitleMatches(communityReports.targetId, pattern)),
    and(eq(communityReports.targetType, 'comment'), sql`exists (select 1 from community_comments sc where sc.id = ${communityReports.targetId} and sc.body ilike ${pattern})`),
  ) : undefined;
  const where = and(query.status ? eq(communityReports.status, query.status) : inArray(communityReports.status, ['open', 'accepted']),
    query.targetType ? eq(communityReports.targetType, query.targetType) : undefined, search);
  const [rows, totalRows] = await Promise.all([
    db.select({ id: communityReports.id, targetType: communityReports.targetType, targetId: communityReports.targetId,
      targetVersion: communityReports.targetVersion, status: communityReports.status, version: communityReports.version,
      category: communityReports.category, details: communityReports.details, createdAt: communityReports.createdAt,
      reporterUserId: communityReports.reporterUserId,
    }).from(communityReports).where(where)
      .orderBy(communityReports.createdAt).limit(query.size).offset(pageOffset(query.page, query.size)),
    db.select({ count: countExpression }).from(communityReports).where(where),
  ]);
  const comments = await loadCommentLabels(db, rows.filter((row) => row.targetType === 'comment').map((row) => row.targetId));
  const [works, people] = await Promise.all([
    loadWorkLabels(db, [...rows.filter((row) => row.targetType === 'work').map((row) => row.targetId), ...[...comments.values()].map((comment) => comment.workId)]),
    loadPeople(db, rows.map((row) => row.reporterUserId)),
  ]);
  const items = rows.map(({ reporterUserId, ...row }) => {
    const comment = row.targetType === 'comment' ? comments.get(row.targetId) : undefined;
    const work = works.get(row.targetType === 'work' ? row.targetId : comment?.workId ?? '');
    return {
      ...row,
      target: row.targetType === 'work'
        ? { title: work?.title ?? null, excerpt: null, revisionId: work?.revisionId ?? null, authorName: null, workTitle: null }
        : { title: null, excerpt: comment ? excerpt(comment.body) : null, revisionId: null, authorName: comment?.authorName ?? null, workTitle: work?.title ?? null },
      reporter: reporterUserId ? people.get(reporterUserId) ?? null : null,
    };
  });
  return { items, ...pageMeta(readCount(totalRows), query.page, query.size) };
}
