'use client';

/**
 * 运行日志控制台（用户第 15 条）：错误与事件 / 慢查询 / 数据库三个视图。
 *
 * 布局沿用后台既有的「左队列 + 右详情」约定（`.admin-task-layout`）：
 * 列表在内部滚动，选中行后窄屏切到详情。
 * 详情里的调用堆栈与上下文 JSON 走 `Disclosure`（可折叠），避免一屏全是堆栈。
 */
import { useEffect, useState, type CSSProperties } from 'react';
import type { AdminSlowQueryEntry, AdminSystemLogDetail, AdminSystemLogEntry } from '@/lib/admin/queries';
import type { DatabaseHealth } from '@/lib/admin/dbHealth';
import { zhCN } from '@/messages/zh-CN';
import Badge, { type BadgeTone } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import DateRangePicker from '@/components/ui/DateRangePicker';
import Disclosure from '@/components/ui/Disclosure';
import Notice from '@/components/ui/Notice';
import NumberField from '@/components/ui/NumberField';
import ResponsiveSelect from '@/components/ui/ResponsiveSelect';
import SegmentedControl from '@/components/ui/SegmentedControl';
import TextField from '@/components/ui/TextField';
import AdminQueueState from '@/components/admin/AdminQueueState';
import { AdminEmpty, AdminPagination, FilterBar } from '@/components/admin/AdminPrimitives';
import { useAdminPage } from '@/components/admin/useAdminPage';
import { useAdminTaskFocus } from '@/components/admin/useAdminTaskFocus';

type View = 'events' | 'slow' | 'database';

const LEVEL_TONES: Record<string, BadgeTone> = { debug: 'neutral', info: 'progress', warn: 'warn', error: 'danger' };

const formatDate = (value: string) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Shanghai' }).format(new Date(value));

/** 只保留有值的筛选条件：空字符串会让服务端的 `.strict()` schema 报错。 */
const toQuery = (fields: Record<string, string | number | undefined>): string => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== '' && value !== null) params.set(key, String(value));
  }
  return params.toString();
};

interface ChainSpan { kind: string; name: string; detail?: string }

/** jsonb 里的调用链是外部输入：逐项校验后再渲染，坏数据只会少显示几环。 */
function readChain(chain: unknown): ChainSpan[] {
  if (!Array.isArray(chain)) return [];
  return chain.flatMap((span) => {
    if (!span || typeof span !== 'object') return [];
    const candidate = span as { kind?: unknown; name?: unknown; detail?: unknown };
    if (typeof candidate.name !== 'string') return [];
    return [{ kind: typeof candidate.kind === 'string' ? candidate.kind : '', name: candidate.name, detail: typeof candidate.detail === 'string' ? candidate.detail : undefined }];
  });
}

export default function LogsExplorer() {
  const t = zhCN.communityAdmin.logs;
  const [view, setView] = useState<View>('events');
  const levelLabel = (level: string) => t.levels[level as keyof typeof t.levels] ?? level;
  const sourceLabel = (source: string) => t.sources[source as keyof typeof t.sources] ?? source;

  return <div className="admin-log-views">
    <SegmentedControl className="admin-log-tabs" size="sm" label={t.views} value={view} onValueChange={(next) => setView(next as View)}
      options={[{ value: 'events', label: t.viewTabs.events }, { value: 'slow', label: t.viewTabs.slow }, { value: 'database', label: t.viewTabs.database }]} />
    {view === 'events' && <EventsView levelLabel={levelLabel} sourceLabel={sourceLabel} />}
    {view === 'slow' && <SlowView />}
    {view === 'database' && <DatabaseView />}
    <p className="admin-help">{t.retention}</p>
  </div>;
}

function EventsView({ levelLabel, sourceLabel }: { levelLabel: (level: string) => string; sourceLabel: (source: string) => string }) {
  const t = zhCN.communityAdmin.logs;
  const c = zhCN.communityAdmin.command;
  const [fields, setFields] = useState({ q: '', level: '', source: '', event: '', actorUserId: '', requestId: '', from: '', to: '' });
  const [filter, setFilter] = useState(fields);
  const queue = useAdminPage<AdminSystemLogEntry>(`/api/admin/logs?${toQuery(filter)}`, 'logs');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 详情状态按 id 标记：切换选中行时旧详情自动失效，不需要在 effect 里同步 setState。
  const [detailState, setDetailState] = useState<{ id: string; data: AdminSystemLogDetail | null; error: string | null } | null>(null);
  const { queueRef, detailRef } = useAdminTaskFocus(selectedId);

  // 详情单独取：列表不带堆栈与上下文（一页 100 条会变成几 MB）。
  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    fetch(`/api/admin/logs/${selectedId}`, { cache: 'no-store', signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('read failed')))
      .then((body: AdminSystemLogDetail) => { if (!controller.signal.aborted) setDetailState({ id: selectedId, data: body, error: null }); })
      .catch(() => { if (!controller.signal.aborted) setDetailState({ id: selectedId, data: null, error: zhCN.communityAdmin.queueLoadFailed }); });
    return () => controller.abort();
  }, [selectedId]);

  const current = detailState && detailState.id === selectedId ? detailState : null;
  const detail = current?.data ?? null;
  const detailError = current?.error ?? null;
  const selected = detail?.item ?? null;
  const move = (next: number) => { setSelectedId(null); queue.setPage(next); };
  return <div className={`admin-task-layout${selectedId ? ' is-inspecting' : ''}`}>
    <section className="admin-panel admin-task-queue" ref={queueRef} tabIndex={-1} aria-label={t.queue}>
      <header><h2>{t.queue}</h2><span>{zhCN.communityAdmin.pagination.totalCount(queue.total)}</span></header>
      <FilterBar submitLabel={t.query} disabled={queue.loading || Boolean(fields.from && fields.to && fields.from > fields.to)} onSubmit={(event) => {
        event.preventDefault(); setSelectedId(null);
        const unchanged = JSON.stringify(fields) === JSON.stringify(filter);
        setFilter({ ...fields });
        if (unchanged && queue.page === 1) void queue.reload(); else queue.setPage(1);
      }}>
        <TextField label={t.search} value={fields.q} maxLength={120} onChange={(event) => setFields({ ...fields, q: event.target.value })} />
        <ResponsiveSelect label={t.level} size="sm" value={fields.level} onValueChange={(next) => setFields({ ...fields, level: next })}
          options={[{ value: '', label: t.allLevels }, ...(['error', 'warn', 'info', 'debug'] as const).map((level) => ({ value: level, label: levelLabel(level) }))]} />
        <ResponsiveSelect label={t.source} size="sm" value={fields.source} onValueChange={(next) => setFields({ ...fields, source: next })}
          options={[{ value: '', label: t.allSources }, ...Object.keys(t.sources).map((source) => ({ value: source, label: sourceLabel(source) }))]} />
        <TextField label={t.event} value={fields.event} maxLength={160} onChange={(event) => setFields({ ...fields, event: event.target.value })} />
        <TextField label={t.actor} value={fields.actorUserId} maxLength={64} mono onChange={(event) => setFields({ ...fields, actorUserId: event.target.value })} />
        <TextField label={t.request} value={fields.requestId} maxLength={64} mono onChange={(event) => setFields({ ...fields, requestId: event.target.value })} />
        <DateRangePicker label={t.range} startLabel={t.from} endLabel={t.to} value={{ start: fields.from, end: fields.to }}
          onValueChange={({ start, end }) => setFields({ ...fields, from: start, to: end })} className="form-row-wide" />
      </FilterBar>
      <p className="admin-help admin-queue-help">{t.queryHelp}</p>
      <AdminQueueState {...queue} empty={queue.items.length === 0}>
        <ul className="admin-object-list stagger">{queue.items.map((item, index) => <li key={item.id} style={{ '--i': index } as CSSProperties}>
          <button type="button" aria-current={selectedId === item.id} onClick={() => setSelectedId(item.id)}>
            <Badge tone={LEVEL_TONES[item.level] ?? 'neutral'}>{levelLabel(item.level)}</Badge>
            <strong>{item.event}</strong>
            <span>{formatDate(item.createdAt)} · {sourceLabel(item.source)}{item.status !== null ? ` · ${item.status}` : ''}{item.actorRole ? ` · ${zhCN.communityAdmin.states.role[item.actorRole as keyof typeof zhCN.communityAdmin.states.role] ?? item.actorRole}` : ''}</span>
            <small className="mono-id">{item.path ?? item.requestId ?? item.id}</small>
          </button>
        </li>)}</ul>
      </AdminQueueState>
      <AdminPagination page={queue.page} totalPages={queue.totalPages} size={queue.size} total={queue.total}
        onPage={move} onSize={(next) => { setSelectedId(null); queue.setSize(next); }} disabled={queue.loading} />
    </section>
    <section className="admin-panel admin-task-detail" ref={detailRef} tabIndex={-1} aria-label={t.detail}>
      <header><h2>{t.detail}</h2></header>
      {detailError && <Notice kind="danger">{detailError}</Notice>}
      {selected ? <div className="admin-form-stack animate-rise">
        <Button variant="quiet" size="sm" icon="chevron-left" className="admin-back-to-queue" onClick={() => setSelectedId(null)}>{c.back}</Button>
        <h2>{selected.event}</h2>
        <dl className="admin-evidence-list">
          <div><dt>{t.time}</dt><dd>{formatDate(selected.createdAt)}</dd></div>
          <div><dt>{t.level}</dt><dd><Badge tone={LEVEL_TONES[selected.level] ?? 'neutral'}>{levelLabel(selected.level)}</Badge><br /><code>{selected.level}</code></dd></div>
          <div><dt>{t.source}</dt><dd>{sourceLabel(selected.source)}<br /><code>{selected.source}</code></dd></div>
          <div><dt>{t.status}</dt><dd>{selected.status ?? t.noValue}</dd></div>
          <div><dt>{t.duration}</dt><dd>{selected.durationMs === null ? t.noValue : `${selected.durationMs} ms`}</dd></div>
          <div><dt>{t.method}</dt><dd>{selected.method ?? t.noValue}</dd></div>
          <div><dt>{t.path}</dt><dd>{selected.path ?? t.noValue}</dd></div>
          <div><dt>{t.route}</dt><dd>{selected.route ?? t.noValue}</dd></div>
          <div><dt>{t.errorCode}</dt><dd>{selected.errorCode ?? t.noValue}</dd></div>
          <div><dt>{t.actor}</dt><dd><code>{selected.actorUserId ?? zhCN.communityAdmin.audit.anonymized}</code>{selected.actorRole ? ` · ${zhCN.communityAdmin.states.role[selected.actorRole as keyof typeof zhCN.communityAdmin.states.role] ?? selected.actorRole}` : ''}</dd></div>
          <div><dt>{t.request}</dt><dd><code>{selected.requestId ?? t.noValue}</code></dd></div>
          <div><dt>{t.ipMasked}</dt><dd><code>{selected.ipMasked ?? t.noValue}</code></dd></div>
          <div><dt>{t.message}</dt><dd className="governance-body">{selected.message ?? t.noMessage}</dd></div>
        </dl>
        <p className="admin-help">{t.maskedNote}</p>
        {selected.stack && <Disclosure summary={t.stack}><pre className="admin-log-pre">{selected.stack}</pre></Disclosure>}
        <Disclosure summary={t.context}>{typeof selected.context === 'object' && selected.context !== null
          ? <pre className="admin-log-pre">{JSON.stringify(selected.context, null, 2)}</pre>
          : <p className="admin-help">{t.noContext}</p>}</Disclosure>
        <section className="surface-sunken admin-state-box">
          <h3>{t.related}</h3>
          {detail && detail.related.length > 1
            ? <ul className="admin-log-related">{detail.related.map((row) => <li key={row.id} className={row.id === selected.id ? 'is-current' : undefined}>
              <span className="mono-id">{formatDate(row.createdAt)}</span>
              <Badge tone={LEVEL_TONES[row.level] ?? 'neutral'}>{levelLabel(row.level)}</Badge>
              <strong>{row.event}</strong>
              <span>{row.message ?? t.noMessage}</span>
            </li>)}</ul>
            : <p className="admin-help">{detail ? t.noRelated : c.loading}</p>}
        </section>
      </div> : <AdminEmpty icon="list" title={t.select} />}
    </section>
  </div>;
}

function SlowView() {
  const t = zhCN.communityAdmin.logs;
  const s = t.slow;
  const c = zhCN.communityAdmin.command;
  const [fields, setFields] = useState<{ q: string; route: string; minDurationMs: number | undefined; from: string; to: string }>({ q: '', route: '', minDurationMs: undefined, from: '', to: '' });
  const [filter, setFilter] = useState(fields);
  const queue = useAdminPage<AdminSlowQueryEntry>(`/api/admin/logs/slow-queries?${toQuery(filter)}`, 'slow-queries');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = queue.items.find((item) => item.id === selectedId) ?? null;
  const { queueRef, detailRef } = useAdminTaskFocus(selected?.id ?? null);
  const move = (next: number) => { setSelectedId(null); queue.setPage(next); };
  const chain = selected ? readChain(selected.chain) : [];
  return <div className={`admin-task-layout${selected ? ' is-inspecting' : ''}`}>
    <section className="admin-panel admin-task-queue" ref={queueRef} tabIndex={-1} aria-label={s.queue}>
      <header><h2>{s.queue}</h2><span>{zhCN.communityAdmin.pagination.totalCount(queue.total)}</span></header>
      <FilterBar submitLabel={t.query} disabled={queue.loading || Boolean(fields.from && fields.to && fields.from > fields.to)} onSubmit={(event) => {
        event.preventDefault(); setSelectedId(null);
        const unchanged = JSON.stringify(fields) === JSON.stringify(filter);
        setFilter({ ...fields });
        if (unchanged && queue.page === 1) void queue.reload(); else queue.setPage(1);
      }}>
        <TextField label={s.search} value={fields.q} maxLength={120} onChange={(event) => setFields({ ...fields, q: event.target.value })} />
        <TextField label={s.route} value={fields.route} maxLength={160} onChange={(event) => setFields({ ...fields, route: event.target.value })} />
        <NumberField label={s.minDuration} value={fields.minDurationMs} min={0} max={600_000} step={50}
          onValueChange={(value) => setFields({ ...fields, minDurationMs: value })} />
        <DateRangePicker label={t.range} startLabel={t.from} endLabel={t.to} value={{ start: fields.from, end: fields.to }}
          onValueChange={({ start, end }) => setFields({ ...fields, from: start, to: end })} className="form-row-wide" />
      </FilterBar>
      <p className="admin-help admin-queue-help">{s.help}</p>
      <AdminQueueState {...queue} empty={queue.items.length === 0}>
        <ul className="admin-object-list stagger">{queue.items.map((item, index) => <li key={item.id} style={{ '--i': index } as CSSProperties}>
          <button type="button" aria-current={selectedId === item.id} onClick={() => setSelectedId(item.id)}>
            <strong>{`${item.durationMs} ms`}</strong>
            <span>{formatDate(item.createdAt)}{item.route ? ` · ${item.route}` : ''}</span>
            <small className="mono-id">{item.statement.slice(0, 120)}</small>
          </button>
        </li>)}</ul>
      </AdminQueueState>
      <AdminPagination page={queue.page} totalPages={queue.totalPages} size={queue.size} total={queue.total}
        onPage={move} onSize={(next) => { setSelectedId(null); queue.setSize(next); }} disabled={queue.loading} />
    </section>
    <section className="admin-panel admin-task-detail" ref={detailRef} tabIndex={-1} aria-label={t.detail}>
      <header><h2>{t.detail}</h2></header>
      {selected ? <div className="admin-form-stack animate-rise">
        <Button variant="quiet" size="sm" icon="chevron-left" className="admin-back-to-queue" onClick={() => setSelectedId(null)}>{c.back}</Button>
        <h2>{`${selected.durationMs} ms`}</h2>
        <dl className="admin-evidence-list">
          <div><dt>{t.time}</dt><dd>{formatDate(selected.createdAt)}</dd></div>
          <div><dt>{t.duration}</dt><dd>{`${selected.durationMs} ms`}</dd></div>
          <div><dt>{s.rowCount}</dt><dd>{selected.rowCount ?? t.noValue}</dd></div>
          <div><dt>{t.route}</dt><dd>{selected.route ?? t.noValue}</dd></div>
          <div><dt>{t.method}</dt><dd>{selected.method ?? t.noValue}</dd></div>
          <div><dt>{t.actor}</dt><dd><code>{selected.actorUserId ?? zhCN.communityAdmin.audit.anonymized}</code></dd></div>
          <div><dt>{t.request}</dt><dd><code>{selected.requestId ?? t.noValue}</code></dd></div>
        </dl>
        <section className="surface-sunken admin-state-box"><h3>{s.chain}</h3>
          {chain.length > 0 ? <ol className="admin-log-chain">{chain.map((span, index) => <li key={`${span.kind}:${span.name}:${index}`}>
            <Badge tone="neutral">{span.kind}</Badge><span>{span.name}</span>{span.detail && <small>{span.detail}</small>}
          </li>)}</ol> : <p className="admin-help">{s.noChain}</p>}
        </section>
        <Disclosure summary={s.statement} defaultExpanded><pre className="admin-log-pre">{selected.statement}</pre></Disclosure>
      </div> : <AdminEmpty icon="list" title={s.select} />}
    </section>
  </div>;
}

function DatabaseView() {
  const t = zhCN.communityAdmin.logs.database;
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; health?: DatabaseHealth }>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/admin/logs/database', { cache: 'no-store', signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('read failed')))
      .then((body: DatabaseHealth) => { if (!controller.signal.aborted) setState({ status: 'ready', health: body }); })
      .catch(() => { if (!controller.signal.aborted) setState({ status: 'error' }); });
    return () => controller.abort();
  }, [reloadToken]);
  const reload = () => { setState({ status: 'loading' }); setReloadToken(reloadToken + 1); };
  if (state.status === 'error') return <div className="admin-form-stack"><Notice kind="danger">{zhCN.communityAdmin.queueLoadFailed}</Notice>
    <div className="admin-form-actions"><Button variant="secondary" size="sm" icon="refresh" onClick={reload}>{t.refresh}</Button></div></div>;
  if (!state.health) return <div className="admin-task-layout"><section className="admin-panel"><p className="admin-help">{zhCN.communityAdmin.command.loading}</p></section></div>;
  const health = state.health;
  const size = health.size.available && health.size.bytes !== null ? `${(health.size.bytes / (1024 * 1024)).toFixed(1)} MB` : t.sizeUnavailable;
  return <div className="admin-log-database">
    <section className="admin-panel">
      <header><h2>{t.title}</h2><Button variant="secondary" size="sm" icon="refresh" onClick={reload}>{t.refresh}</Button></header>
      {health.pool ? <dl className="admin-evidence-list">
        <div><dt>{t.total}</dt><dd>{health.pool.totalCount}</dd></div>
        <div><dt>{t.idle}</dt><dd>{health.pool.idleCount}</dd></div>
        <div><dt>{t.waiting}</dt><dd>{health.pool.waitingCount}</dd></div>
        <div><dt>{t.max}</dt><dd>{health.pool.max}</dd></div>
      </dl> : <p className="admin-help">{t.poolUnavailable}</p>}
    </section>
    <section className="admin-panel">
      <header><h2>{t.activity}</h2><span>{`${t.checkedAt} ${formatDate(health.checkedAt)}`}</span></header>
      {health.activity.available ? <>
        <dl className="admin-evidence-list">
          <div><dt>{t.activityTotal}</dt><dd>{health.activity.total ?? t.unavailable}</dd></div>
          <div><dt>{t.active}</dt><dd>{health.activity.active ?? t.unavailable}</dd></div>
          <div><dt>{t.idleState}</dt><dd>{health.activity.idle ?? t.unavailable}</dd></div>
          <div><dt>{t.idleInTransaction}</dt><dd>{health.activity.idleInTransaction ?? t.unavailable}</dd></div>
          <div><dt>{t.longest}</dt><dd>{health.activity.longestRunningMs === null ? t.unavailable : `${health.activity.longestRunningMs} ms`}</dd></div>
        </dl>
        {health.activity.canReadAll === false && <Notice kind="warning">{t.visibleOnly}</Notice>}
      </> : <p className="admin-help">{health.activity.reason ?? t.unavailable}</p>}
      <p className="admin-help">{`${t.size}：${size}`}</p>
    </section>
    <section className="admin-panel">
      <header><h2>{t.statStatements}</h2><span className={`admin-run-state ${health.statements.available ? 'is-succeeded' : 'is-failed'}`}>{health.statements.available ? t.enabled : t.disabled}</span></header>
      <p className="admin-help">{health.statements.hint}</p>
      {!health.statements.available && <ol className="admin-log-steps">{t.statStatementsSteps.map((step) => <li key={step}>{step}</li>)}</ol>}
    </section>
  </div>;
}
