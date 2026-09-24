'use client';

import { Check, ExternalLink, Eye, EyeOff, Flag, Grid3x3, Info, MessageCircle, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { ReportTargetInspection } from '@/lib/community/reportInspection';
import { zhCN } from '@/messages/zh-CN';
import { useAdminCommand } from '@/components/admin/useAdminCommand';
import { useAdminInspection } from '@/components/admin/useAdminInspection';
import { Badge } from '@/components/ui/badge';
import { BeadImage } from '@/components/ui/bead-image';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useAdminCounts } from './admin-shell';
import { bulkWrite } from './bulk';
import { BatchButton, DataTable, TitleCell, type Column, type RowMenuEntry } from './data-table';
import { fmtAgo, fmtDate } from './format';
import { AdminDrawer, CommandAlert, ReasonDialog, Spacer, type CommandState } from './overlays';
import { Dl, DrawerSection, IconTile, Mono, Note } from './parts';
import { exportCsv, useAdminTable } from './use-admin-table';

const icon = (Icon: typeof Check) => <Icon aria-hidden="true" strokeWidth={1.75} />;
const states = zhCN.communityAdmin.states;
const m = zhCN.communityAdmin.moderationCheck;
const g = zhCN.communityAdmin.governance;
const riskLabel = (value: string | null | undefined) => (value ? states.risk[value as keyof typeof states.risk] ?? value : zhCN.communityAdmin.unmarked);
const idleCommand: CommandState = { busy: false, uncertain: false, error: null, locked: false, retry: async () => {} };

// ================= 评论治理 =================
const c = zhCN.adminUi.comments;
interface ModerationCheck { provider: string; suggestion: string | null; label: string | null; subLabel: string | null; score: number | null; keywords: string[]; reason: string; checkedAt: string }
interface CommentRow { id: string; workId: string; status: string; version: number; body: string; riskCategories: string[]; createdAt: string; authorName: string; workTitle: string | null; moderation: ModerationCheck | null }

const verdict = (row: CommentRow) => row.status === 'rejected' ? <Badge tone="danger" dot>{c.verdicts.rejected}</Badge>
  : row.status === 'pending_review' ? <Badge tone="warning" dot>{c.verdicts.review}</Badge>
    : row.status === 'hidden' ? <Badge dot>{c.verdicts.hidden}</Badge> : <Badge tone="success" dot>{c.verdicts.published}</Badge>;
const checkLabel = (check: ModerationCheck | null) => (check?.label && check.label !== 'Normal' ? m.labels[check.label as keyof typeof m.labels] ?? check.label : null);

function ModerationFacts({ check }: { check: ModerationCheck }) {
  const label = (value: string | null) => (value ? m.labels[value as keyof typeof m.labels] ?? value : m.none);
  return (
    <Dl items={[
      [m.provider, m.providers[check.provider as keyof typeof m.providers] ?? check.provider, true],
      [m.suggestion, check.suggestion ? m.suggestions[check.suggestion as keyof typeof m.suggestions] ?? check.suggestion : m.none],
      [m.label, `${label(check.label)}${check.subLabel ? ` · ${check.subLabel}` : ''}`],
      check.score !== null ? [m.score, <span key="s" className="tabular-nums">{check.score}</span>] : null,
      check.keywords.length ? [m.keywords, check.keywords.join('、')] : null,
      [m.reason, m.reasons[check.reason as keyof typeof m.reasons] ?? check.reason, true],
      [m.checkedAt, <span key="t" className="tabular-nums">{fmtDate(check.checkedAt)}</span>],
    ]} />
  );
}

export function CommentsConsole({ initialOpenId }: { initialOpenId?: string }) {
  const toast = useToast();
  const { refresh: refreshCounts } = useAdminCounts();
  const table = useAdminTable<CommentRow>('/api/admin/community/comments', 'comments');
  const command = useAdminCommand();
  const [selected, setSelected] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  const [dialog, setDialog] = useState<{ decision: 'published' | 'hidden'; rows: CommentRow[] } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const open = table.items.find((row) => row.id === openId) ?? null;
  const rows = table.items.filter((row) => selected.includes(row.id));
  const ask = (decision: 'published' | 'hidden', list: CommentRow[]) => { if (!list.length) return; command.resetNotice(); setDialog({ decision, rows: list }); };
  const decide = async (reason: string) => {
    if (!dialog) return;
    const { decision, rows: list } = dialog;
    const finish = async (count: number) => {
      setDialog(null); setSelected([]);
      toast(decision === 'published' ? (count === 1 ? c.kept : c.keptMany(count)) : (count === 1 ? c.hidden : c.hiddenMany(count)), { icon: icon(decision === 'published' ? Check : EyeOff) });
      if (openId && list.some((row) => row.id === openId)) setOpenId(null);
      await table.reload(); refreshCounts();
    };
    if (list.length === 1) {
      await command.run({ url: `/api/admin/community/comments/${list[0].id}`, method: 'PATCH', body: { decision, expectedVersion: list[0].version, reason } }, () => finish(1));
      return;
    }
    setBulkBusy(true);
    try {
      const result = await bulkWrite(list, (row) => ({ url: `/api/admin/community/comments/${row.id}`, method: 'PATCH', body: { decision, expectedVersion: row.version, reason } }));
      if (result.failed) toast(zhCN.adminUi.works.bulkPartial(result.done, result.failed));
      await finish(result.done);
    } finally { setBulkBusy(false); }
  };
  const keepLabel = (row: CommentRow) => (row.status === 'rejected' ? c.publishRejected : c.keep);
  const columns: Column<CommentRow>[] = [
    { key: 'text', label: c.columns.text, main: true, cell: (row) => <TitleCell quote title={`“${row.body}”`} onOpen={() => setOpenId(row.id)} /> },
    { key: 'author', label: c.columns.author, cell: (row) => <span className="block max-w-45 truncate">{row.authorName}</span> },
    { key: 'work', label: c.columns.work, cell: (row) => <span className="block max-w-45 truncate">{row.workTitle ?? zhCN.adminUi.works.noTitle}</span> },
    { key: 'verdict', label: c.columns.verdict, cell: (row) => <span className="inline-flex flex-col items-start gap-0.5">{verdict(row)}{checkLabel(row.moderation) ? <span className="text-caption font-normal text-ink-3">{checkLabel(row.moderation)}</span> : null}</span> },
    { key: 'time', label: c.columns.time, sort: (a, b) => a.createdAt.localeCompare(b.createdAt), cell: (row) => <span className="tabular-nums">{fmtAgo(row.createdAt)}</span> },
  ];
  const menu = (row: CommentRow): RowMenuEntry[] => [
    { id: 'view', label: zhCN.adminUi.common.view, icon: icon(Eye), onSelect: () => setOpenId(row.id) },
    { id: 'keep', label: keepLabel(row), icon: icon(Check), onSelect: () => ask('published', [row]) },
    'separator',
    { id: 'hide', label: `${c.hide}…`, icon: icon(EyeOff), danger: true, disabled: row.status === 'rejected', onSelect: () => ask('hidden', [row]) },
  ];
  const copy = dialog?.decision === 'published' ? c.keepDialog : c.hideDialog;
  const many = (dialog?.rows.length ?? 0) > 1;
  return (
    <>
      <DataTable<CommentRow>
        label={c.label} rows={table.items} rowId={(row) => row.id} rowName={(row) => `${row.authorName}的评论`} columns={columns} minWidth={960}
        card={(row) => ({ lead: <IconTile>{icon(MessageCircle)}</IconTile>, title: `“${row.body}”`, meta: `${row.authorName} · ${row.workTitle ?? zhCN.adminUi.works.noTitle} · ${fmtAgo(row.createdAt)}`,
          tail: <>{verdict(row)}{checkLabel(row.moderation) ? <span className="text-body-sm text-ink-3">{checkLabel(row.moderation)}</span> : null}</> })}
        loading={table.loading} error={table.error} onRetry={() => void table.reload()}
        filters={[{ key: 'status', label: c.filters.verdict, options: [{ value: 'pending_review', label: c.verdicts.review }, { value: 'rejected', label: c.verdicts.rejected }] }]}
        filterValues={table.filters} onFilterChange={table.setFilter}
        selectable selected={selected} onSelectedChange={setSelected}
        batchActions={<>
          <BatchButton icon={icon(Check)} onClick={() => ask('published', rows)}>{c.batch.keep}</BatchButton>
          <BatchButton icon={icon(EyeOff)} danger onClick={() => ask('hidden', rows.filter((row) => row.status !== 'rejected'))}>{c.batch.hide}</BatchButton>
        </>}
        menu={menu} onOpen={(row) => setOpenId(row.id)} openId={openId}
        page={table.page} pageCount={table.totalPages} total={table.total} size={table.size} onPage={table.setPage} onSize={table.setSize}
        filtered={table.filtered} onReset={table.reset} emptyTitle={c.emptyTitle} emptyText={c.emptyText}
      />
      <AdminDrawer open={Boolean(open)} onOpenChange={(next) => { if (!next) setOpenId(null); }} title={c.drawerTitle} badges={open ? verdict(open) : null}
        footer={open ? <>
          {open.status !== 'rejected' ? <Button data-danger="" variant="danger-outline" onClick={() => ask('hidden', [open])}>{icon(EyeOff)}{c.hide}</Button> : null}
          <Spacer />
          <Button variant="primary" onClick={() => ask('published', [open])}>{icon(Check)}{keepLabel(open)}</Button>
        </> : undefined}>
        {open ? <>
          <blockquote className="m-0 rounded-md bg-bg-subtle p-4 text-body text-ink">{open.body}</blockquote>
          {open.status === 'rejected' ? <Note tone="warning" icon={icon(Info)}>{m.rejectedHelp}</Note> : null}
          <DrawerSection title={c.verdict}>
            <Dl items={[
              [c.status, verdict(open)],
              [g.risk, open.riskCategories?.length ? open.riskCategories.map(riskLabel).join('、') : zhCN.communityAdmin.unmarked],
              [c.author, open.authorName],
              [c.time, <span key="t" className="tabular-nums">{fmtDate(open.createdAt)}</span>],
              [c.work, <Link key="w" href={`/community/${open.workId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline hover:underline-offset-3 focus-visible:focus-ring [&>svg]:size-4">{open.workTitle ?? zhCN.adminUi.works.noTitle}{icon(ExternalLink)}</Link>, true],
            ]} />
          </DrawerSection>
          <DrawerSection title={c.check}>{open.moderation ? <ModerationFacts check={open.moderation} /> : <p className="text-body-sm text-ink-3">{m.missing}</p>}</DrawerSection>
          <Note icon={icon(Info)}>{c.note}</Note>
        </> : null}
      </AdminDrawer>
      {dialog ? (
        <ReasonDialog open onOpenChange={(next) => { if (!next) setDialog(null); }}
          title={many ? copy.titleMany(dialog.rows.length) : copy.title} subject={copy.subject} label={copy.label} quick={[...copy.quick]}
          confirmLabel={many ? copy.confirmMany(dialog.rows.length) : dialog.decision === 'published' && dialog.rows[0].status === 'rejected' ? c.publishRejected : copy.confirm}
          tone={dialog.decision === 'hidden' ? 'danger' : 'primary'}
          command={many ? { ...idleCommand, busy: bulkBusy, locked: bulkBusy } : command} onConfirm={decide} />
      ) : null}
    </>
  );
}

// ================= 举报案件 =================
const r = zhCN.adminUi.reports;
const x = zhCN.adminUi.csv.reports;
interface ReportRow { id: string; targetType: 'work' | 'comment'; targetId: string; targetVersion: number; status: 'open' | 'accepted'; version: number; category: string; details: string | null; createdAt: string }
type Decision = 'accepted' | 'resolved' | 'dismissed' | 'hide';

const reportStatus = (row: ReportRow) => <Badge tone={row.status === 'open' ? 'warning' : 'info'} dot>{states.report[row.status]}</Badge>;
const reportTitle = (row: ReportRow) => r.targetTitle(r.kinds[row.targetType], riskLabel(row.category));

function ReportTarget({ target }: { target: ReportTargetInspection }) {
  const status = target.targetType === 'work' ? states.revision[target.contentStatus as keyof typeof states.revision] : states.comment[target.contentStatus as keyof typeof states.comment];
  return (
    <div className="grid gap-3">
      {target.targetType === 'work' ? (
        <div className="flex items-center gap-3 rounded-md border border-line p-3">
          {target.snapshot ? <BeadImage pattern={target.snapshot.pattern} lazy={false} className="size-20 shrink-0 rounded-md bg-bg-subtle" /> : <IconTile size="lg">{icon(Grid3x3)}</IconTile>}
          <span className="grid min-w-0 gap-0.5">
            <b className="truncate text-title-3 text-ink">{target.title ?? g.targetUnavailable}</b>
            <span className="text-body-sm text-ink-3">{status ?? g.targetUnavailable}{target.workStatus ? ` · ${states.work[target.workStatus]}` : ''}</span>
          </span>
        </div>
      ) : target.body !== null ? (
        <blockquote className="m-0 rounded-md bg-bg-subtle p-4 text-body text-ink">{target.body}<footer className="mt-2 text-caption font-normal text-ink-3">{status ?? g.targetUnavailable}</footer></blockquote>
      ) : <p className="text-body-sm text-ink-3">{g.contentUnavailable}</p>}
      {target.changed ? <Note tone="warning" icon={icon(Info)}>{target.targetType === 'work' ? g.workChanged : g.commentChanged}</Note> : null}
      <Dl items={[
        [g.targetId, <Mono key="id">{target.targetId}</Mono>, true],
        [g.reportedVersion, <span key="rv" className="tabular-nums">{target.reportedVersion}</span>],
        [g.currentVersion, <span key="cv" className="tabular-nums">{target.currentVersion ?? g.unavailable}</span>],
      ]} />
      {target.publicUrl
        ? <Link href={target.publicUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 justify-self-start text-body-sm font-medium text-accent hover:underline hover:underline-offset-3 focus-visible:focus-ring [&>svg]:size-4">{g.openCurrentTarget}{icon(ExternalLink)}</Link>
        : <p className="text-body-sm text-ink-3">{g.notPublic}</p>}
    </div>
  );
}

export function ReportsConsole({ initialOpenId }: { initialOpenId?: string }) {
  const toast = useToast();
  const { refresh: refreshCounts } = useAdminCounts();
  const table = useAdminTable<ReportRow>('/api/admin/community/reports', 'reports');
  const command = useAdminCommand();
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  const [dialog, setDialog] = useState<{ decision: Decision; row: ReportRow } | null>(null);
  const open = table.items.find((row) => row.id === openId) ?? null;
  const inspection = useAdminInspection<ReportTargetInspection>(openId ? `/api/admin/community/reports/${openId}` : null);
  const target = inspection.data?.reportId === openId ? inspection.data : null;
  const canHide = target?.targetType === 'comment' && target.currentVersion !== null && ['pending_review', 'published'].includes(target.contentStatus ?? '');
  const ask = (decision: Decision, row: ReportRow) => { command.resetNotice(); setDialog({ decision, row }); };
  const decide = async (reason: string) => {
    if (!dialog) return;
    const { decision, row } = dialog;
    const request = decision === 'hide'
      ? { url: `/api/admin/community/comments/${target!.targetId}`, method: 'PATCH' as const, body: { decision: 'hidden', expectedVersion: target!.currentVersion, reason } }
      : { url: `/api/admin/community/reports/${row.id}`, method: 'PATCH' as const, body: { decision, expectedVersion: row.version, reason } };
    await command.run(request, async () => {
      setDialog(null);
      toast(r.done[decision === 'hide' ? 'hidden' : decision]);
      if (decision === 'hide') await inspection.reload();
      else { if (decision !== 'accepted') setOpenId(null); await table.reload(); refreshCounts(); }
    });
  };
  const columns: Column<ReportRow>[] = [
    { key: 'target', label: r.columns.target, main: true, cell: (row) => <TitleCell lead={<IconTile>{icon(row.targetType === 'work' ? Grid3x3 : MessageCircle)}</IconTile>} title={reportTitle(row)} sub={<Mono>{row.targetId.slice(0, 8)}</Mono>} onOpen={() => setOpenId(row.id)} /> },
    { key: 'reason', label: r.columns.reason, cell: (row) => riskLabel(row.category) },
    { key: 'details', label: r.columns.details, cell: (row) => <span className="block max-w-75 truncate text-ink-3">{row.details || r.noDetails}</span> },
    { key: 'status', label: r.columns.status, cell: reportStatus },
    { key: 'time', label: r.columns.time, sort: (a, b) => a.createdAt.localeCompare(b.createdAt), cell: (row) => <span className="tabular-nums">{fmtAgo(row.createdAt)}</span> },
  ];
  const menu = (row: ReportRow): RowMenuEntry[] => [
    { id: 'view', label: zhCN.adminUi.common.view, icon: icon(Eye), onSelect: () => setOpenId(row.id) },
    row.status === 'open'
      ? { id: 'accept', label: `${r.accept}…`, icon: icon(Flag), onSelect: () => ask('accepted', row) }
      : { id: 'resolve', label: `${r.resolve}…`, icon: icon(Check), onSelect: () => ask('resolved', row) },
    { id: 'dismiss', label: `${r.dismiss}…`, icon: icon(X), onSelect: () => ask('dismissed', row) },
  ];
  const copy = dialog ? { accepted: r.acceptDialog, resolved: r.resolveDialog, dismissed: r.dismissDialog, hide: r.hideDialog }[dialog.decision] : null;
  return (
    <>
      <DataTable<ReportRow>
        label={r.label} rows={table.items} rowId={(row) => row.id} rowName={reportTitle} columns={columns} minWidth={900}
        card={(row) => ({ lead: <IconTile size="lg">{icon(row.targetType === 'work' ? Grid3x3 : MessageCircle)}</IconTile>, title: reportTitle(row), meta: `${row.details || r.noDetails} · ${fmtAgo(row.createdAt)}`, tail: reportStatus(row) })}
        loading={table.loading} error={table.error} onRetry={() => void table.reload()}
        filters={[
          { key: 'status', label: r.filters.status, options: [{ value: 'open', label: states.report.open }, { value: 'accepted', label: states.report.accepted }] },
          { key: 'targetType', label: r.filters.kind, options: [{ value: 'work', label: r.kinds.work }, { value: 'comment', label: r.kinds.comment }] },
        ]}
        filterValues={table.filters} onFilterChange={table.setFilter}
        onExport={() => exportCsv<ReportRow>('/api/admin/community/reports', table.query, [
          [x.id, (row) => row.id], [x.target, reportTitle], [x.targetId, (row) => row.targetId], [x.reason, (row) => riskLabel(row.category)], [x.details, (row) => row.details ?? ''], [x.status, (row) => states.report[row.status]], [x.time, (row) => fmtDate(row.createdAt)],
        ], zhCN.adminUi.csv.reportsFile)}
        menu={menu} onOpen={(row) => setOpenId(row.id)} openId={openId}
        page={table.page} pageCount={table.totalPages} total={table.total} size={table.size} onPage={table.setPage} onSize={table.setSize}
        filtered={table.filtered} onReset={table.reset} emptyTitle={r.emptyTitle} emptyText={r.emptyText}
      />
      <AdminDrawer open={Boolean(open)} onOpenChange={(next) => { if (!next) setOpenId(null); }} title={open ? r.drawerTitle(riskLabel(open.category)) : ''} badges={open ? reportStatus(open) : null}
        footer={open ? <>
          <Button variant="outline" onClick={() => ask('dismissed', open)}>{r.dismiss}</Button>
          <Spacer />
          {canHide ? <Button data-danger="" variant="danger-outline" onClick={() => ask('hide', open)}>{icon(EyeOff)}{r.hideComment}</Button> : null}
          {target?.targetType === 'work' ? <Button nativeButton={false} render={<Link href={`/admin/works?id=${target.targetId}`} />}>{icon(Grid3x3)}{r.manageWork}</Button> : null}
          {open.status === 'open'
            ? <Button variant="primary" disabled={!target} onClick={() => ask('accepted', open)}>{r.accept}</Button>
            : <Button variant="primary" disabled={!target} onClick={() => ask('resolved', open)}>{r.resolve}</Button>}
        </> : undefined}>
        {open ? <>
          <DrawerSection title={r.target(r.kinds[open.targetType])}>
            {target ? <ReportTarget target={target} /> : inspection.error ? <CommandAlert command={{ ...idleCommand, error: inspection.error }} /> : <Skeleton className="h-24" role="status" aria-label={r.loadingTarget} />}
          </DrawerSection>
          <DrawerSection title={r.info}>
            <Dl items={[
              [r.reason, <b key="r" className="font-semibold text-ink">{riskLabel(open.category)}</b>],
              [r.status, reportStatus(open)],
              [r.time, <span key="t" className="tabular-nums">{fmtDate(open.createdAt)}</span>],
              [r.id, <Mono key="id">{open.id}</Mono>],
              [r.details, <span key="d" className="whitespace-normal text-ink-2">{open.details || r.noDetails}</span>, true],
            ]} />
          </DrawerSection>
          <Note icon={icon(Info)}>{g.caseDoesNotModerate}</Note>
        </> : null}
      </AdminDrawer>
      {dialog && copy ? (
        <ReasonDialog open onOpenChange={(next) => { if (!next) setDialog(null); }} title={copy.title} subject={copy.subject} label={copy.label} quick={[...copy.quick]}
          confirmLabel={copy.confirm} tone={dialog.decision === 'hide' || dialog.decision === 'dismissed' ? 'danger' : 'primary'} command={command} onConfirm={decide} />
      ) : null}
    </>
  );
}
