'use client';

import { ArrowRight, CircleAlert, Clock, Eye, FolderOpen, Link2, Pencil, Scale, Send, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useRef, useState } from 'react';
import { track } from '@/lib/analytics/client';
import { randomId } from '@/lib/ids';
import { zhCN } from '@/messages/zh-CN';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { MetaItem, MetaSep, cardMediaClass, cardMediaInnerClass } from '@/components/ui/work-card';
import { WorkGrid } from '@/components/works/community-work-card';
import { useLoginDialog } from '@/components/shell/login-dialog';
import { isDefiniteCommunityRejection, postCommunityCommand } from '@/components/community/communityCommand';
import { ActionMenu, type ActionEntry } from '../action-menu';
import { ConfirmDialog } from '../confirm-dialog';
import { formatCount } from '../format';
import { useMe } from '../me-context';
import { ownSummary, type OwnItem } from './own-works-model';

const p = zhCN.me.public;
const icon = (Icon: typeof Eye) => <Icon aria-hidden="true" strokeWidth={1.75} />;

type Action = 'submit' | 'withdraw_revision' | 'withdraw_work';
interface Attempt { action: Action; url: string; key: string; targetId: string; expectedVersion: number }

/**
 * 豆社作品命令（沿用旧 CommunityMineActions）：带幂等键；结果未确认时只能重试同一请求，
 * 确认前不能关闭、不能换别的操作；明确被拒才允许重新发起。
 */
function useCommunityCommand(onDone: (action: Action) => void) {
  const router = useRouter();
  const pending = useRef(false);
  const attempt = useRef<Attempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (next: Omit<Attempt, 'key'>) => {
    if (pending.current || (attempt.current && attempt.current.action !== next.action)) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    const current = attempt.current ?? { ...next, key: randomId() };
    attempt.current = current;
    let accepted = false;
    try {
      const body = await postCommunityCommand(current.url, current.key, { expectedVersion: current.expectedVersion });
      const ok = body.version === current.expectedVersion + 1 && (current.action === 'withdraw_work'
        ? body.workId === current.targetId && body.lifecycleStatus === 'withdrawn'
        : body.revisionId === current.targetId && body.status === (current.action === 'submit' ? 'pending_review' : 'withdrawn'));
      if (!ok) throw new Error(zhCN.communityAdmin.mineActions.unknown);
      accepted = true;
      attempt.current = null;
      setUncertain(false);
      track({ name: current.action === 'submit' ? 'community_submission_submitted' : 'community_submission_withdrawn', properties: {} });
    } catch (caught) {
      const definite = isDefiniteCommunityRejection(caught);
      if (definite) attempt.current = null;
      setUncertain(!definite);
      setError(caught instanceof Error ? caught.message : zhCN.communityAdmin.mineActions.failed);
    } finally {
      pending.current = false;
      setBusy(false);
    }
    if (accepted) {
      onDone(current.action);
      router.refresh();
    }
  };
  const reset = () => {
    if (pending.current || attempt.current) return false;
    setError(null);
    return true;
  };
  return { run, busy, uncertain, error, reset };
}

function OwnCard({ item, entries }: { item: OwnItem; entries: readonly ActionEntry[] }) {
  const badge = {
    review: <Badge tone="warning">{icon(Clock)}{p.badges.review}</Badge>,
    rejected: <Badge tone="danger">{icon(CircleAlert)}{p.badges.rejected}</Badge>,
    removed: <Badge tone="danger">{p.badges.removed}</Badge>,
    draft: <Badge tone="on-image">{p.badges.draft}</Badge>,
    withdrawn: <Badge tone="on-image">{p.badges.withdrawn}</Badge>,
    published: null,
  }[item.kind];
  const [likes, reuses] = p.counts(formatCount(item.likes), formatCount(item.reuses));
  const href = item.publicHref ?? (item.sourceDesignId ? `/app?id=${encodeURIComponent(item.sourceDesignId)}` : item.editHref);
  const stateLabel = item.kind === 'published' ? '' : p.badges[item.kind];
  return (
    <article data-slot="own-work-card" className="group/card @container relative flex min-w-0 flex-col gap-2 rounded-lg sm:gap-2.5">
      <div className={cardMediaClass}>
        <div className={cardMediaInnerClass}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 服务端豆粒缩略图；未公开修订只对作者本人可见 */}
          <img src={item.thumbnailUrl} alt="" loading="lazy" decoding="async" />
        </div>
        {badge ? <div aria-hidden="true" className="absolute top-2.5 right-12 left-2.5 z-1 flex flex-wrap gap-1.5 [&_svg]:size-3">{badge}</div> : null}
      </div>
      <div className="grid gap-0.5 px-0.5">
        <h3 className="truncate text-body leading-5.5 font-semibold text-ink @max-card-sm:text-body-sm">{item.title}</h3>
        <p className="flex min-w-0 items-center gap-1.5 text-footnote leading-5 text-ink-3 @max-card-sm:text-caption">
          {item.note ? <MetaItem grow>{item.note}</MetaItem> : (<><MetaItem>{likes}</MetaItem><MetaSep /><MetaItem>{reuses}</MetaItem></>)}
        </p>
        {item.reason ? (
          <p className="mt-1 flex items-start gap-1 text-caption font-normal text-ink-2 [&>svg]:mt-px [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-danger">
            {icon(CircleAlert)}
            <span className="line-clamp-2">{item.reason}</span>
          </p>
        ) : null}
      </div>
      <Link href={href} aria-label={item.publicHref ? p.openPublic(item.title) : p.openState(item.title, stateLabel)} className="absolute inset-0 z-0 rounded-lg focus-visible:focus-ring" />
      <div className="absolute top-2 right-2 z-2 transition-opacity duration-state pointer-fine:opacity-0 pointer-fine:group-hover/card:opacity-100 pointer-fine:group-focus-within/card:opacity-100 pointer-fine:has-data-popup-open:opacity-100">
        <ActionMenu label={zhCN.me.more(item.title)} title={item.title} entries={entries} />
      </div>
    </article>
  );
}

type Confirming = { item: OwnItem; action: Exclude<Action, 'submit'> };

/** 我的 · 公开作品（原型 renderPublic）：摘要行 + 查看公开主页，作品卡带状态徽标与「…」菜单。 */
export function PublicWorksPanel({ items, guest }: { items: OwnItem[] | null; guest: boolean }) {
  const toast = useToast();
  const login = useLoginDialog();
  const router = useRouter();
  const { viewer, refreshStats } = useMe();
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const command = useCommunityCommand((action) => {
    setConfirming(null);
    toast(action === 'submit' ? p.done.submit : action === 'withdraw_work' ? p.done.withdrawWork : confirming?.item.latest?.status === 'draft' ? p.done.withdrawDraft : p.done.withdrawReview, { icon: icon(action === 'submit' ? Send : Undo2) });
    refreshStats();
  });

  if (guest || !items) {
    return <EmptyState kind="designs" title={p.loginTitle} description={p.loginText} actions={<Button onClick={() => login?.open({ onSuccess: () => router.refresh() })}>{zhCN.me.login}</Button>} />;
  }
  if (!items.length) {
    return <EmptyState kind="designs" title={p.emptyTitle} description={p.emptyText} actions={<Link href="/me" className={buttonVariants({ variant: 'secondary' })}>{p.goDesigns}</Link>} />;
  }

  const startWithdraw = (item: OwnItem, action: Confirming['action']) => {
    if (command.reset()) setConfirming({ item, action });
  };
  const submit = (item: OwnItem) => {
    if (!item.latest) return;
    void command.run({ action: 'submit', url: `/api/community/revisions/${item.latest.id}/submit`, targetId: item.latest.id, expectedVersion: item.latest.version });
  };
  const entries = (item: OwnItem): ActionEntry[] => {
    const list: ActionEntry[] = [];
    if (item.publicHref) {
      list.push({ key: 'view', label: p.actions.view, icon: icon(Eye), href: item.publicHref });
      list.push({ key: 'link', label: p.actions.link, icon: icon(Link2), onSelect: () => {
        void navigator.clipboard?.writeText(`${window.location.origin}${item.publicHref}`).catch(() => undefined);
        toast(p.linkCopied, { icon: icon(Link2) });
      } });
    }
    if (item.kind === 'review' && item.sourceDesignId) list.push({ key: 'design', label: p.actions.openDesign, icon: icon(FolderOpen), href: `/app?id=${encodeURIComponent(item.sourceDesignId)}` });
    if (item.kind === 'draft') list.push({ key: 'submit', label: p.actions.submit, icon: icon(Send), onSelect: () => submit(item) });
    if (item.kind === 'published' || item.kind === 'rejected' || item.kind === 'withdrawn') list.push({ key: 'edit', label: p.actions.edit, icon: icon(Pencil), href: item.editHref });
    if (item.kind === 'removed') list.push({ key: 'appeal', label: p.actions.appeal, icon: icon(Scale), href: '/community/copyright' });
    const danger: ActionEntry[] = [];
    if (item.kind === 'review') danger.push({ key: 'withdraw-review', label: p.actions.withdrawReview, icon: icon(Undo2), danger: true, onSelect: () => startWithdraw(item, 'withdraw_revision') });
    if (item.kind === 'draft') danger.push({ key: 'withdraw-draft', label: p.actions.withdrawDraft, icon: icon(Undo2), danger: true, onSelect: () => startWithdraw(item, 'withdraw_revision') });
    if (item.publicHref && item.kind !== 'removed') danger.push({ key: 'withdraw-work', label: p.actions.withdrawWork, icon: icon(Undo2), danger: true, onSelect: () => startWithdraw(item, 'withdraw_work') });
    return danger.length ? [...list, 'separator', ...danger] : list;
  };

  const counts = ownSummary(items);
  const target = confirming;
  const c = p.confirm;
  const copy = target
    ? target.action === 'withdraw_work'
      ? { title: c.withdrawWorkTitle, text: c.withdrawWorkText(target.item.title, formatCount(target.item.likes), formatCount(target.item.comments)), label: p.actions.withdrawWork }
      : target.item.kind === 'draft'
        ? { title: c.withdrawDraftTitle, text: c.withdrawDraftText(target.item.title), label: p.actions.withdrawDraft }
        : { title: c.withdrawReviewTitle, text: c.withdrawReviewText(target.item.title), label: p.actions.withdrawReview }
    : null;

  return (
    <section aria-label={p.region}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="flex flex-wrap items-center gap-2 text-body-sm text-ink-3">
          {counts.map(([n, label], index) => (
            <Fragment key={label}>
              {index > 0 ? <span aria-hidden="true" className="text-ink-4">·</span> : null}
              <span><b className="font-semibold text-ink tabular-nums">{n}</b> {label}</span>
            </Fragment>
          ))}
        </p>
        {viewer?.publicAuthorId ? (
          <Link href={`/u/${encodeURIComponent(viewer.publicAuthorId)}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            {p.viewProfile}
            {icon(ArrowRight)}
          </Link>
        ) : null}
      </div>
      <WorkGrid>
        {items.map((item) => (
          <li key={item.workId} className="min-w-0">
            <OwnCard item={item} entries={entries(item)} />
          </li>
        ))}
      </WorkGrid>
      {command.error && !target ? <p role="alert" className="mt-4 text-footnote text-danger">{command.error}</p> : null}
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => { if (!open) setConfirming(null); }}
        title={copy?.title ?? ''}
        description={copy?.text ?? ''}
        confirmLabel={command.uncertain ? p.retryConfirm : copy?.label ?? ''}
        danger
        busy={command.busy}
        locked={command.uncertain}
        error={command.error ? `${command.error}${command.uncertain ? ` ${p.uncertain}` : ''}` : null}
        onConfirm={() => {
          if (!target) return;
          const { item, action } = target;
          if (action === 'withdraw_work') void command.run({ action, url: `/api/community/works/${item.workId}/withdraw`, targetId: item.workId, expectedVersion: item.workVersion });
          else if (item.latest) void command.run({ action, url: `/api/community/revisions/${item.latest.id}/withdraw`, targetId: item.latest.id, expectedVersion: item.latest.version });
        }}
      />
    </section>
  );
}
