'use client';

import { Ban, ExternalLink, Eye, EyeOff, Heart, Info, Lock, LockOpen, Plus, RefreshCw, Star, Tag } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { AdminAuditEntry } from '@/lib/admin/queries';
import type { ManagedCommunityWork, ManagedWorkInspection } from '@/lib/community/adminQueries';
import { colorUsage } from '@/lib/render/beads';
import { zhCN } from '@/messages/zh-CN';
import { useAuthStatus } from '@/components/account/useAuthStatus';
import { useAdminCommand } from '@/components/admin/useAdminCommand';
import { useAdminInspection } from '@/components/admin/useAdminInspection';
import { Badge } from '@/components/ui/badge';
import { BeadImage } from '@/components/ui/bead-image';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Chip, RemovableChip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useAdminCounts } from './admin-shell';
import { bulkWrite } from './bulk';
import { BatchButton, DataTable, TitleCell, type Column, type RowMenuEntry } from './data-table';
import { fmtDate, fmtNum } from './format';
import { AdminDrawer, CommandAlert, ConfirmDialog, ReasonDialog, Spacer, type CommandState } from './overlays';
import { CopyId, Dl, DrawerSection, Mono, Note, Person, Thumb } from './parts';
import { exportCsv, useAdminTable } from './use-admin-table';

const t = zhCN.adminUi.works;
const revisionStates = zhCN.communityAdmin.states.revision;
const auditActions = zhCN.communityAdmin.audit.actions;
const roles = zhCN.communityAdmin.states.role;
const icon = (Icon: typeof Star) => <Icon aria-hidden="true" strokeWidth={1.75} />;
const ENDPOINT = '/api/admin/community/works';
const csv = zhCN.adminUi.csv;
const x = csv.works;

type Work = ManagedCommunityWork;
type Action = 'takedown' | 'restore' | 'feature' | 'unfeature' | 'lock' | 'unlock';
const API_ACTION: Record<Action, string> = { takedown: 'remove', restore: 'restore', feature: 'feature', unfeature: 'unfeature', lock: 'lock_comments', unlock: 'unlock_comments' };

const titleOf = (work: Pick<Work, 'title'>) => work.title ?? t.noTitle;
const statusTone = { active: 'success', withdrawn: 'neutral', removed: 'danger' } as const;
export const WorkStatus = ({ status }: { status: Work['lifecycleStatus'] }) => <Badge tone={statusTone[status]} dot>{t.status[status]}</Badge>;
const PublicCell = ({ work }: { work: Work }) => work.isPublic
  ? <Badge>{icon(Eye)}{t.public}</Badge>
  : <span className="inline-flex items-center gap-1 text-body-sm whitespace-nowrap text-ink-3 [&>svg]:size-4">{icon(EyeOff)}{t.hidden}</span>;
const FeaturedBadge = () => <Badge tone="featured"><Star aria-hidden="true" strokeWidth={1.75} className="fill-current" />{t.featured}</Badge>;

function TagsCell({ tags }: { tags: string[] }) {
  if (!tags.length) return <span className="text-ink-3">—</span>;
  return (
    <span className="inline-flex items-center gap-1">
      {tags.slice(0, 2).map((name) => <Badge key={name}>{name}</Badge>)}
      {tags.length > 2 ? <span className="pl-0.5 text-caption text-ink-3 tabular-nums">+{tags.length - 2}</span> : null}
    </span>
  );
}

function useActiveTags() {
  const [tags, setTags] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/admin/community/tags?state=on&size=100', { cache: 'no-store', signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { items?: Array<{ id: string; name: string }> } | null) => { if (body?.items) setTags(body.items.map(({ id, name }) => ({ id, name }))); })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return tags;
}

function History({ workId }: { workId: string }) {
  const [items, setItems] = useState<AdminAuditEntry[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/audit?q=${workId}&size=10`, { cache: 'no-store', signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { items?: AdminAuditEntry[] } | null) => setItems(body?.items ?? []))
      .catch(() => {});
    return () => controller.abort();
  }, [workId]);
  if (!items) return <Skeleton className="h-16" />;
  if (!items.length) return <p className="text-body-sm text-ink-3">{t.drawer.noHistory}</p>;
  return (
    <ol className="grid gap-2.5">
      {items.map((item) => (
        <li key={item.id} className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 text-body-sm text-ink-2 max-md:grid-cols-1 max-md:gap-0">
          <span className="text-ink-3 tabular-nums">{fmtDate(item.createdAt)}</span>
          <span><b className="font-semibold text-ink">{roles[item.actorRole]}</b> {auditActions[item.action as keyof typeof auditActions] ?? item.action}{item.reason ? `：${item.reason}` : ''}</span>
        </li>
      ))}
    </ol>
  );
}

function TagEditor({ work, detail, suggestions, onSaved }: { work: Work; detail: ManagedWorkInspection; suggestions: string[]; onSaved: (version: number, tags: Array<{ id: string; name: string }>) => void }) {
  const d = t.drawer;
  const toast = useToast();
  const command = useAdminCommand();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const names = detail.tags.map((tag) => tag.name);
  const save = (next: string[], message: string) => command.run<{ workId: string; version: number; tags: Array<{ id: string; name: string }> }>(
    { url: `${ENDPOINT}/${work.id}/tags`, method: 'PUT', body: { expectedVersion: detail.version, tags: next } },
    (saved) => { onSaved(saved.version, saved.tags ?? []); toast(message, { icon: icon(Tag) }); },
  );
  const add = (raw: string) => {
    const name = raw.trim();
    if (!name) { setError(d.tagEmpty); return; }
    if (names.some((item) => item.toLowerCase() === name.toLowerCase())) { setError(d.tagDuplicate(name)); return; }
    setError(''); setValue('');
    void save([...names, name], d.tagAdded(name));
  };
  const common = suggestions.filter((name) => !names.includes(name)).slice(0, 5);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {names.length ? names.map((name) => (
          <RemovableChip key={name} removeLabel={d.removeTag(name)} onRemove={() => { if (!command.locked) void save(names.filter((item) => item !== name), d.tagRemoved(name)); }}>{name}</RemovableChip>
        )) : <span className="text-body-sm text-ink-3">{d.noTags}</span>}
      </div>
      <form noValidate className="grid gap-3" onSubmit={(event) => { event.preventDefault(); add(value); }}>
        <Field label={<span className="sr-only">{d.addTag}</span>} error={error || undefined}>
          <div className="flex gap-2">
            <Input value={value} maxLength={12} autoComplete="off" placeholder={d.tagPlaceholder} aria-label={d.addTag} disabled={command.locked}
              onChange={(event) => { setValue(event.target.value); if (error) setError(''); }} />
            <Button type="submit" disabled={command.locked}>{d.add}</Button>
          </div>
        </Field>
        {common.length ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-body-sm text-ink-3">{d.common}</span>
            {common.map((name) => <Chip key={name} variant="outline" disabled={command.locked} icon={icon(Plus)} onClick={() => add(name)}>{name}</Chip>)}
          </div>
        ) : null}
      </form>
      <CommandAlert command={command} />
    </div>
  );
}

export function WorksConsole({ initialQ, initialOpenId }: { initialQ?: string; initialOpenId?: string }) {
  const toast = useToast();
  const auth = useAuthStatus();
  const { refresh: refreshCounts } = useAdminCounts();
  const table = useAdminTable<Work>(ENDPOINT, 'works', {
    initialQ,
    mapFilters: (filters) => ({ status: filters.status ?? '', public: filters.public ?? '', tagId: filters.tag ?? '', tagState: filters.tag ? 'has' : '' }),
  });
  const command = useAdminCommand();
  const activeTags = useActiveTags();
  const suggestions = useMemo(() => activeTags.map((tag) => tag.name), [activeTags]);
  const [selected, setSelected] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  const [dialog, setDialog] = useState<{ action: Action | 'bulkTag'; works: Work[] } | null>(null);
  const [checked, setChecked] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const inspection = useAdminInspection<ManagedWorkInspection>(openId ? `${ENDPOINT}/${openId}` : null);
  const listed = table.items.find((item) => item.id === openId);
  const detail = inspection.data?.id === openId ? inspection.data : null;
  const selectedRows = table.items.filter((item) => selected.includes(item.id));

  const open = (action: Action | 'bulkTag', works: Work[]) => { command.resetNotice(); setChecked(false); setPicked([]); setDialog({ action, works }); };
  const afterWrite = async () => { setSelected([]); await table.reload(); if (openId) await inspection.reload(); refreshCounts(); };
  const bulkState: CommandState = { busy: bulkBusy, uncertain: false, error: null, locked: bulkBusy, retry: async () => {} };

  const act = async (reason: string) => {
    if (!dialog || dialog.action === 'bulkTag') return;
    const { action, works } = dialog;
    if (works.length === 1) {
      const work = works[0];
      const version = detail?.id === work.id ? detail.version : work.version;
      await command.run({ url: `${ENDPOINT}/${work.id}`, method: 'PATCH', body: { action: API_ACTION[action], expectedVersion: version, reason } }, async () => {
        setDialog(null);
        const title = titleOf(work);
        toast(action === 'takedown' ? t.takedown.done(title) : action === 'restore' ? t.restore.done(title) : action === 'feature' ? t.feature.done(title)
          : action === 'unfeature' ? t.feature.doneOff(title) : action === 'lock' ? t.lock.done : t.lock.doneOff,
        { icon: icon(action === 'lock' ? Lock : action === 'unlock' ? LockOpen : action.includes('feature') ? Star : Ban) });
        await afterWrite();
      });
      return;
    }
    setBulkBusy(true);
    try {
      const result = await bulkWrite(works, (work) => ({ url: `${ENDPOINT}/${work.id}`, method: 'PATCH', body: { action: API_ACTION[action], expectedVersion: work.version, reason } }));
      setDialog(null);
      toast(result.failed ? t.bulkPartial(result.done, result.failed) : action === 'takedown' ? t.takedown.doneMany(result.done) : t.feature.doneMany(result.done));
      await afterWrite();
    } finally { setBulkBusy(false); }
  };
  const bulkTag = async () => {
    if (!dialog || !picked.length) return;
    const works = dialog.works;
    await command.run({ url: `${ENDPOINT}/tags`, method: 'POST', body: { workIds: works.map((work) => work.id), tags: picked } }, async () => {
      setDialog(null);
      toast(t.bulkTag.done(works.length, picked.join('、')), { icon: icon(Tag) });
      await afterWrite();
    });
  };

  const columns: Column<Work>[] = [
    { key: 'work', label: t.columns.work, main: true, cell: (work) => <TitleCell lead={<Thumb revisionId={work.thumbnail?.revisionId} />} title={titleOf(work)} sub={<Mono>{work.id.slice(0, 8)}</Mono>} onOpen={() => setOpenId(work.id)}
      extra={<>{work.featured ? <FeaturedBadge /> : null}{work.commentsLocked ? <span title={t.locked} className="inline-grid text-ink-3 [&>svg]:size-4">{icon(Lock)}<span className="sr-only">{t.locked}</span></span> : null}</>} /> },
    { key: 'author', label: t.columns.author, cell: (work) => <Person {...work.author} /> },
    { key: 'status', label: t.columns.status, cell: (work) => <WorkStatus status={work.lifecycleStatus} /> },
    { key: 'public', label: t.columns.public, cell: (work) => <PublicCell work={work} /> },
    { key: 'tags', label: t.columns.tags, cell: (work) => <TagsCell tags={work.tags} /> },
    { key: 'likes', label: t.columns.likes, align: 'end', sort: (a, b) => a.likeCount - b.likeCount, cell: (work) => <span className="tabular-nums">{fmtNum(work.likeCount)}</span> },
    { key: 'updated', label: t.columns.updated, sort: (a, b) => a.updatedAt.localeCompare(b.updatedAt), cell: (work) => <span className="tabular-nums">{fmtDate(work.updatedAt)}</span> },
  ];
  const menu = (work: Work): RowMenuEntry[] => [
    { id: 'view', label: t.menu.view, icon: icon(Eye), onSelect: () => setOpenId(work.id) },
    ...(work.isPublic ? [{ id: 'open', label: t.menu.open, icon: icon(ExternalLink), onSelect: () => window.open(`/community/${work.id}`, '_blank', 'noopener') }] : []),
    ...(work.isPublic || work.featured ? [{ id: 'feature', label: work.featured ? t.menu.unfeature : t.menu.feature, icon: icon(Star), onSelect: () => open(work.featured ? 'unfeature' : 'feature', [work]) }] : []),
    { id: 'lock', label: work.commentsLocked ? t.menu.unlock : t.menu.lock, icon: icon(work.commentsLocked ? LockOpen : Lock), onSelect: () => open(work.commentsLocked ? 'unlock' : 'lock', [work]) },
    'separator',
    work.lifecycleStatus === 'active'
      ? { id: 'takedown', label: t.menu.takedown, icon: icon(Ban), danger: true, onSelect: () => open('takedown', [work]) }
      : { id: 'restore', label: t.menu.restore, icon: icon(RefreshCw), onSelect: () => open('restore', [work]) },
  ];

  const work = listed ?? (detail ? { id: detail.id, title: detail.material?.title ?? null } as Work : null);
  const pattern = detail?.material?.snapshot.pattern;
  const usage = useMemo(() => (pattern ? colorUsage(pattern) : []), [pattern]);
  const single = dialog && dialog.action !== 'bulkTag' && dialog.works.length === 1 ? dialog.works[0] : null;
  const needsCheck = Boolean(single) && (dialog?.action === 'takedown' || dialog?.action === 'restore');
  const d = t.drawer;
  const dialogCopy = dialog && dialog.action !== 'bulkTag' ? (() => {
    const title = single ? titleOf(single) : '';
    const count = dialog.works.length;
    switch (dialog.action) {
      case 'takedown': return { title: single ? t.takedown.title(title) : t.takedown.titleMany(count), subject: t.takedown.subject, label: t.takedown.label, hint: t.takedown.hint, quick: t.takedown.quick, confirm: single ? t.takedown.confirm : t.takedown.confirmMany(count), tone: 'danger' as const, check: t.takedown.check(title) };
      case 'restore': return { title: t.restore.title(title), subject: t.restore.subject, label: t.restore.label, quick: t.restore.quick, confirm: t.restore.confirm, tone: 'primary' as const, check: t.restore.check(title) };
      case 'feature': return { title: single ? t.feature.title(title) : t.feature.titleMany(count), subject: t.feature.subject, label: t.feature.label, quick: t.feature.quick, confirm: t.feature.confirm, tone: 'primary' as const };
      case 'unfeature': return { title: t.feature.titleOff(title), label: t.feature.label, quick: t.feature.quick, confirm: t.feature.confirmOff, tone: 'primary' as const };
      case 'lock': return { title: t.lock.title(title), subject: t.lock.subject, label: t.lock.label, quick: t.lock.quick, confirm: t.lock.confirm, tone: 'primary' as const };
      default: return { title: t.lock.titleOff(title), label: t.lock.label, quick: t.lock.quick, confirm: t.lock.confirmOff, tone: 'primary' as const };
    }
  })() : null;

  return (
    <>
      <DataTable<Work>
        label={t.label} rows={table.items} rowId={(item) => item.id} rowName={titleOf} columns={columns} minWidth={1000}
        card={(item) => ({
          lead: <Thumb revisionId={item.thumbnail?.revisionId} size="lg" />, title: titleOf(item),
          meta: <>{item.displayName} · <span className="tabular-nums">{fmtDate(item.updatedAt)}</span></>,
          tail: <><WorkStatus status={item.lifecycleStatus} />{item.isPublic ? <Badge>{icon(Eye)}{t.public}</Badge> : null}{item.featured ? <FeaturedBadge /> : null}
            <span className="inline-flex items-center gap-1 text-body-sm text-ink-3 [&>svg]:size-4">{icon(Heart)}<span className="tabular-nums">{fmtNum(item.likeCount)}</span></span></>,
        })}
        loading={table.loading} error={table.error} onRetry={() => void table.reload()}
        search={{ value: table.input, onChange: table.setInput, placeholder: t.search }}
        filters={[
          { key: 'status', label: t.filters.status, options: (['active', 'withdrawn', 'removed'] as const).map((value) => ({ value, label: t.status[value] })) },
          { key: 'public', label: t.filters.public, options: [{ value: 'public', label: t.public }, { value: 'hidden', label: t.hidden }] },
          ...(activeTags.length ? [{ key: 'tag', label: t.filters.tag, options: activeTags.map((tag) => ({ value: tag.id, label: tag.name })) }] : []),
        ]}
        filterValues={table.filters} onFilterChange={table.setFilter}
        onExport={() => exportCsv<Work>(ENDPOINT, table.query, [
          [x.id, (w) => w.id], [x.title, titleOf], [x.author, (w) => w.displayName], [x.status, (w) => t.status[w.lifecycleStatus]], [x.public, (w) => (w.isPublic ? csv.yes : csv.no)],
          [x.featured, (w) => (w.featured ? csv.yes : csv.no)], [x.tags, (w) => w.tags.join('、')], [x.likes, (w) => w.likeCount], [x.updated, (w) => fmtDate(w.updatedAt)],
        ], t.exportFile)}
        selectable selected={selected} onSelectedChange={setSelected}
        batchActions={<>
          <BatchButton icon={icon(Tag)} prefix={t.batch.tagPrefix} onClick={() => open('bulkTag', selectedRows)}>{t.batch.tag}</BatchButton>
          <BatchButton icon={icon(Star)} prefix={t.batch.featurePrefix} onClick={() => {
            const target = selectedRows.filter((item) => item.isPublic && !item.featured);
            if (!target.length) { toast(t.feature.none, { icon: icon(Info) }); return; }
            open('feature', target);
          }}>{t.batch.feature}</BatchButton>
          <BatchButton icon={icon(Ban)} danger onClick={() => { const target = selectedRows.filter((item) => item.lifecycleStatus === 'active'); if (target.length) open('takedown', target); }}>{t.batch.takedown}</BatchButton>
        </>}
        menu={menu} onOpen={(item) => setOpenId(item.id)} openId={openId}
        page={table.page} pageCount={table.totalPages} total={table.total} size={table.size} onPage={table.setPage} onSize={table.setSize}
        filtered={table.filtered} onReset={table.reset} emptyTitle={t.emptyTitle}
      />

      <AdminDrawer
        open={Boolean(openId)} onOpenChange={(next) => { if (!next) setOpenId(null); }}
        title={work ? titleOf(work) : t.noTitle}
        badges={detail ? <><WorkStatus status={detail.lifecycleStatus} />{detail.featured ? <FeaturedBadge /> : null}</> : null}
        footer={detail && work ? <>
          {detail.lifecycleStatus === 'active'
            ? <Button data-danger="" variant="danger-outline" onClick={() => open('takedown', [listed ?? work])}>{icon(Ban)}{t.menu.takedown.replace('…', '')}</Button>
            : detail.canRestore ? <Button variant="outline" onClick={() => open('restore', [listed ?? work])}>{icon(RefreshCw)}{t.menu.restore}</Button> : null}
          <Spacer />
          <Button onClick={() => open(detail.commentsLocked ? 'unlock' : 'lock', [listed ?? work])}>{icon(detail.commentsLocked ? LockOpen : Lock)}{detail.commentsLocked ? t.menu.unlock : t.menu.lock}</Button>
          {detail.isPublic || detail.featured
            ? <Button variant={detail.featured ? 'secondary' : 'primary'} onClick={() => open(detail.featured ? 'unfeature' : 'feature', [listed ?? work])}>{icon(Star)}{detail.featured ? t.menu.unfeature : t.menu.feature}</Button> : null}
        </> : undefined}
      >
        {!detail ? (inspection.error ? <CommandAlert command={{ busy: false, uncertain: false, error: inspection.error, locked: false, retry: async () => {} }} /> : <Skeleton className="h-60" />) : <>
          <div className="grid h-60 place-items-center rounded-lg bg-bg-subtle max-md:h-50">
            {pattern ? <BeadImage pattern={pattern} alt={d.stageAlt(titleOf(work ?? { title: null }))} lazy={false} className="size-52 rounded-md ring-1 ring-line max-md:size-42" /> : <p className="text-body-sm text-ink-3">{d.noMaterial}</p>}
          </div>
          {detail.lifecycleStatus === 'removed' ? <Note tone="danger" icon={icon(Ban)}>{d.removed(detail.removedReason ?? d.noReason)}</Note> : null}
          {detail.lifecycleStatus !== 'active' && !detail.canRestore ? <Note icon={icon(Info)}>{d.cannotRestore}</Note> : null}
          {detail.latestRevision && detail.latestRevision.id !== detail.material?.id
            ? <Note icon={icon(Info)}>{detail.latestRevision.status === 'pending_review' ? d.pending : d.newer(detail.latestRevision.revisionNumber, revisionStates[detail.latestRevision.status])}</Note> : null}
          <DrawerSection title={d.info} aside={detail.isPublic ? <Link href={`/community/${detail.id}`} target="_blank" rel="noopener noreferrer" className="text-body-sm font-medium text-accent hover:underline hover:underline-offset-3 focus-visible:focus-ring">{d.openPublic}</Link> : null}>
            <Dl items={[
              [d.author, listed ? <Person key="a" {...listed.author} /> : '—'],
              [d.id, <CopyId key="id" value={detail.id} label={d.id} />],
              [d.size, pattern ? <span className="tabular-nums">{pattern.width}×{pattern.height}</span> : '—'],
              [d.colors, <span key="c" className="tabular-nums">{d.colorsValue(usage.length, fmtNum(usage.reduce((sum, item) => sum + item.count, 0)))}</span>],
              [d.interactions, <span key="i" className="tabular-nums">{fmtNum(detail.counts.likes)} · {detail.counts.comments}</span>],
              [d.reuses, <span key="r" className="tabular-nums">{d.reusesValue(detail.counts.reuses)}</span>],
              detail.material ? [d.revision, d.revisionValue(detail.material.revisionNumber, revisionStates[detail.material.status])] : null,
              listed ? [d.updated, <span key="u" className="tabular-nums">{fmtDate(listed.updatedAt)}</span>] : null,
            ]} />
          </DrawerSection>
          <DrawerSection title={d.tags}>
            <TagEditor work={listed ?? (work as Work)} detail={detail} suggestions={suggestions} onSaved={(version, tags) => {
              inspection.applyLocal({ version, tags });
              table.patchItem(detail.id, { version, tags: tags.map((tag) => tag.name) });
            }} />
          </DrawerSection>
          {auth.kind === 'user' && auth.role === 'admin' ? <DrawerSection title={d.history}><History workId={detail.id} /></DrawerSection> : null}
        </>}
      </AdminDrawer>

      {dialogCopy && dialog ? (
        <ReasonDialog
          open onOpenChange={(next) => { if (!next) setDialog(null); }}
          title={dialogCopy.title} subject={dialogCopy.subject} label={dialogCopy.label} hint={'hint' in dialogCopy ? dialogCopy.hint : undefined}
          quick={[...dialogCopy.quick]} confirmLabel={dialogCopy.confirm} tone={dialogCopy.tone}
          extra={needsCheck && 'check' in dialogCopy ? <Checkbox checked={checked} onCheckedChange={(value) => setChecked(Boolean(value))}>{dialogCopy.check}</Checkbox> : undefined}
          extraValid={!needsCheck || checked}
          command={dialog.works.length > 1 ? bulkState : command} onConfirm={act}
        />
      ) : null}
      {dialog?.action === 'bulkTag' ? (
        <ConfirmDialog open onOpenChange={(next) => { if (!next) setDialog(null); }} title={t.bulkTag.title(dialog.works.length)} text={t.bulkTag.text}
          confirmLabel={picked.length ? t.bulkTag.applyN(picked.length) : t.bulkTag.apply} onConfirm={bulkTag} command={command}>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((name) => <Chip key={name} selected={picked.includes(name)} onClick={() => setPicked(picked.includes(name) ? picked.filter((item) => item !== name) : [...picked, name])}>{name}</Chip>)}
          </div>
        </ConfirmDialog>
      ) : null}
    </>
  );
}
