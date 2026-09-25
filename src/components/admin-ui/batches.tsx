'use client';

import { Info, Layers, Plus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { getBoardProfile } from '@/lib/boardProfiles';
import { officialBatchDefaultsSchema, splitOfficialBatchDefaults } from '@/lib/community/batchDefaults';
import { zhCN } from '@/messages/zh-CN';
import { isStoredBatch, type StoredBatch } from '@/components/admin/batchSession';
import { Badge } from '@/components/ui/badge';
import { BeadImage } from '@/components/ui/bead-image';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { BatchStudio, previewPattern } from './batch-studio';
import { DataTable, TitleCell, type Column } from './data-table';
import { fmtAgo, fmtDate } from './format';
import { AdminDrawer, Spacer } from './overlays';
import { AdminPageHead } from './page-head';
import { CopyId, Dl, DrawerSection, IconTile, Mono, Note, Person, Thumb } from './parts';
import { useAdminTable, useOpenRow } from './use-admin-table';

const t = zhCN.adminUi.batches;
const statusLabel = zhCN.communityAdmin.audit.batchStatuses;
const icon = (Icon: typeof Plus) => <Icon aria-hidden="true" strokeWidth={1.75} />;
const TONE = { running: 'info', paused: 'warning', completed: 'success', cancelled: 'neutral' } as const;
const StatusBadge = ({ batch }: { batch: StoredBatch }) => <Badge tone={batch.failureCount && batch.status === 'completed' ? 'danger' : TONE[batch.status]} dot>{statusLabel[batch.status]}</Badge>;
const nameOf = (batch: StoredBatch) => batch.name || t.name(fmtDate(batch.createdAt));
/** 制作规格（底板）：从批次默认参数里取，旧批次没有规格时按默认规格。 */
const specOf = (batch: StoredBatch) => {
  const parsed = officialBatchDefaultsSchema.safeParse(batch.defaultParams);
  return getBoardProfile(parsed.success ? splitOfficialBatchDefaults(parsed.data).spec.boardProfile : '5mm-29').displayName;
};
const BatchLead = ({ batch, size = 'md' }: { batch: StoredBatch; size?: 'md' | 'lg' }) => (batch.drafts[0]
  ? <Thumb revisionId={batch.drafts[0].id} size={size} />
  : <IconTile size={size}>{icon(Layers)}</IconTile>);

function DraftThumb({ draft }: { draft: StoredBatch['drafts'][number] }) {
  const pattern = useMemo(() => previewPattern(draft.preview), [draft.preview]);
  return (
    <li className="grid min-w-0 justify-items-start gap-1.5 text-caption text-ink-2">
      <span className="grid aspect-square w-full place-items-center rounded-md bg-bg-subtle inset-ring-1 inset-ring-line"><BeadImage pattern={pattern} alt={t.preview(draft.title)} className="size-thumb-fill" /></span>
      <span className="max-w-full truncate">{draft.title}</span>
      <Badge tone={draft.status === 'published' ? 'success' : 'neutral'}>{t.drawer.draftStatus[draft.status] ?? draft.status}</Badge>
    </li>
  );
}

function Progress({ batch }: { batch: StoredBatch }) {
  const percent = batch.itemCount ? Math.round((batch.successCount / batch.itemCount) * 100) : 0;
  return (
    <span className="inline-flex min-w-37.5 items-center gap-2.5 text-caption font-normal text-ink-3">
      <span className="h-1.5 min-w-20 flex-1 overflow-hidden rounded-full bg-bg-muted"><i className="block h-full rounded-full bg-ink" style={{ width: `${percent}%` }} /></span>
      <span className="tabular-nums">{t.progress(batch.successCount, batch.itemCount)}</span>
    </span>
  );
}

/** 新建批次：先起名，再进工作室选图；色板与制作规格在工作室第一步设置。 */
function NewBatchDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => void }) {
  const d = t.newDialog;
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) { setError(d.nameRequired); return; }
    onCreate(trimmed);
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>{d.title}</DialogTitle></DialogHeader>
        <DialogBody className="grid gap-4">
          <form noValidate onSubmit={(event) => { event.preventDefault(); submit(); }}>
            <Field label={d.name} hint={error ? undefined : d.nameHint} error={error}>
              <Input autoFocus value={name} maxLength={20} autoComplete="off" onChange={(event) => { setName(event.target.value); if (error) setError(null); }} />
            </Field>
          </form>
          <p className="text-body-sm text-ink-3">{d.help}</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{zhCN.adminUi.dialog.cancel}</Button>
          <Button variant="primary" onClick={submit}>{d.submit}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 官方批次：批次历史表格 + 详情抽屉；「新建批次 / 继续处理」进入四步工作室。 */
export function BatchesConsole() {
  const table = useAdminTable<StoredBatch>('/api/admin/batches', 'batches', { isItem: isStoredBatch });
  const [studio, setStudio] = useState<{ key: number; restore: StoredBatch | null; name?: string } | null>(null);
  const [naming, setNaming] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = useOpenRow(table.items, openId, (batch) => batch.id, table.loading);
  const { reload } = table;
  const changed = useCallback(() => { void reload(); }, [reload]);
  const columns: Column<StoredBatch>[] = [
    { key: 'batch', label: t.columns.batch, main: true, cell: (batch) => <TitleCell lead={<BatchLead batch={batch} />} title={nameOf(batch)} sub={<Mono>{batch.id.slice(0, 8)}</Mono>} onOpen={() => setOpenId(batch.id)} /> },
    { key: 'count', label: t.columns.count, align: 'end', cell: (batch) => <span className="tabular-nums">{t.countValue(batch.itemCount)}</span> },
    { key: 'progress', label: t.columns.progress, cell: (batch) => <Progress batch={batch} /> },
    { key: 'status', label: t.columns.status, cell: (batch) => <StatusBadge batch={batch} /> },
    { key: 'spec', label: t.columns.spec, cell: (batch) => <span className="whitespace-nowrap">{specOf(batch)}</span> },
    { key: 'creator', label: t.columns.creator, cell: (batch) => (batch.creator ? <Person {...batch.creator} /> : <span className="text-ink-3">—</span>) },
    { key: 'created', label: t.columns.created, sort: (x, y) => x.createdAt.localeCompare(y.createdAt), cell: (batch) => <span className="tabular-nums">{fmtDate(batch.createdAt)}</span> },
  ];
  if (studio) {
    return (
      <>
        <AdminPageHead section="batches" />
        <BatchStudio key={studio.key} restore={studio.restore} name={studio.name} onChanged={changed} onBack={() => { setStudio(null); void reload(); }} />
      </>
    );
  }
  return (
    <>
      <AdminPageHead section="batches" actions={<Button variant="primary" onClick={() => setNaming(true)}>{icon(Plus)}{t.create}</Button>} />
      <DataTable<StoredBatch>
        label={t.label} rows={table.items} rowId={(batch) => batch.id} rowName={nameOf} columns={columns} minWidth={1000}
        card={(batch) => ({ lead: <BatchLead batch={batch} size="lg" />, title: nameOf(batch), meta: `${batch.creator?.name ?? '—'} · ${fmtAgo(batch.createdAt)}`, tail: <><StatusBadge batch={batch} /><Progress batch={batch} /></> })}
        loading={table.loading} error={table.error} onRetry={() => void table.reload()}
        search={{ value: table.input, onChange: table.setInput, placeholder: t.search }}
        filters={[{ key: 'status', label: t.filters.status, options: (['running', 'paused', 'completed', 'cancelled'] as const).map((value) => ({ value, label: statusLabel[value] })) }]}
        filterValues={table.filters} onFilterChange={table.setFilter}
        onOpen={(batch) => setOpenId(batch.id)} openId={openId}
        page={table.page} pageCount={table.totalPages} total={table.total} size={table.size} onPage={table.setPage} onSize={table.setSize}
        filtered={table.filtered} onReset={table.reset} sort={table.sort} onSortChange={table.setSort} emptyTitle={t.emptyTitle} emptyText={t.emptyText}
      />
      <AdminDrawer open={Boolean(open)} onOpenChange={(next) => { if (!next) setOpenId(null); }} title={open ? nameOf(open) : ''} badges={open ? <StatusBadge batch={open} /> : null}
        footer={open ? <><Spacer /><Button onClick={() => setOpenId(null)}>{zhCN.adminUi.common.close}</Button>{open.mine !== false ? <Button variant="primary" onClick={() => { setOpenId(null); setStudio({ key: Date.now(), restore: open }); }}>{t.continue}</Button> : null}</> : undefined}>
        {open ? <>
          <Dl items={[
            [t.drawer.status, <StatusBadge key="s" batch={open} />],
            [t.drawer.id, <CopyId key="id" value={open.id} label={t.drawer.id} />],
            [t.drawer.spec, specOf(open)],
            [t.drawer.creator, open.creator ? <Person key="c" {...open.creator} /> : '—'],
            [t.drawer.created, <span key="c" className="tabular-nums">{fmtDate(open.createdAt)}</span>],
            [t.drawer.saved, <span key="v" className="tabular-nums">{t.progress(open.successCount, open.itemCount)}</span>],
            [t.drawer.failed, <span key="f" className={open.failureCount ? 'text-danger tabular-nums' : 'tabular-nums'}>{open.failureCount}</span>],
          ]} />
          <Progress batch={open} />
          {open.mine === false ? <Note icon={icon(Info)}>{t.drawer.othersBatch}</Note> : null}
          <DrawerSection title={t.drawer.drafts}>
            {open.drafts.length ? <ul role="list" className="grid grid-cols-3 gap-3 max-md:grid-cols-2">{open.drafts.map((draft) => <DraftThumb key={draft.id} draft={draft} />)}</ul>
              : <p className="text-body-sm text-ink-3">{t.drawer.noDrafts}</p>}
          </DrawerSection>
        </> : null}
      </AdminDrawer>
      {naming ? <NewBatchDialog onClose={() => setNaming(false)} onCreate={(name) => { setNaming(false); setStudio({ key: Date.now(), restore: null, name }); }} /> : null}
    </>
  );
}
