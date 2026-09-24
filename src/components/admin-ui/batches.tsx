'use client';

import { Layers, Plus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { zhCN } from '@/messages/zh-CN';
import { isStoredBatch, type StoredBatch } from '@/components/admin/batchSession';
import { Badge } from '@/components/ui/badge';
import { BeadImage } from '@/components/ui/bead-image';
import { Button } from '@/components/ui/button';
import { BatchStudio, previewPattern } from './batch-studio';
import { DataTable, TitleCell, type Column } from './data-table';
import { fmtDate } from './format';
import { AdminDrawer, Spacer } from './overlays';
import { AdminPageHead } from './page-head';
import { Dl, DrawerSection, IconTile, Mono } from './parts';
import { useAdminTable } from './use-admin-table';

const t = zhCN.adminUi.batches;
const b = zhCN.communityAdmin.batch;
const icon = (Icon: typeof Plus) => <Icon aria-hidden="true" strokeWidth={1.75} />;
const TONE = { running: 'info', paused: 'warning', completed: 'success', cancelled: 'neutral' } as const;
const StatusBadge = ({ batch }: { batch: StoredBatch }) => <Badge tone={batch.failureCount && batch.status === 'completed' ? 'danger' : TONE[batch.status]} dot>{b.batchStatus[batch.status]}</Badge>;
const nameOf = (batch: StoredBatch) => t.name(fmtDate(batch.createdAt));

function DraftThumb({ draft }: { draft: StoredBatch['drafts'][number] }) {
  const pattern = useMemo(() => previewPattern(draft.preview), [draft.preview]);
  return (
    <li className="grid min-w-0 justify-items-start gap-1.5 text-caption text-ink-2">
      <span className="grid aspect-square w-full place-items-center rounded-md bg-bg-subtle inset-ring-1 inset-ring-line"><BeadImage pattern={pattern} alt={t.preview(draft.title)} className="size-[86%]" /></span>
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

/** 官方批次（原型 content.js batchesSection）：批次历史表格 + 详情抽屉；「新建批次 / 继续处理」进入四步工作室。 */
export function BatchesConsole() {
  const table = useAdminTable<StoredBatch>('/api/admin/batches', 'batches', { isItem: isStoredBatch });
  const [studio, setStudio] = useState<{ key: number; restore: StoredBatch | null } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = table.items.find((batch) => batch.id === openId) ?? null;
  const { reload } = table;
  const changed = useCallback(() => { void reload(); }, [reload]);
  const columns: Column<StoredBatch>[] = [
    { key: 'batch', label: t.columns.batch, main: true, cell: (batch) => <TitleCell lead={<IconTile>{icon(Layers)}</IconTile>} title={nameOf(batch)} sub={<Mono>{batch.id.slice(0, 8)}</Mono>} onOpen={() => setOpenId(batch.id)} /> },
    { key: 'count', label: t.columns.count, align: 'end', cell: (batch) => <span className="tabular-nums">{t.countValue(batch.itemCount)}</span> },
    { key: 'progress', label: t.columns.progress, cell: (batch) => <Progress batch={batch} /> },
    { key: 'status', label: t.columns.status, cell: (batch) => <StatusBadge batch={batch} /> },
    { key: 'created', label: t.columns.created, sort: (x, y) => x.createdAt.localeCompare(y.createdAt), cell: (batch) => <span className="tabular-nums">{fmtDate(batch.createdAt)}</span> },
  ];
  if (studio) {
    return (
      <>
        <AdminPageHead section="batches" />
        <BatchStudio key={studio.key} restore={studio.restore} onChanged={changed} onBack={() => { setStudio(null); void reload(); }} />
      </>
    );
  }
  return (
    <>
      <AdminPageHead section="batches" actions={<Button variant="primary" onClick={() => setStudio({ key: Date.now(), restore: null })}>{icon(Plus)}{t.create}</Button>} />
      <DataTable<StoredBatch>
        label={t.label} rows={table.items} rowId={(batch) => batch.id} rowName={nameOf} columns={columns} minWidth={900}
        card={(batch) => ({ lead: <IconTile size="lg">{icon(Layers)}</IconTile>, title: nameOf(batch), meta: <Mono>{batch.id.slice(0, 8)}</Mono>, tail: <><StatusBadge batch={batch} /><Progress batch={batch} /></> })}
        loading={table.loading} error={table.error} onRetry={() => void table.reload()}
        onOpen={(batch) => setOpenId(batch.id)} openId={openId}
        page={table.page} pageCount={table.totalPages} total={table.total} size={table.size} onPage={table.setPage} onSize={table.setSize}
        filtered={false} onReset={table.reset} emptyTitle={t.emptyTitle} emptyText={t.emptyText}
      />
      <AdminDrawer open={Boolean(open)} onOpenChange={(next) => { if (!next) setOpenId(null); }} title={open ? nameOf(open) : ''} badges={open ? <StatusBadge batch={open} /> : null}
        footer={open ? <><Spacer /><Button onClick={() => setOpenId(null)}>{zhCN.adminUi.common.close}</Button><Button variant="primary" onClick={() => { setOpenId(null); setStudio({ key: Date.now(), restore: open }); }}>{t.continue}</Button></> : undefined}>
        {open ? <>
          <Dl items={[
            [t.drawer.status, <StatusBadge key="s" batch={open} />],
            [t.drawer.id, <Mono key="id">{open.id}</Mono>, true],
            [t.drawer.created, <span key="c" className="tabular-nums">{fmtDate(open.createdAt)}</span>],
            [t.drawer.saved, <span key="v" className="tabular-nums">{t.progress(open.successCount, open.itemCount)}</span>],
            [t.drawer.failed, <span key="f" className={open.failureCount ? 'text-danger tabular-nums' : 'tabular-nums'}>{open.failureCount}</span>],
          ]} />
          <Progress batch={open} />
          <DrawerSection title={t.drawer.drafts}>
            {open.drafts.length ? <ul role="list" className="grid grid-cols-3 gap-3 max-md:grid-cols-2">{open.drafts.map((draft) => <DraftThumb key={draft.id} draft={draft} />)}</ul>
              : <p className="text-body-sm text-ink-3">{t.drawer.noDrafts}</p>}
          </DrawerSection>
        </> : null}
      </AdminDrawer>
    </>
  );
}
