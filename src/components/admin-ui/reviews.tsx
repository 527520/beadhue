'use client';

import { Check, ChevronDown, ChevronUp, CircleAlert, Info, Plus, Tag, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CommunityPreviewV1 } from '@/lib/community/snapshot';
import type { CommunityRevisionInspection } from '@/lib/community/queries';
import { track } from '@/lib/analytics/client';
import { cn } from '@/lib/cn';
import { colorUsage } from '@/lib/render/beads';
import { zhCN } from '@/messages/zh-CN';
import { useAdminCommand } from '@/components/admin/useAdminCommand';
import { useAdminInspection } from '@/components/admin/useAdminInspection';
import { useAdminPage } from '@/components/admin/useAdminPage';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { BeadImage } from '@/components/ui/bead-image';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { FormAlert } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useAdminCounts } from './admin-shell';
import { fmtAgo, fmtNum } from './format';
import { CommandAlert, ReasonDialog } from './overlays';
import { AdminCard, CardHead, Note, Thumb } from './parts';

const t = zhCN.adminUi.reviews;
const icon = (Icon: typeof Check) => <Icon aria-hidden="true" strokeWidth={1.75} />;

interface ReviewItem {
  revisionId: string; workId: string; revisionNumber: number; title: string; version: number;
  width: number; height: number; colorCount: number; boardProfile: string; submittedAt: string | null; suggestedTags: string[];
  author: { displayName: string; publicAuthorId: string; authorType: string }; preview: CommunityPreviewV1;
}

function Original({ revisionId, title }: { revisionId: string; title: string }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
  return (
    <div className="relative grid aspect-square max-h-80 w-full place-items-center overflow-hidden rounded-lg bg-bg-subtle">
      {status === 'missing' ? <p className="px-6 text-center text-body-sm text-ink-3">{t.originalMissing}</p> : (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={revisionId} src={`/api/admin/community/revisions/${revisionId}/original`} alt={t.originalAlt(title)} decoding="async"
          onLoad={() => setStatus('ready')} onError={() => setStatus('missing')} className="size-full object-cover" />
      )}
      {status === 'loading' ? <Skeleton className="absolute inset-0 rounded-none" /> : null}
    </div>
  );
}

function SuggestedTags({ item, detail, onAdopted }: { item: ReviewItem; detail: CommunityRevisionInspection; onAdopted: () => void }) {
  const toast = useToast();
  const command = useAdminCommand();
  const adopted = new Set(detail.workTags.map((tag) => tag.name.toLowerCase()));
  const pending = detail.suggestedTags.filter((name) => !adopted.has(name.toLowerCase()));
  const adopt = (names: string[]) => command.run<{ adopted: string[] }>(
    { url: `/api/admin/community/revisions/${item.revisionId}/suggested-tags`, method: 'POST', body: { tags: names } },
    (body) => { toast(t.adoptDone((body.adopted?.length ? body.adopted : names).join('、')), { icon: icon(Tag) }); onAdopted(); },
  );
  return (
    <section className="mx-6 mt-5 grid gap-3 border-t border-line pt-4 max-md:mx-4">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-title-3 text-ink">{t.tagsTitle}</h3>
        {pending.length > 1 ? <Button size="sm" variant="ghost" disabled={command.locked} onClick={() => void adopt(pending)}>{t.adoptAll}</Button> : null}
      </header>
      {detail.suggestedTags.length ? (
        <div className="flex flex-wrap gap-2">
          {detail.suggestedTags.map((name) => adopted.has(name.toLowerCase())
            ? <Chip key={name} selected disabled icon={icon(Check)} aria-label={`${name}，${t.adopted}`}>{name}</Chip>
            : <Chip key={name} variant="outline" icon={icon(Plus)} disabled={command.locked} aria-label={t.adoptLabel(name)} onClick={() => void adopt([name])}>{name}</Chip>)}
        </div>
      ) : <p className="text-body-sm text-ink-3">{t.noSuggested}</p>}
      <p className="text-caption font-normal text-ink-3">{t.tagsHelp}</p>
      <CommandAlert command={command} />
    </section>
  );
}

/**
 * 作品审核台（原型 admin/reviews.js）：左侧队列（进入时自动选中第一项）、右侧图纸与作者原图等高并排、
 * 建议标签一键采纳（D68）、原创与许可核对清单、决定栏；J / K 切换、A 通过、R 驳回。
 */
export function ReviewConsole({ initialId }: { initialId?: string }) {
  const toast = useToast();
  const { refresh: refreshCounts } = useAdminCounts();
  const queue = useAdminPage<ReviewItem>('/api/admin/community/revisions', 'reviews');
  const command = useAdminCommand();
  const [currentId, setCurrentId] = useState<string | null>(initialId ?? null);
  const [checks, setChecks] = useState<Record<string, boolean[]>>({});
  const [checkError, setCheckError] = useState(false);
  const [dialog, setDialog] = useState<'approve' | 'reject' | null>(null);
  const queueRef = useRef<HTMLOListElement>(null);
  const items = queue.items;
  const index = Math.max(0, items.findIndex((item) => item.revisionId === currentId));
  const item = items[index] ?? null;
  const inspection = useAdminInspection<CommunityRevisionInspection>(item ? `/api/admin/community/revisions/${item.revisionId}` : null);
  const detail = inspection.data?.id === item?.revisionId ? inspection.data : null;
  const ready = Boolean(item && detail && detail.status === 'pending_review' && detail.lifecycleStatus === 'active' && detail.version === item.version);
  const itemChecks = useMemo(() => (item ? checks[item.revisionId] ?? t.checks.map(() => false) : []), [item, checks]);
  const missing = itemChecks.filter((on) => !on).length;
  const usage = useMemo(() => (detail ? colorUsage(detail.snapshot.pattern) : []), [detail]);
  const beads = usage.reduce((sum, color) => sum + color.count, 0);

  const select = useCallback((next: number, focus = false) => {
    if (next < 0 || next >= items.length || command.locked) return;
    setCurrentId(items[next].revisionId);
    setCheckError(false);
    command.resetNotice();
    if (focus) window.requestAnimationFrame(() => queueRef.current?.querySelector<HTMLElement>('[aria-current=true]')?.focus());
  }, [items, command]);
  const approve = useCallback(() => {
    if (!item || !ready) return;
    if (missing) { setCheckError(true); document.querySelector<HTMLElement>(`[data-check="${itemChecks.indexOf(false)}"]`)?.focus(); return; }
    command.resetNotice(); setDialog('approve');
  }, [item, ready, missing, itemChecks, command]);
  const reject = useCallback(() => { if (item && ready) { command.resetNotice(); setDialog('reject'); } }, [item, ready, command]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || dialog) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input:not([type=checkbox]), textarea, select, [contenteditable], [role=dialog]') || document.querySelector('[role=dialog]')) return;
      const key = event.key.toLowerCase();
      if (key === 'j') { event.preventDefault(); select(index + 1, true); }
      if (key === 'k') { event.preventDefault(); select(index - 1, true); }
      if (key === 'a') { event.preventDefault(); approve(); }
      if (key === 'r') { event.preventDefault(); reject(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, select, approve, reject, dialog]);

  const decide = async (reason: string) => {
    if (!item || !dialog) return;
    const decision = dialog === 'approve' ? 'published' : 'rejected';
    const title = item.title;
    await command.run({ url: `/api/admin/community/revisions/${item.revisionId}/review`, method: 'POST', body: { decision, expectedVersion: item.version, reason } }, async () => {
      track({ name: 'community_reviewed', properties: { decision } });
      if (decision === 'published') track({ name: 'community_published', properties: {} });
      setDialog(null);
      toast(decision === 'published' ? t.approved(title) : t.rejected(title), { icon: icon(decision === 'published' ? Check : X) });
      const nextId = items[index + 1]?.revisionId ?? items[index - 1]?.revisionId ?? null;
      setCurrentId(nextId);
      await queue.reload();
      refreshCounts();
    });
  };

  if (queue.error && !items.length) {
    return <AdminCard className="grid justify-items-start gap-3 p-5"><FormAlert>{queue.error}</FormAlert><Button size="sm" onClick={() => void queue.reload()}>{zhCN.adminUi.table.retry}</Button></AdminCard>;
  }
  if (queue.loading && !items.length) return <AdminCard className="grid gap-3 p-5" role="status" aria-label={zhCN.adminUi.table.loading}><Skeleton className="h-16" /><Skeleton className="h-80" /></AdminCard>;
  if (!items.length || !item) {
    return (
      <AdminCard className="grid min-h-105 flex-1 place-items-center">
        <EmptyState kind="designs" title={t.empty} description={t.emptyText} actions={<Button nativeButton={false} render={<Link href="/admin/works" />}>{t.emptyAction}</Button>} />
      </AdminCard>
    );
  }
  const suggested = item.suggestedTags;
  return (
    <div className="grid flex-1 items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)] max-lg:gap-4">
      <AdminCard aria-label={t.queue} className="overflow-hidden lg:sticky lg:top-[calc(var(--spacing-topbar)+24px)]">
        <CardHead title={t.pending}>
          <span className="text-body-sm text-ink-3 tabular-nums">{t.count(queue.total)}</span>
          <span className="ml-auto text-body-sm text-ink-3 max-md:hidden">{t.order}</span>
        </CardHead>
        <ol ref={queueRef} className="grid gap-1 p-2 max-lg:flex max-lg:snap-x max-lg:overflow-x-auto max-lg:[scrollbar-width:none]">
          {items.map((entry, position) => (
            <li key={entry.revisionId} className="max-lg:shrink-0 max-lg:basis-60 max-lg:snap-start max-md:basis-55">
              <button type="button" aria-current={position === index ? 'true' : undefined} onClick={() => select(position)}
                className="group flex w-full items-center gap-3 rounded-md p-2.5 text-left transition-colors duration-state hover:bg-bg-subtle focus-visible:focus-ring aria-[current=true]:bg-bg-muted aria-[current=true]:inset-ring-1 aria-[current=true]:inset-ring-line-strong">
                <Thumb revisionId={entry.revisionId} size="lg" />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="flex min-w-0 items-center gap-2 text-body-sm font-semibold text-ink"><span className="truncate">{entry.title}</span>{entry.revisionNumber > 1 ? <Badge>R{entry.revisionNumber}</Badge> : null}</span>
                  {/* 选中底（bg-muted）上 ink-3 只有 4.43:1，次要文字加深到 ink-2。 */}
                  <span className="truncate text-caption font-normal text-ink-3 group-aria-[current=true]:text-ink-2">{entry.author.displayName} · {fmtAgo(entry.submittedAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </AdminCard>

      <AdminCard aria-live="polite" aria-label={item.title} className="flex min-w-0 flex-col">
        <header className="flex items-start gap-4 px-5 pt-5 pl-6 max-md:px-4 max-md:pt-4">
          <div className="grid min-w-0 flex-1 gap-1.5">
            <span className="flex min-w-0 items-center gap-2.5">
              <h2 className="truncate text-title-2 text-ink">{item.title}</h2>
              <Badge tone={item.revisionNumber > 1 ? 'info' : 'neutral'}>{item.revisionNumber > 1 ? t.revision(item.revisionNumber) : t.first}</Badge>
            </span>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-ink-3 [&>span]:whitespace-nowrap [&>span:not(:last-child)]:after:ml-2 [&>span:not(:last-child)]:after:content-['·']">
              <span className="inline-flex items-center gap-1.5"><Avatar id={item.author.publicAuthorId} name={item.author.displayName} size="xs" />{item.author.displayName}</span>
              <span>{t.submitted(fmtAgo(item.submittedAt))}</span>
              <span className="tabular-nums">{t.stats(item.width, item.height, item.colorCount, detail ? fmtNum(beads) : '…')}</span>
              {suggested.length ? <span className="max-xl:hidden">{t.suggested(suggested.join('、'))}</span> : null}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span className="mr-1 text-body-sm text-ink-3 tabular-nums">{t.position(index + 1, items.length)}</span>
            <IconButton size="sm" label={t.prev} tooltip={t.prevTip} disabled={index === 0} onClick={() => select(index - 1)} className="max-md:hidden">{icon(ChevronUp)}</IconButton>
            <IconButton size="sm" label={t.next} tooltip={t.nextTip} disabled={index === items.length - 1} onClick={() => select(index + 1)} className="max-md:hidden">{icon(ChevronDown)}</IconButton>
          </div>
        </header>
        {detail?.previous ? <Note icon={icon(Info)} className="mx-6 mt-4 max-md:mx-4 max-md:mt-3">{t.previous(detail.previous.revisionNumber)}</Note> : null}
        <div className="grid grid-cols-2 gap-4 px-6 pt-4 max-md:gap-2.5 max-md:px-4 max-md:pt-3">
          <figure className="m-0 grid min-w-0 gap-2">
            <figcaption className="flex items-baseline justify-between gap-2 text-caption font-normal whitespace-nowrap text-ink-3"><b className="text-body-sm font-semibold text-ink">{t.pattern}</b><span className="max-xl:hidden tabular-nums">{t.patternMeta(item.width, item.height)}</span></figcaption>
            <div className="grid aspect-square max-h-80 w-full place-items-center overflow-hidden rounded-lg bg-bg-subtle">
              {detail ? <BeadImage pattern={detail.snapshot.pattern} alt={t.patternAlt(item.title)} lazy={false} className="size-[86%] rounded-md ring-1 ring-line" /> : <Skeleton className="size-full rounded-none" />}
            </div>
          </figure>
          <figure className="m-0 grid min-w-0 gap-2">
            <figcaption className="flex items-baseline justify-between gap-2 text-caption font-normal whitespace-nowrap text-ink-3"><b className="text-body-sm font-semibold text-ink">{t.original}</b><span className="max-xl:hidden">{t.originalMeta}</span></figcaption>
            <Original revisionId={item.revisionId} title={item.title} />
          </figure>
        </div>
        {detail ? <SuggestedTags item={item} detail={detail} onAdopted={() => void inspection.reload()} /> : null}
        <fieldset className={cn('mx-6 mt-5 min-w-0 border-0 border-t border-line p-0 pt-4 max-md:mx-4')}>
          <legend className="float-left mb-3 flex w-full items-baseline justify-between p-0 text-title-3 text-ink">
            <span>{t.checklist}</span><span className="text-body-sm font-normal text-ink-3 tabular-nums">{t.checkCount(itemChecks.filter(Boolean).length, t.checks.length)}</span>
          </legend>
          <div className="clear-both grid gap-x-6 gap-y-2.5 xl:grid-cols-2">
            {t.checks.map((text, position) => (
              <label key={text} className="flex cursor-pointer items-start gap-2.5 text-body-sm text-ink">
                <Checkbox data-check={position} checked={itemChecks[position]} className={cn('mt-0.5', checkError && !itemChecks[position] && 'border-danger')}
                  onCheckedChange={(checked) => {
                    const next = itemChecks.map((on, i) => (i === position ? Boolean(checked) : on));
                    setChecks({ ...checks, [item.revisionId]: next });
                    if (next.every(Boolean)) setCheckError(false);
                  }} />
                <span>{text}</span>
              </label>
            ))}
          </div>
          {checkError && missing ? <p role="alert" className="mt-3 flex items-center gap-1.5 text-footnote text-danger [&>svg]:size-4">{icon(CircleAlert)}{t.checkMissing(missing)}</p> : null}
        </fieldset>
        {!ready && detail ? <p className="mx-6 mt-3 text-body-sm text-warning max-md:mx-4">{t.stale}</p> : null}
        <footer className="sticky bottom-0 mt-5 flex items-center gap-3 rounded-b-lg border-t border-line bg-bg py-3.5 pr-5 pl-6 max-xl:flex-wrap max-md:mt-4 max-md:px-4 max-md:pb-[calc(12px+env(safe-area-inset-bottom))]">
          <Button variant="danger-outline" disabled={!ready} onClick={reject} className="max-md:h-control-lg max-md:flex-1">{icon(X)}{t.reject}</Button>
          <span aria-hidden="true" className="inline-flex min-w-0 flex-1 items-center justify-end gap-1 overflow-hidden text-caption font-normal whitespace-nowrap text-ink-3 max-xl:order-3 max-xl:basis-full max-xl:justify-start max-md:hidden [@media(hover:none)]:invisible">
            <Kbd>J</Kbd> / <Kbd>K</Kbd> {t.hint.switch} · <Kbd>A</Kbd> {t.hint.approve} · <Kbd>R</Kbd> {t.hint.reject}
          </span>
          <Button variant="primary" disabled={!ready} onClick={approve} className="max-xl:ml-auto max-md:ml-0 max-md:h-control-lg max-md:flex-1">{icon(Check)}{t.approve}</Button>
        </footer>
      </AdminCard>

      {dialog ? (
        <ReasonDialog open onOpenChange={(next) => { if (!next) setDialog(null); }}
          {...(dialog === 'approve'
            ? { title: t.approveDialog.title(item.title), subject: t.approveDialog.subject, label: t.approveDialog.label, quick: [...t.approveDialog.quick], confirmLabel: t.approveDialog.confirm, tone: 'primary' as const, defaultReason: t.approveDialog.defaultReason }
            : { title: t.rejectDialog.title(item.title), subject: t.rejectDialog.subject, label: t.rejectDialog.label, hint: t.rejectDialog.hint, quick: [...t.rejectDialog.quick], confirmLabel: t.rejectDialog.confirm, tone: 'danger' as const })}
          command={command} onConfirm={decide} />
      ) : null}
    </div>
  );
}
