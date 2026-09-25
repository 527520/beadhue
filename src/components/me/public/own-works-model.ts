/**
 * 「我的 · 公开作品」的归类规则：把本人的豆社作品与修订历史
 * 归成一张卡——审核中 / 已公开 / 未通过（附原因）/ 已下架，以及投稿失败留下的草稿、撤回后的待重投。
 * 整件已撤回的作品不再出现在这里。纯函数，服务端页面直接调用。
 */
import type { listOwnCommunityWorks } from '@/lib/community/queries';
import { communityThumbnailUrl } from '@/lib/community/thumbnailUrl';
import { relativeTime } from '@/lib/format';
import { zhCN } from '@/messages/zh-CN';

export type OwnWork = Awaited<ReturnType<typeof listOwnCommunityWorks>>[number];
export type OwnKind = 'published' | 'review' | 'rejected' | 'draft' | 'withdrawn' | 'removed';

export interface OwnItem {
  workId: string;
  workVersion: number;
  kind: OwnKind;
  title: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  /** 非公开状态的说明（提交时间、草稿、下架）；已公开时为 null，改写喜欢与引用数。 */
  note: string | null;
  reason: string | null;
  likes: number;
  comments: number;
  reuses: number;
  /** 有正在公开的版本时的公开页地址。 */
  publicHref: string | null;
  /** 最新修订（撤回审核 / 提交草稿用）。 */
  latest: { id: string; version: number; status: string } | null;
  sourceDesignId: string | null;
  /** 「修改后重投」：沿用旧投稿页的深链。 */
  editHref: string;
}

const p = zhCN.me.public;

export function toOwnItems(works: readonly OwnWork[], now: number = Date.now()): OwnItem[] {
  const items: OwnItem[] = [];
  for (const work of works) {
    if (work.lifecycleStatus === 'withdrawn') continue;
    const latest = work.revisions[0] ?? null;
    const current = work.currentPublishedRevisionId ? work.revisions.find((revision) => revision.id === work.currentPublishedRevisionId) ?? null : null;
    const live = work.lifecycleStatus === 'active' && current !== null;
    let kind: OwnKind;
    if (work.lifecycleStatus === 'removed') kind = 'removed';
    else if (!latest || latest.id === current?.id || (latest.status === 'withdrawn' && live) || latest.status === 'superseded') kind = live ? 'published' : 'withdrawn';
    else if (latest.status === 'pending_review') kind = 'review';
    else if (latest.status === 'rejected') kind = 'rejected';
    else if (latest.status === 'draft') kind = 'draft';
    else kind = live ? 'published' : 'withdrawn';
    const shown = kind === 'published' && current ? current : latest ?? current;
    if (!shown) continue;
    const when = (iso: string | null) => (iso ? relativeTime(iso, now) : '');
    let note: string | null = null;
    if (kind === 'review') note = live ? p.updateInReview : p.submittedAt(when(latest?.submittedAt ?? null));
    else if (kind === 'rejected') note = live ? p.updateRejected : p.reviewedAt(when(latest?.reviewedAt ?? latest?.submittedAt ?? null));
    else if (kind === 'draft') note = p.draftNote;
    else if (kind === 'withdrawn') note = p.withdrawnNote;
    else if (kind === 'removed') note = p.removedNote;
    const sourceDesignId = latest?.sourceDesignId ?? current?.sourceDesignId ?? null;
    const edit = new URLSearchParams({ workId: work.id });
    if (sourceDesignId) edit.set('designId', sourceDesignId);
    items.push({
      workId: work.id,
      workVersion: work.version,
      kind,
      title: shown.title,
      thumbnailUrl: communityThumbnailUrl(shown.id),
      width: shown.preview.originalWidth,
      height: shown.preview.originalHeight,
      note,
      reason: kind === 'rejected' ? latest?.reviewReason ?? null : null,
      likes: work.likeCount,
      comments: work.commentCount,
      reuses: work.reuseCount,
      publicHref: live ? `/community/${work.id}` : null,
      latest: latest ? { id: latest.id, version: latest.version, status: latest.status } : null,
      sourceDesignId,
      editHref: `/community/submit?${edit}`,
    });
  }
  return items;
}

export function ownSummary(items: readonly OwnItem[]): Array<[number, string]> {
  const count = (kind: OwnKind) => items.filter((item) => item.kind === kind).length;
  return ([[count('published'), p.summary.published], [count('review'), p.summary.review], [count('rejected'), p.summary.rejected], [count('removed'), p.summary.removed]] as Array<[number, string]>).filter(([n]) => n > 0);
}
