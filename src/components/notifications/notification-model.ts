/**
 * 站内通知（D70，票 11）的前端模型：接口数据形状、每类通知的一句话与跳转目标、相对时间、徽标数字。
 * 纯函数、不带 'use client'，服务端与单测都能直接调用。接口见票 02 Comments（/api/me/notifications）。
 */
import type { NotificationPayload, NotificationType } from '@/lib/notifications/service';
import { zhCN } from '@/messages/zh-CN';

export type { NotificationType } from '@/lib/notifications/service';

const t = zhCN.notifications;

export interface NotificationItem {
  id: string;
  type: NotificationType;
  read: boolean;
  readAt: string | null;
  createdAt: string;
  payload: NotificationPayload;
}

export interface NotificationPage {
  items: NotificationItem[];
  nextCursor: string | null;
  unreadCount: number;
}

/** 通知类别决定图标与语气：好消息（通过、恢复）、需要处理（未通过、下架）、互动（新评论）。 */
export type NotificationTone = 'good' | 'attention' | 'neutral';

const KNOWN: ReadonlySet<string> = new Set<NotificationType>(['revision_approved', 'revision_rejected', 'work_removed', 'work_restored', 'work_commented']);

/** 只留下前端认识的通知（接口多出新类型时不渲染，而不是整块报错）。 */
export function knownNotifications(items: readonly NotificationItem[]): NotificationItem[] {
  return items.filter((item) => KNOWN.has(item.type) && typeof item.payload?.workId === 'string');
}

/**
 * 跳转目标：通过 / 恢复 → 作品详情；新评论 → 详情里的那条评论（#comment-<id>，与后台举报「公开页」同一锚点）；
 * 未通过 / 下架 → 我的公开作品（作者在那里看原因、修改后重投；下架作品的详情对外已是 404）。
 */
export function notificationHref(item: Pick<NotificationItem, 'type' | 'payload'>): string {
  const work = `/community/${encodeURIComponent(item.payload.workId)}`;
  switch (item.type) {
    case 'revision_approved':
    case 'work_restored':
      return work;
    case 'work_commented':
      return item.payload.commentId ? `${work}#comment-${encodeURIComponent(item.payload.commentId)}` : work;
    case 'revision_rejected':
    case 'work_removed':
      return '/me/public';
  }
}

export function notificationTone(type: NotificationType): NotificationTone {
  if (type === 'revision_approved' || type === 'work_restored') return 'good';
  if (type === 'revision_rejected' || type === 'work_removed') return 'attention';
  return 'neutral';
}

/** 一句话 + 可选的补充行（未通过的原因）。 */
export function notificationCopy(item: Pick<NotificationItem, 'type' | 'payload'>): { text: string; detail: string | null } {
  const title = item.payload.title?.trim() || t.untitled;
  switch (item.type) {
    case 'revision_approved':
      return { text: t.approved(title), detail: null };
    case 'revision_rejected': {
      const reason = item.payload.reason?.trim();
      return { text: t.rejected(title), detail: reason ? t.rejectedReason(reason) : null };
    }
    case 'work_removed':
      return { text: t.removed(title), detail: null };
    case 'work_restored':
      return { text: t.restored(title), detail: null };
    case 'work_commented':
      return { text: t.commented(title), detail: null };
  }
}

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前，超过 30 天写日期（与「最近的设计」同一口径）。 */
export function relativeTime(iso: string, now: number): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const minutes = Math.floor(Math.max(0, now - at) / 60_000);
  if (minutes < 1) return t.justNow;
  if (minutes < 60) return t.minutesAgo(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t.hoursAgo(hours);
  const days = Math.floor(hours / 24);
  if (days <= 30) return t.daysAgo(days);
  const date = new Date(at);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** 铃铛徽标里的数字：超过 99 写 99+。 */
export function badgeText(count: number): string {
  return count > 99 ? '99+' : String(Math.max(0, Math.floor(count)));
}
