'use client';

import { Copy, Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AdminAuditEntry, AdminSlowQueryEntry, AdminSystemLogDetail, AdminSystemLogEntry } from '@/lib/admin/queries';
import type { DatabaseHealth } from '@/lib/admin/dbHealth';
import { zhCN } from '@/messages/zh-CN';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { SegmentedControl } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { DataTable, TitleCell, type Column } from './data-table';
import { fmtDate } from './format';
import { AdminDrawer, Spacer } from './overlays';
import { AdminCard, CardHead, CodeBlock, Collapsible, CopyId, Dl, DrawerSection, Mono, Note, Person } from './parts';
import { exportCsv, useAdminTable, type FilterState } from './use-admin-table';

const icon = (Icon: typeof Copy) => <Icon aria-hidden="true" strokeWidth={1.75} />;
const roles = zhCN.communityAdmin.states.role;
const ac = zhCN.adminUi.csv.audit;
const lc = zhCN.adminUi.csv.logs;

// ================= 审计记录 =================
const a = zhCN.adminUi.audit;
const audit = zhCN.communityAdmin.audit;
const actionLabel = (action: string) => audit.actions[action as keyof typeof audit.actions] ?? action;
const targetLabel = (type: string) => audit.targets[type as keyof typeof audit.targets] ?? type;
const stateKey = (key: string) => audit.stateKeys[key as keyof typeof audit.stateKeys] ?? key;
const states = zhCN.communityAdmin.states;
function stateValue(key: string, value: string | number | boolean | null): string {
  if (value === null) return audit.empty;
  if (typeof value === 'boolean') return value ? audit.booleans.true : audit.booleans.false;
  const maps: Record<string, Record<string, string>> = {
    role: states.role, accountStatus: states.account, revisionStatus: states.revision, lifecycleStatus: states.work, reportStatus: states.report,
    status: { ...states.revision, ...states.comment, ...states.report, ...states.account, ...audit.batchStatuses },
    decision: { ...states.revision, ...states.comment, ...states.report },
  };
  return maps[key]?.[String(value)] ?? String(value);
}

/** 近 N 天（上海时间）起始日期。 */
function sinceDate(days: number): string {
  const shanghai = new Date(Date.now() + 8 * 60 * 60 * 1000 - (days - 1) * 24 * 60 * 60 * 1000);
  return shanghai.toISOString().slice(0, 10);
}

function StateBox({ title, state }: { title: string; state: AdminAuditEntry['beforeState'] }) {
  const entries = state ? Object.entries(state) : [];
  return (
    <section className="grid content-start gap-2 rounded-md bg-bg-subtle p-3">
      <h3 className="text-body-sm font-semibold text-ink">{title}</h3>
      {entries.length ? <Dl items={entries.map(([key, value]) => [stateKey(key), stateValue(key, value as string | number | boolean | null), true])} /> : <p className="text-body-sm text-ink-3">{audit.noState}</p>}
    </section>
  );
}

/** 对象：作品「标题」、评论“开头”、账号「名字」……名字查不到（已删除）时退回类型 + 编号前 8 位。 */
function targetText(item: AdminAuditEntry): string {
  const { name, revisionNumber } = item.target;
  if (!name) return `${targetLabel(item.targetType)} ${item.targetId.slice(0, 8)}`;
  if (item.targetType === 'community_comment') return a.commentTarget(name);
  if (item.targetType === 'community_revision') return a.revisionTarget(name, revisionNumber ?? 1);
  if (item.targetType === 'community_report') return a.reportTarget(name);
  return a.namedTarget(targetLabel(item.targetType), name);
}
const actorName = (item: AdminAuditEntry) => item.actor?.name ?? `${roles[item.actorRole]}（${audit.anonymized}）`;
const ActorCell = ({ item }: { item: AdminAuditEntry }) => (item.actor ? <Person {...item.actor} /> : <span className="text-ink-3">{actorName(item)}</span>);

/** 「操作人」筛选的候选：在记录里出现过的后台账号。 */
function useAuditActors() {
  const [actors, setActors] = useState<Array<{ userId: string; name: string }>>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/admin/audit/actors', { cache: 'no-store', signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { items?: Array<{ userId: string; name: string }> } | null) => { if (body?.items) setActors(body.items); })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return actors;
}

export function AuditConsole() {
  const table = useAdminTable<AdminAuditEntry>('/api/admin/audit', 'audit', {
    mapFilters: (filters: FilterState) => ({ action: filters.action ?? '', actor: filters.actor ?? '', from: typeof filters.range === 'string' && filters.range ? sinceDate(Number(filters.range)) : '' }),
  });
  const actors = useAuditActors();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = table.items.find((item) => item.id === openId) ?? null;
  const columns: Column<AdminAuditEntry>[] = [
    { key: 'time', label: a.columns.time, sort: (x, y) => x.createdAt.localeCompare(y.createdAt), cell: (item) => <span className="tabular-nums">{fmtDate(item.createdAt)}</span> },
    { key: 'actor', label: a.columns.actor, cell: (item) => <ActorCell item={item} /> },
    { key: 'action', label: a.columns.action, main: true, cell: (item) => <TitleCell title={actionLabel(item.action)} onOpen={() => setOpenId(item.id)} /> },
    { key: 'target', label: a.columns.target, cell: (item) => <span className="block max-w-60 truncate" title={targetText(item)}>{targetText(item)}</span> },
    { key: 'reason', label: a.columns.reason, cell: (item) => <span className="block max-w-75 truncate text-ink-3">{item.reason || '—'}</span> },
    { key: 'request', label: a.columns.request, cell: (item) => <Mono>{item.requestId.slice(0, 8)}</Mono> },
  ];
  return (
    <>
      <DataTable<AdminAuditEntry>
        label={a.label} rows={table.items} rowId={(item) => item.id} rowName={(item) => `${actionLabel(item.action)} ${targetText(item)}`} columns={columns} minWidth={960}
        card={(item) => ({ title: `${actionLabel(item.action)} · ${targetText(item)}`, meta: <>{actorName(item)} · <span className="tabular-nums">{fmtDate(item.createdAt)}</span></>, tail: item.reason ? <span className="text-body-sm text-ink-3">{item.reason}</span> : undefined })}
        loading={table.loading} error={table.error} onRetry={() => void table.reload()}
        search={{ value: table.input, onChange: table.setInput, placeholder: a.search }}
        filters={[
          { key: 'action', label: a.filters.action, multi: true, options: Object.entries(audit.actions).map(([value, label]) => ({ value, label })) },
          ...(actors.length ? [{ key: 'actor', label: a.filters.actor, multi: true, options: actors.map((actor) => ({ value: actor.userId, label: actor.name })) }] : []),
          { key: 'range', label: a.filters.range, options: Object.entries(a.ranges).map(([value, label]) => ({ value, label })) },
        ]}
        filterValues={table.filters} onFilterChange={table.setFilter}
        onExport={() => exportCsv<AdminAuditEntry>('/api/admin/audit', table.query, [
          [ac.time, (item) => fmtDate(item.createdAt)], [ac.actorName, actorName], [ac.role, (item) => roles[item.actorRole]], [ac.actor, (item) => item.actorUserId ?? ''], [ac.action, (item) => actionLabel(item.action)],
          [ac.target, (item) => `${targetText(item)} ${item.targetId}`], [ac.reason, (item) => item.reason], [ac.request, (item) => item.requestId],
        ], a.exportFile)}
        onOpen={(item) => setOpenId(item.id)} openId={openId}
        page={table.page} pageCount={table.totalPages} total={table.total} size={table.size} onPage={table.setPage} onSize={table.setSize}
        filtered={table.filtered} onReset={table.reset} emptyTitle={a.emptyTitle}
      />
      <AdminDrawer open={Boolean(open)} onOpenChange={(next) => { if (!next) setOpenId(null); }} title={open ? actionLabel(open.action) : ''}
        footer={<><Spacer /><Button onClick={() => setOpenId(null)}>{zhCN.adminUi.common.close}</Button></>}>
        {open ? <>
          <Dl items={[
            [a.drawer.actor, <span key="a" className="inline-flex flex-wrap items-center gap-2"><ActorCell item={open} /><Badge>{roles[open.actorRole]}</Badge></span>],
            [a.drawer.time, <span key="t" className="tabular-nums">{fmtDate(open.createdAt)}</span>],
            [a.drawer.target, <span key="g" className="inline-flex flex-wrap items-center gap-x-2">{targetText(open)}<CopyId value={open.targetId} label={a.drawer.targetId} /></span>, true],
            [a.drawer.reason, open.reason || '—', true],
            [a.drawer.request, <CopyId key="r" value={open.requestId} label={a.drawer.request} />],
            [a.drawer.id, <CopyId key="i" value={open.id} label={a.drawer.id} />],
          ]} />
          <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
            <StateBox title={a.drawer.before} state={open.beforeState} />
            <StateBox title={a.drawer.after} state={open.afterState} />
          </div>
          <Note icon={icon(Lock)}>{audit.readOnly}</Note>
        </> : null}
      </AdminDrawer>
    </>
  );
}

// ================= 运行日志 =================
const l = zhCN.adminUi.logs;
const logs = zhCN.communityAdmin.logs;
const levelLabel = (level: string) => logs.levels[level as keyof typeof logs.levels] ?? level;
const sourceLabel = (source: string) => logs.sources[source as keyof typeof logs.sources] ?? source;
const LEVEL_TONE = { error: 'danger', warn: 'warning', info: 'neutral', debug: 'neutral' } as const;
const LevelBadge = ({ level }: { level: string }) => <Badge tone={LEVEL_TONE[level as keyof typeof LEVEL_TONE] ?? 'neutral'} dot>{levelLabel(level)}</Badge>;

function useCopy() {
  const toast = useToast();
  return (value: string) => { void navigator.clipboard?.writeText(value).catch(() => {}); toast(zhCN.adminUi.common.copied(value), { icon: icon(Copy) }); };
}

function EventsView() {
  const copy = useCopy();
  const table = useAdminTable<AdminSystemLogEntry>('/api/admin/logs', 'logs');
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ id: string; data: AdminSystemLogDetail | null; error: boolean } | null>(null);
  useEffect(() => {
    if (!openId) return;
    const controller = new AbortController();
    fetch(`/api/admin/logs/${openId}`, { cache: 'no-store', signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('read failed'))))
      .then((body: AdminSystemLogDetail) => setDetail({ id: openId, data: body, error: false }))
      .catch(() => { if (!controller.signal.aborted) setDetail({ id: openId, data: null, error: true }); });
    return () => controller.abort();
  }, [openId]);
  const listed = table.items.find((item) => item.id === openId) ?? null;
  const current = detail?.id === openId ? detail : null;
  const item = current?.data?.item ?? null;
  const columns: Column<AdminSystemLogEntry>[] = [
    { key: 'time', label: l.columns.time, sort: (x, y) => x.createdAt.localeCompare(y.createdAt), cell: (row) => <span className="tabular-nums">{fmtDate(row.createdAt)}</span> },
    { key: 'level', label: l.columns.level, cell: (row) => <LevelBadge level={row.level} /> },
    { key: 'event', label: l.columns.event, main: true, cell: (row) => <TitleCell title={row.event} onOpen={() => setOpenId(row.id)} /> },
    { key: 'message', label: l.columns.message, cell: (row) => <span className="block max-w-75 truncate">{row.message ?? logs.noMessage}</span> },
    { key: 'source', label: l.columns.source, cell: (row) => sourceLabel(row.source) },
    { key: 'request', label: l.columns.request, cell: (row) => <Mono>{row.requestId ?? '—'}</Mono> },
  ];
  return (
    <>
      <DataTable<AdminSystemLogEntry>
        label={l.label} rows={table.items} rowId={(row) => row.id} rowName={(row) => row.event} columns={columns} minWidth={980}
        card={(row) => ({ title: row.message ?? row.event, meta: <><span className="font-mono">{row.event}</span> · <span className="tabular-nums">{fmtDate(row.createdAt)}</span></>, tail: <><LevelBadge level={row.level} /><span className="text-body-sm text-ink-3">{sourceLabel(row.source)}</span></> })}
        loading={table.loading} error={table.error} onRetry={() => void table.reload()}
        search={{ value: table.input, onChange: table.setInput, placeholder: l.search }}
        filters={[
          { key: 'level', label: l.filters.level, options: (['error', 'warn', 'info', 'debug'] as const).map((value) => ({ value, label: levelLabel(value) })) },
          { key: 'source', label: l.filters.source, options: Object.keys(logs.sources).map((value) => ({ value, label: sourceLabel(value) })) },
        ]}
        filterValues={table.filters} onFilterChange={table.setFilter}
        onExport={() => exportCsv<AdminSystemLogEntry>('/api/admin/logs', table.query, [
          [lc.time, (row) => fmtDate(row.createdAt)], [lc.level, (row) => levelLabel(row.level)], [lc.source, (row) => sourceLabel(row.source)], [lc.event, (row) => row.event], [lc.message, (row) => row.message ?? ''], [lc.request, (row) => row.requestId ?? ''],
        ], l.exportFile)}
        onOpen={(row) => setOpenId(row.id)} openId={openId}
        page={table.page} pageCount={table.totalPages} total={table.total} size={table.size} onPage={table.setPage} onSize={table.setSize}
        filtered={table.filtered} onReset={table.reset} emptyTitle={l.emptyTitle}
      />
      <AdminDrawer open={Boolean(openId)} onOpenChange={(next) => { if (!next) setOpenId(null); }} title={listed?.event ?? item?.event ?? logs.detail}
        badges={listed ? <LevelBadge level={listed.level} /> : null}
        footer={(item ?? listed)?.requestId ? <><Spacer /><Button onClick={() => copy((item ?? listed)!.requestId!)}>{icon(Copy)}{l.copy}</Button></> : undefined}>
        {current?.error ? <FormAlert>{zhCN.communityAdmin.queueLoadFailed}</FormAlert> : !item ? <Skeleton className="h-60" /> : <>
          <Dl items={[
            [logs.level, <LevelBadge key="l" level={item.level} />],
            [logs.source, sourceLabel(item.source)],
            [logs.time, <span key="t" className="tabular-nums">{fmtDate(item.createdAt)}</span>],
            [logs.status, item.status ?? logs.noValue],
            [logs.method, item.method ?? logs.noValue],
            [logs.duration, item.durationMs === null ? logs.noValue : l.ms(item.durationMs)],
            [logs.path, item.path ?? logs.noValue, true],
            [logs.errorCode, item.errorCode ?? logs.noValue],
            [logs.ipMasked, <Mono key="ip">{item.ipMasked ?? logs.noValue}</Mono>],
            [logs.actor, <span key="a"><Mono>{item.actorUserId ?? zhCN.communityAdmin.audit.anonymized}</Mono>{item.actorRole ? ` · ${roles[item.actorRole as keyof typeof roles] ?? item.actorRole}` : ''}</span>, true],
            [logs.request, <Mono key="r">{item.requestId ?? logs.noValue}</Mono>, true],
            [logs.message, <span key="m" className="whitespace-normal text-ink-2">{item.message ?? logs.noMessage}</span>, true],
          ]} />
          {item.stack ? <Collapsible summary={logs.stack}><CodeBlock>{item.stack}</CodeBlock></Collapsible> : null}
          <Collapsible summary={logs.context}>{typeof item.context === 'object' && item.context !== null ? <CodeBlock>{JSON.stringify(item.context, null, 2)}</CodeBlock> : <p className="text-body-sm text-ink-3">{logs.noContext}</p>}</Collapsible>
          <DrawerSection title={logs.related}>
            {current?.data && current.data.related.length > 1 ? (
              <ul className="grid gap-2">
                {current.data.related.map((row) => (
                  <li key={row.id} className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 text-body-sm text-ink-2 max-md:grid-cols-1 max-md:gap-0">
                    <span className="text-ink-3 tabular-nums">{fmtDate(row.createdAt)}</span>
                    <span className="truncate"><b className="font-semibold text-ink">{row.event}</b> {row.message ?? ''}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-body-sm text-ink-3">{logs.noRelated}</p>}
          </DrawerSection>
          <Note icon={icon(Lock)}>{logs.maskedNote}</Note>
        </>}
      </AdminDrawer>
    </>
  );
}

interface ChainSpan { kind: string; name: string; detail?: string }
function readChain(chain: unknown): ChainSpan[] {
  if (!Array.isArray(chain)) return [];
  return chain.flatMap((span) => {
    const value = span as { kind?: unknown; name?: unknown; detail?: unknown } | null;
    if (!value || typeof value.name !== 'string') return [];
    return [{ kind: typeof value.kind === 'string' ? value.kind : '', name: value.name, detail: typeof value.detail === 'string' ? value.detail : undefined }];
  });
}

function SlowView() {
  const s = logs.slow;
  const table = useAdminTable<AdminSlowQueryEntry>('/api/admin/logs/slow-queries', 'slow-queries', { mapFilters: (filters) => ({ minDurationMs: filters.duration ?? '' }) });
  const [openId, setOpenId] = useState<string | null>(null);
  const open = table.items.find((row) => row.id === openId) ?? null;
  const chain = open ? readChain(open.chain) : [];
  const columns: Column<AdminSlowQueryEntry>[] = [
    { key: 'duration', label: l.columns.duration, main: true, sort: (x, y) => x.durationMs - y.durationMs, cell: (row) => <TitleCell title={l.ms(row.durationMs)} onOpen={() => setOpenId(row.id)} /> },
    { key: 'time', label: l.columns.time, cell: (row) => <span className="tabular-nums">{fmtDate(row.createdAt)}</span> },
    { key: 'route', label: l.columns.route, cell: (row) => row.route ?? '—' },
    { key: 'statement', label: l.columns.statement, cell: (row) => <span className="block max-w-100 truncate font-mono text-caption font-normal text-ink-3">{row.statement}</span> },
  ];
  return (
    <>
      <DataTable<AdminSlowQueryEntry>
        label={l.slowLabel} rows={table.items} rowId={(row) => row.id} rowName={(row) => l.ms(row.durationMs)} columns={columns} minWidth={900}
        card={(row) => ({ title: l.ms(row.durationMs), meta: <>{row.route ?? '—'} · <span className="tabular-nums">{fmtDate(row.createdAt)}</span></>, tail: <span className="truncate font-mono text-caption text-ink-3">{row.statement.slice(0, 80)}</span> })}
        loading={table.loading} error={table.error} onRetry={() => void table.reload()}
        search={{ value: table.input, onChange: table.setInput, placeholder: l.slowSearch }}
        filters={[{ key: 'duration', label: l.filters.duration, options: Object.entries(l.durations).map(([value, label]) => ({ value, label })) }]}
        filterValues={table.filters} onFilterChange={table.setFilter}
        onOpen={(row) => setOpenId(row.id)} openId={openId}
        page={table.page} pageCount={table.totalPages} total={table.total} size={table.size} onPage={table.setPage} onSize={table.setSize}
        filtered={table.filtered} onReset={table.reset} emptyTitle={l.slowEmpty} emptyText={s.help}
      />
      <AdminDrawer open={Boolean(open)} onOpenChange={(next) => { if (!next) setOpenId(null); }} title={open ? l.ms(open.durationMs) : ''}>
        {open ? <>
          <Dl items={[
            [logs.time, <span key="t" className="tabular-nums">{fmtDate(open.createdAt)}</span>],
            [s.rowCount, open.rowCount ?? logs.noValue],
            [logs.route, open.route ?? logs.noValue, true],
            [logs.method, open.method ?? logs.noValue],
            [logs.request, <Mono key="r">{open.requestId ?? logs.noValue}</Mono>],
          ]} />
          <DrawerSection title={s.chain}>
            {chain.length ? <ol className="grid gap-2">{chain.map((span, index) => <li key={`${span.name}-${index}`} className="flex flex-wrap items-center gap-2 text-body-sm"><Badge>{span.kind}</Badge><span className="text-ink">{span.name}</span>{span.detail ? <small className="text-caption font-normal text-ink-3">{span.detail}</small> : null}</li>)}</ol>
              : <p className="text-body-sm text-ink-3">{s.noChain}</p>}
          </DrawerSection>
          <DrawerSection title={s.statement}><CodeBlock>{open.statement}</CodeBlock></DrawerSection>
        </> : null}
      </AdminDrawer>
    </>
  );
}

function DatabaseView() {
  const d = logs.database;
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; health?: DatabaseHealth }>({ status: 'loading' });
  const [token, setToken] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/admin/logs/database', { cache: 'no-store', signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('read failed'))))
      .then((body: DatabaseHealth) => setState({ status: 'ready', health: body }))
      .catch(() => { if (!controller.signal.aborted) setState({ status: 'error' }); });
    return () => controller.abort();
  }, [token]);
  const reload = <Button size="sm" onClick={() => { setState({ status: 'loading' }); setToken(token + 1); }}>{d.refresh}</Button>;
  if (state.status === 'error') return <AdminCard className="grid justify-items-start gap-3 p-5"><FormAlert>{zhCN.communityAdmin.queueLoadFailed}</FormAlert>{reload}</AdminCard>;
  if (!state.health) return <AdminCard className="p-5"><Skeleton className="h-40" /></AdminCard>;
  const health = state.health;
  const size = health.size.available && health.size.bytes !== null ? `${(health.size.bytes / (1024 * 1024)).toFixed(1)} MB` : d.sizeUnavailable;
  return (
    <div className="grid gap-5 lg:grid-cols-2 max-md:gap-3">
      <AdminCard>
        <CardHead title={d.title}><span className="ml-auto">{reload}</span></CardHead>
        <div className="p-5 max-md:p-4">{health.pool ? <Dl items={[[d.total, health.pool.totalCount], [d.idle, health.pool.idleCount], [d.waiting, health.pool.waitingCount], [d.max, health.pool.max]]} /> : <p className="text-body-sm text-ink-3">{d.poolUnavailable}</p>}</div>
      </AdminCard>
      <AdminCard>
        <CardHead title={d.activity} aside={`${d.checkedAt} ${fmtDate(health.checkedAt)}`} />
        <div className="grid gap-3 p-5 max-md:p-4">
          {health.activity.available ? <Dl items={[
            [d.activityTotal, health.activity.total ?? d.unavailable], [d.active, health.activity.active ?? d.unavailable], [d.idleState, health.activity.idle ?? d.unavailable],
            [d.idleInTransaction, health.activity.idleInTransaction ?? d.unavailable], [d.longest, health.activity.longestRunningMs === null ? d.unavailable : l.ms(health.activity.longestRunningMs)],
          ]} /> : <p className="text-body-sm text-ink-3">{health.activity.reason ?? d.unavailable}</p>}
          {health.activity.canReadAll === false ? <Note tone="warning" icon={icon(Lock)}>{d.visibleOnly}</Note> : null}
          <p className="text-body-sm text-ink-3">{`${d.size}：${size}`}</p>
        </div>
      </AdminCard>
      <AdminCard className="lg:col-span-2">
        <CardHead title={d.statStatements}><Badge tone={health.statements.available ? 'success' : 'neutral'} dot className="ml-auto">{health.statements.available ? d.enabled : d.disabled}</Badge></CardHead>
        <div className="grid gap-3 p-5 max-md:p-4">
          <p className="text-body-sm text-ink-3">{health.statements.hint}</p>
          {!health.statements.available ? <ol className="grid gap-1 text-body-sm text-ink-2">{d.statStatementsSteps.map((step) => <li key={step}>{step}</li>)}</ol> : null}
        </div>
      </AdminCard>
    </div>
  );
}

export function LogsConsole() {
  const [view, setView] = useState<'events' | 'slow' | 'database'>('events');
  return (
    <>
      <SegmentedControl label={l.views} value={view} onValueChange={setView} className="self-start"
        items={[{ value: 'events', label: logs.viewTabs.events }, { value: 'slow', label: logs.viewTabs.slow }, { value: 'database', label: logs.viewTabs.database }]} />
      {view === 'events' ? <EventsView /> : view === 'slow' ? <SlowView /> : <DatabaseView />}
      <p className="text-body-sm text-ink-3">{logs.retention}</p>
    </>
  );
}
