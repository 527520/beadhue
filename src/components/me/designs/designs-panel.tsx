'use client';

import { ArrowUpDown, CircleAlert, Cloud, CloudOff, Copy, FileDown, FolderOpen, LayoutGrid, List, Pencil, Plus, RefreshCw, Search, TriangleAlert, Trash2, Upload } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { cn } from '@/lib/cn';
import { LIMITS } from '@/lib/appInfo';
import type { StorageAdapter } from '@/lib/storage';
import type { BeadhueApi } from '@/lib/sync/api';
import { zhCN } from '@/messages/zh-CN';
import { Button, buttonVariants } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { SearchField } from '@/components/ui/search-field';
import { useToast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import { useIsMobile } from '@/components/ui/use-media-query';
import { WorkCardSkeleton, WorkGrid } from '@/components/works/community-work-card';
import { useLoginDialog } from '@/components/shell/login-dialog';
import type { ActionEntry } from '../action-menu';
import { Banner } from '../banner';
import { ChoiceMenu } from '../choice-menu';
import { ConfirmDialog } from '../confirm-dialog';
import { formatGb, usagePercent } from '../format';
import { useMe } from '../me-context';
import { useOriginalUsage } from '../use-original-usage';
import { DesignCard } from './design-card';
import { DesignTable } from './design-table';
import { DESIGN_SORTS, DESIGN_STATUSES, deleteNote, designsQueryString, filterDesigns, statusCounts, type DesignsQuery, type LibraryDesign } from './design-model';
import { useDesignLibrary, type ActionResult } from './use-design-library';

const t = zhCN.me.designs;
const icon = (Icon: typeof Plus) => <Icon aria-hidden="true" strokeWidth={1.75} />;

export interface DesignsPanelProps {
  initialQuery: DesignsQuery;
  storageOverride?: StorageAdapter | null;
  apiOverride?: BeadhueApi;
  loadPublishedIds?: () => Promise<ReadonlySet<string>>;
}

function RenameDialog({ design, onClose, onSave }: { design: LibraryDesign; onClose: () => void; onSave: (name: string) => Promise<ActionResult> }) {
  const [value, setValue] = useState(design.name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busy) return;
    if (!value.trim()) {
      setError(t.renameRequired);
      return;
    }
    setBusy(true);
    const result = await onSave(value);
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.message);
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t.renameTitle}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} noValidate className="contents">
          <DialogBody>
            <Field label={t.renameLabel} error={error}>
              <Input
                autoFocus
                value={value}
                maxLength={LIMITS.designNameLength}
                autoComplete="off"
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => { setValue(event.target.value); setError(null); }}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" disabled={busy} onClick={onClose}>{zhCN.me.cancel}</Button>
            <Button type="submit" variant="primary" loading={busy} disabled={value.trim() === design.name}>{zhCN.me.save}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StorageBanner() {
  const { usage } = useOriginalUsage(true);
  if (!usage || usage === 'error') return null;
  const percent = usagePercent(usage.bytes, usage.quotaBytes);
  if (percent < 80) return null;
  return (
    <Banner tone="warning" icon={icon(TriangleAlert)} wideAction role="status" action={<Link href="/me/settings#storage" className="rounded-sm font-medium text-accent hover:underline hover:underline-offset-3 focus-visible:focus-ring">{t.manageStorage}</Link>}>
      <b className="mr-2 font-semibold text-ink max-md:block">{t.storageTitle}</b>
      {t.storageBody(percent, formatGb(usage.bytes), formatGb(usage.quotaBytes))}
    </Banner>
  );
}

/**
 * 我的 · 设计：提示横幅、工具条（实时搜索、状态芯片带数量、排序、网格 / 列表、新建）、
 * 卡片网格或表格、空状态与搜索无结果。筛选状态写进地址（replaceState），刷新后保持。
 */
export function DesignsPanel({ initialQuery, storageOverride, apiOverride, loadPublishedIds }: DesignsPanelProps) {
  const lib = useDesignLibrary({ storageOverride, apiOverride, loadPublishedIds });
  const { setDesignCount, refreshStats } = useMe();
  const toast = useToast();
  const login = useLoginDialog();
  const mobile = useIsMobile();
  const [query, setQuery] = useState(initialQuery);
  const [searchOpen, setSearchOpen] = useState(Boolean(initialQuery.q));
  const [renaming, setRenaming] = useState<LibraryDesign | null>(null);
  const [deleting, setDeleting] = useState<LibraryDesign | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const guest = lib.me !== 'loading' && lib.me.state === 'guest';
  const cloud = lib.verified;

  useEffect(() => {
    const next = `${window.location.pathname}${designsQueryString(query)}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(null, '', next);
  }, [query]);

  useEffect(() => {
    if (lib.loaded) setDesignCount(lib.designs.length);
  }, [lib.loaded, lib.designs.length, setDesignCount]);
  useEffect(() => () => setDesignCount(null), [setDesignCount]);

  const patch = (next: Partial<DesignsQuery>) => setQuery((current) => ({ ...current, ...next }));
  const report = (result: ActionResult, done: (name?: string) => string) => {
    if (result.ok) {
      toast(done(result.name));
      refreshStats();
    } else toast(result.message, { icon: icon(CircleAlert) });
  };

  const entries = (design: LibraryDesign): ActionEntry[] => [
    { key: 'open', label: t.actions.open, icon: icon(FolderOpen), onSelect: () => void lib.open(design) },
    { key: 'rename', label: t.actions.rename, icon: icon(Pencil), onSelect: () => setRenaming(design) },
    { key: 'duplicate', label: t.actions.duplicate, icon: icon(Copy), onSelect: () => void lib.duplicate(design).then((result) => report(result, (name) => t.duplicated(name ?? ''))) },
    { key: 'export', label: t.actions.export, icon: icon(FileDown), onSelect: () => void lib.exportFile(design).then((result) => report(result, () => t.exported)) },
    ...(cloud && design.status === 'unsynced' ? [{ key: 'sync', label: t.actions.sync, icon: icon(Cloud), onSelect: () => void lib.retrySync().then((ok) => (ok ? toast(t.synced) : toast(t.syncFailed, { icon: icon(CircleAlert) }))) }] : []),
    'separator',
    { key: 'delete', label: t.actions.delete, icon: icon(Trash2), danger: true, onSelect: () => { setDeleteError(null); setDeleting(design); } },
  ];

  const { matched, shown } = filterDesigns(lib.designs, query);
  const counts = statusCounts(matched);
  const statuses = DESIGN_STATUSES.filter((id) => id !== 'published' || cloud);
  const hasDesigns = lib.designs.length > 0;
  const initialLoading = !lib.loaded && !lib.error;
  const listView = query.view === 'list' && !mobile;
  const sortLabel = t.sorts[query.sort];

  const clearSearch = () => {
    patch({ q: '' });
    searchRef.current?.focus();
  };

  let results;
  if (initialLoading) {
    results = <WorkGrid>{Array.from({ length: 5 }, (_, index) => <WorkCardSkeleton key={index} />)}</WorkGrid>;
  } else if (lib.error && !hasDesigns) {
    results = null;
  } else if (!hasDesigns) {
    results = (
      <EmptyState
        kind="designs"
        title={t.emptyTitle}
        description={t.emptyText}
        actions={<>
          <Link href="/app" className={buttonVariants({ variant: 'primary' })}>{icon(Upload)}{t.upload}</Link>
          <Link href="/app?blank=1" className={buttonVariants({ variant: 'secondary' })}>{t.blank}</Link>
        </>}
      />
    );
  } else if (!shown.length) {
    const q = query.q.trim();
    const scoped = query.status !== 'all';
    results = q ? (
      <EmptyState
        compact
        kind="search"
        title={t.noMatch(q)}
        description={scoped ? t.noMatchScope(t.statuses[query.status]) : undefined}
        actions={<>
          <Button onClick={clearSearch}>{t.clearSearch}</Button>
          {scoped ? <Button variant="ghost" onClick={() => patch({ status: 'all' })}>{t.showAllStatuses}</Button> : null}
        </>}
      />
    ) : (
      <EmptyState compact kind="designs" title={t.noStatus[query.status as Exclude<DesignsQuery['status'], 'all'>]} actions={<Button onClick={() => patch({ status: 'all' })}>{t.showAll}</Button>} />
    );
  } else if (listView) {
    results = <DesignTable designs={shown} cloud={cloud} now={lib.now} entries={entries} onOpen={(design) => void lib.open(design)} />;
  } else {
    results = (
      <WorkGrid>
        {shown.map((design) => (
          <li key={design.id} className="min-w-0">
            <DesignCard design={design} cloud={cloud} now={lib.now} opening={lib.opening === design.id} entries={entries(design)} onOpen={() => void lib.open(design)} />
          </li>
        ))}
      </WorkGrid>
    );
  }

  const searching = searchOpen || Boolean(query.q);
  return (
    <section aria-label={t.region} className="grid">
      {cloud ? <StorageBanner /> : null}
      {guest ? (
        <Banner icon={icon(CloudOff)} action={<Button size="sm" onClick={() => login?.open({ onSuccess: () => window.location.reload() })}>{zhCN.me.login}</Button>}>
          {t.guestBanner}
        </Banner>
      ) : null}
      {lib.conflicts.length > 0 ? <Banner tone="warning" icon={icon(TriangleAlert)} role="status">{t.conflictBanner(lib.conflicts.length)}</Banner> : null}
      {lib.cloudFailed ? (
        <Banner icon={icon(CloudOff)} role="status" action={<Button size="sm" loading={lib.syncing} onClick={() => void lib.retrySync()}>{icon(RefreshCw)}{t.retrySync}</Button>}>
          {t.syncFailed}
        </Banner>
      ) : null}
      {lib.error ? (
        <Banner tone="warning" icon={icon(CircleAlert)} role="alert" action={<Button size="sm" onClick={() => { lib.clearError(); void lib.load(); }}>{zhCN.me.retry}</Button>}>
          {lib.error}
        </Banner>
      ) : null}

      {hasDesigns ? (
        <div className="mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 max-md:mb-4 md:gap-3 lg:grid-cols-[minmax(200px,260px)_auto_minmax(0,1fr)_auto]">
          <div className={cn('col-span-2 row-start-2 md:col-span-1 md:col-start-1 md:row-start-1 lg:col-start-1', !searching && 'max-md:hidden')}>
            <SearchField
              ref={searchRef}
              value={query.q}
              onValueChange={(q) => patch({ q })}
              onKeyDown={(event) => { if (event.key === 'Escape' && query.q) { event.stopPropagation(); clearSearch(); } }}
              placeholder={t.searchLabel}
              aria-label={t.searchLabel}
              autoComplete="off"
              enterKeyHint="search"
              className="text-body-sm"
              wrapperClassName="h-control-md gap-2 pr-1 pl-4 md:h-control-sm md:pl-3 md:[&_[data-slot=icon-button]]:size-6"
            />
          </div>
          <div role="group" aria-label={t.statusGroup} className="col-start-1 row-start-1 flex min-w-0 gap-2 max-md:-ml-gutter max-md:overflow-x-auto max-md:pl-gutter max-md:[mask-image:linear-gradient(90deg,black_calc(100%-24px),transparent)] max-md:[scrollbar-width:none] md:col-span-2 md:row-start-2 lg:col-span-1 lg:col-start-2 lg:row-start-1 [&::-webkit-scrollbar]:hidden">
            {statuses.map((id) => (
              <Chip key={id} selected={query.status === id} count={counts[id]} onClick={() => patch({ status: id })}>{t.statuses[id]}</Chip>
            ))}
          </div>
          <div className="col-start-2 row-start-1 flex items-center gap-1 md:gap-2 lg:col-start-4">
            {mobile ? (
              <IconButton size="sm" label={t.searchToggle} tooltip={false} aria-expanded={searching} className={cn(searching ? 'bg-ink text-on-ink hover:bg-ink' : 'hover:bg-bg-muted')} onClick={() => {
                if (searching) { setSearchOpen(false); patch({ q: '' }); } else { setSearchOpen(true); window.setTimeout(() => searchRef.current?.focus(), 0); }
              }}>
                {icon(Search)}
              </IconButton>
            ) : null}
            <ChoiceMenu title={t.sortTitle} label={t.sortCurrent(sortLabel)} value={query.sort} options={DESIGN_SORTS.map((id) => [id, t.sorts[id]] as const)} onChange={(sort) => patch({ sort })} icon={icon(ArrowUpDown)} />
            <div role="group" aria-label={t.view} className="inline-flex gap-0.5 rounded-full bg-bg-muted p-0.75 max-md:hidden">
              {([['grid', t.grid, LayoutGrid], ['list', t.list, List]] as const).map(([view, label, Icon]) => (
                <Tooltip key={view} content={label}>
                  <button type="button" aria-label={label} aria-pressed={query.view === view} onClick={() => patch({ view })} className="inline-grid h-6.5 w-8 place-items-center rounded-full text-ink-3 transition-[background-color,color,box-shadow] duration-state hover:text-ink focus-visible:focus-ring aria-pressed:bg-bg aria-pressed:text-ink aria-pressed:shadow-seg [&>svg]:size-4">
                    <Icon aria-hidden="true" strokeWidth={1.75} />
                  </button>
                </Tooltip>
              ))}
            </div>
            <Link href="/app" className={cn(buttonVariants({ variant: 'primary', size: 'sm' }), 'max-md:hidden')}>{icon(Plus)}{t.create}</Link>
          </div>
        </div>
      ) : null}

      {results}
      <p role="status" className="sr-only">{initialLoading ? t.loading : lib.opening ? t.opening : ''}</p>

      {renaming ? (
        <RenameDialog
          key={renaming.id}
          design={renaming}
          onClose={() => setRenaming(null)}
          onSave={async (name) => {
            const result = await lib.rename(renaming, name);
            if (result.ok) toast(t.renamed(result.name ?? name));
            return result;
          }}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => { if (!open) setDeleting(null); }}
        title={t.deleteTitle}
        description={deleting ? t.deleteText(deleting.name, deleteNote(deleting)) : ''}
        confirmLabel={t.actions.delete}
        danger
        busy={lib.mutating}
        error={deleteError}
        onConfirm={() => {
          const target = deleting;
          if (!target || lib.mutating) return;
          setDeleteError(null);
          void lib.remove(target).then((result) => {
            if (result.ok) {
              setDeleting(null);
              toast(t.deleted(target.name), { icon: icon(Trash2) });
              refreshStats();
            } else setDeleteError(result.message);
          });
        }}
      />
    </section>
  );
}
