/**
 * 站内通知（D70）：投稿通过 / 驳回、作品下架 / 恢复、作品收到公开评论。
 *
 * - 写入发生在触发它的业务事务里（与审计同一模式）：主操作提交则通知必在，回滚则通知也不在；
 * - payload 只放公开事实与跳转目标（作品 / 修订 / 评论编号、冻结标题、驳回理由），不存评论正文与他人身份；
 * - 只通知个人作者：官方作品（authorType = official）与已注销账号不写；
 * - 保留 config.notifications.retentionDays 天（默认 90），由每日清理删除。
 */
import { and, count, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AnyDatabase } from '@/../db/client';
import { communityRevisions, communityWorks, notifications, users } from '@/../db/schema';
import { config } from '@/lib/config';
import { AppError } from '@/lib/errors';
import { signCursor, verifyCursor } from '@/lib/security/cursor';

export const NOTIFICATION_TYPES = ['revision_approved', 'revision_rejected', 'work_removed', 'work_restored', 'work_commented'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationPayload {
  workId: string;
  /** 作品标题（写入时冻结） */
  title: string;
  revisionId?: string;
  /** 驳回理由（作者在「我的投稿」里本来就能看到） */
  reason?: string;
  commentId?: string;
}

export const NOTIFICATION_PAGE_SIZE = 20;
export const NOTIFICATION_MAX_PAGE_SIZE = 50;

/** 写一条通知；收件人不存在或已注销时跳过。返回是否写入。 */
export async function createNotification(tx: AnyDatabase, input: { userId: string; type: NotificationType; payload: NotificationPayload; now?: Date }): Promise<boolean> {
  const [recipient] = await tx.select({ accountStatus: users.accountStatus }).from(users).where(eq(users.id, input.userId));
  if (!recipient || recipient.accountStatus === 'anonymized') return false;
  await tx.insert(notifications).values({ userId: input.userId, type: input.type, payload: input.payload, createdAt: input.now ?? new Date() });
  return true;
}

/** 通知作品的个人作者（官方作品不通知）。标题取当前公开修订，没有就取最新修订。 */
export async function notifyWorkAuthor(tx: AnyDatabase, input: {
  work: { id: string; authorUserId: string | null; authorType: 'user' | 'official'; currentPublishedRevisionId?: string | null };
  type: NotificationType;
  payload?: Omit<NotificationPayload, 'workId' | 'title'> & { title?: string };
  now?: Date;
}): Promise<boolean> {
  const { work } = input;
  if (work.authorType !== 'user' || !work.authorUserId) return false;
  let title = input.payload?.title;
  if (!title) {
    const [row] = await tx.select({ title: communityRevisions.title }).from(communityRevisions)
      .where(work.currentPublishedRevisionId ? eq(communityRevisions.id, work.currentPublishedRevisionId) : eq(communityRevisions.workId, work.id))
      .orderBy(desc(communityRevisions.revisionNumber)).limit(1);
    title = row?.title ?? '';
  }
  return createNotification(tx, { userId: work.authorUserId, type: input.type, payload: { ...input.payload, workId: work.id, title }, now: input.now });
}

/** 评论刚进入公开态时通知作品作者；作者评论自己的作品不通知。 */
export async function notifyWorkCommented(tx: AnyDatabase, input: { workId: string; commentId: string; commenterUserId: string | null; now?: Date }): Promise<boolean> {
  const [work] = await tx.select({ id: communityWorks.id, authorUserId: communityWorks.authorUserId, authorType: communityWorks.authorType, currentPublishedRevisionId: communityWorks.currentPublishedRevisionId })
    .from(communityWorks).where(eq(communityWorks.id, input.workId));
  if (!work || work.authorUserId === input.commenterUserId) return false;
  return notifyWorkAuthor(tx, { work, type: 'work_commented', payload: { commentId: input.commentId }, now: input.now });
}

export async function countUnreadNotifications(db: AnyDatabase, userId: string): Promise<number> {
  const [row] = await db.select({ value: count() }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(row?.value ?? 0);
}

const cursorSchema = z.object({ createdAt: z.string().datetime(), id: z.uuid() }).strict();
export const notificationListQuerySchema = z.object({
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(NOTIFICATION_MAX_PAGE_SIZE).default(NOTIFICATION_PAGE_SIZE),
}).strict();

/** 本人通知，按时间倒序签名游标分页；附未读总数。 */
export async function listNotifications(db: AnyDatabase, userId: string, input: unknown = {}) {
  const query = notificationListQuerySchema.parse(input);
  const cursor = query.cursor ? cursorSchema.safeParse(verifyCursor(query.cursor)) : null;
  if (query.cursor && !cursor?.success) throw new AppError('VALIDATION', '分页游标无效', 'cursor');
  const after = cursor?.success ? or(
    lt(notifications.createdAt, new Date(cursor.data.createdAt)),
    and(eq(notifications.createdAt, new Date(cursor.data.createdAt)), sql`${notifications.id} < ${cursor.data.id}::uuid`),
  ) : undefined;
  const [rows, unreadCount] = await Promise.all([
    db.select().from(notifications).where(and(eq(notifications.userId, userId), after))
      .orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(query.limit + 1),
    countUnreadNotifications(db, userId),
  ]);
  const visible = rows.slice(0, query.limit);
  const last = visible.at(-1);
  return {
    items: visible.map((row) => ({
      id: row.id,
      type: row.type as NotificationType,
      payload: row.payload as NotificationPayload,
      read: row.readAt !== null,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor: rows.length > query.limit && last ? signCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null,
    unreadCount,
  };
}

/** 标记已读：给定编号只影响本人的未读通知，缺省全部已读。返回本次更新条数与剩余未读数。 */
export async function markNotificationsRead(db: AnyDatabase, userId: string, ids?: string[], now: Date = new Date()) {
  const conditions = [eq(notifications.userId, userId), isNull(notifications.readAt)];
  if (ids) {
    if (ids.length === 0) return { updated: 0, unreadCount: await countUnreadNotifications(db, userId) };
    conditions.push(inArray(notifications.id, ids));
  }
  const updated = await db.update(notifications).set({ readAt: now }).where(and(...conditions)).returning();
  return { updated: updated.length, unreadCount: await countUnreadNotifications(db, userId) };
}

/** 每日清理：删除超过保留期的通知，返回删除条数。 */
export async function cleanupExpiredNotifications(db: AnyDatabase, now: Date, retentionDays = config.notifications.retentionDays): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  return (await db.delete(notifications).where(lt(notifications.createdAt, cutoff)).returning()).length;
}
