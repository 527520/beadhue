'use client';

import { useState, type CSSProperties } from 'react';
import type { AdminAuditEntry } from '@/lib/admin/queries';
import { zhCN } from '@/messages/zh-CN';
import DateRangePicker from '@/components/ui/DateRangePicker';
import Button from '@/components/ui/Button';
import TextField from '@/components/ui/TextField';
import AdminQueueState from './AdminQueueState';
import { AdminEmpty, AdminPagination, FilterBar } from './AdminPrimitives';
import { useAdminPage } from './useAdminPage';
import { useAdminTaskFocus } from './useAdminTaskFocus';

const formatDate = (value: string) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Shanghai' }).format(new Date(value));

/** 审计动作、对象类型与状态字段全部映射成中文；未知值原样展示，避免遮盖新事实。 */
const audit = zhCN.communityAdmin.audit;
const actionLabel = (action: string) => audit.actions[action as keyof typeof audit.actions] ?? action;
const targetLabel = (type: string) => audit.targets[type as keyof typeof audit.targets] ?? type;
const stateKeyLabel = (key: string) => audit.stateKeys[key as keyof typeof audit.stateKeys] ?? key;
const states = zhCN.communityAdmin.states;
const stateValueLabel = (key: string, value: string | number | boolean | null): string => {
  if (value === null) return audit.empty;
  if (typeof value === 'boolean') return value ? audit.booleans.true : audit.booleans.false;
  const text = String(value);
  const maps: Record<string, Record<string, string>> = {
    role: states.role, accountStatus: states.account, revisionStatus: states.revision, lifecycleStatus: states.work, reportStatus: states.report,
    status: { ...states.revision, ...states.comment, ...states.report, ...states.account, ...audit.batchStatuses },
    decision: { ...states.revision, ...states.comment, ...states.report },
  };
  return maps[key]?.[text] ?? text;
};

export default function AuditExplorer() {
  const t = zhCN.communityAdmin.audit;
  const c = zhCN.communityAdmin.command;
  const [fields, setFields] = useState({ q: '', from: '', to: '' });
  const [filter, setFilter] = useState(fields);
  const query = new URLSearchParams(filter);
  const queue = useAdminPage<AdminAuditEntry>(`/api/admin/audit?${query}`, 'audit');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = queue.items.find((item) => item.id === selectedId) ?? null;
  const { queueRef, detailRef } = useAdminTaskFocus(selected?.id ?? null);
  const move = (next: number) => { setSelectedId(null); queue.setPage(next); };
  const stateView = (state: AdminAuditEntry['beforeState']) => state && Object.keys(state).length > 0
    ? <dl className="admin-evidence-list">{Object.entries(state).map(([key, value]) => <div key={key}><dt>{stateKeyLabel(key)}</dt><dd>{stateValueLabel(key, value)}</dd></div>)}</dl>
    : <p className="admin-help">{t.noState}</p>;
  return <div className={`admin-task-layout${selected ? ' is-inspecting' : ''}`}>
    <section className="admin-panel admin-task-queue" ref={queueRef} tabIndex={-1} aria-label={t.queue}>
      <header><h2>{t.queue}</h2><span>{zhCN.communityAdmin.pagination.totalCount(queue.total)}</span></header>
      {/* 搜索与查询同一行、底边对齐；日期区间独占下一整行——队列栏只有 370px 上下，三者塞不进一行。 */}
      <FilterBar submitLabel={t.query} disabled={queue.loading || Boolean(fields.from && fields.to && fields.from > fields.to)} onSubmit={(event) => {
        event.preventDefault(); setSelectedId(null);
        const unchanged = JSON.stringify(fields) === JSON.stringify(filter);
        setFilter({ ...fields });
        // 条件没变时 setFilter 不会触发重新读取（URL 相同），显式刷新一次。
        if (unchanged && queue.page === 1) void queue.reload(); else queue.setPage(1);
      }}>
        <TextField label={t.search} value={fields.q} maxLength={120} onChange={(event) => setFields({ ...fields, q: event.target.value })} />
        <DateRangePicker label={t.range} startLabel={t.from} endLabel={t.to} value={{ start: fields.from, end: fields.to }} onValueChange={({ start, end }) => setFields({ ...fields, from: start, to: end })} className="form-row-wide" />
      </FilterBar>
      <p className="admin-help admin-queue-help">{t.queryHelp}</p>
      <AdminQueueState {...queue} empty={queue.items.length === 0}><ul className="admin-object-list stagger">{queue.items.map((item, index) => <li key={item.id} style={{ '--i': index } as CSSProperties}><button type="button" aria-current={selectedId === item.id} onClick={() => setSelectedId(item.id)}><strong>{actionLabel(item.action)}</strong><span>{formatDate(item.createdAt)} · {zhCN.communityAdmin.states.role[item.actorRole]} · {targetLabel(item.targetType)}</span><small className="mono-id">{item.targetId}</small></button></li>)}</ul></AdminQueueState>
      <AdminPagination page={queue.page} totalPages={queue.totalPages} size={queue.size} total={queue.total}
        onPage={move} onSize={(next) => { setSelectedId(null); queue.setSize(next); }} disabled={queue.loading} />
    </section>
    <section className="admin-panel admin-task-detail" ref={detailRef} tabIndex={-1} aria-label={t.detail}>
      <header><h2>{t.detail}</h2></header>
      {selected ? <div className="admin-form-stack animate-rise"><Button variant="quiet" size="sm" icon="chevron-left" className="admin-back-to-queue" onClick={() => setSelectedId(null)}>{c.back}</Button><h2>{actionLabel(selected.action)}</h2>
        <dl className="admin-evidence-list">
          <div><dt>{t.time}</dt><dd>{formatDate(selected.createdAt)}</dd></div><div><dt>{t.action}</dt><dd>{actionLabel(selected.action)}<br /><code>{selected.action}</code></dd></div>
          <div><dt>{t.target}</dt><dd>{targetLabel(selected.targetType)}<br /><code>{selected.targetId}</code></dd></div><div><dt>{t.role}</dt><dd>{zhCN.communityAdmin.states.role[selected.actorRole]}</dd></div>
          <div><dt>{t.actor}</dt><dd><code>{selected.actorUserId ?? t.anonymized}</code></dd></div><div><dt>{t.request}</dt><dd><code>{selected.requestId}</code></dd></div>
          <div><dt>{t.reason}</dt><dd className="governance-body">{selected.reason}</dd></div>
        </dl><div className="admin-state-pair"><section className="surface-sunken admin-state-box"><h3>{t.before}</h3>{stateView(selected.beforeState)}</section><section className="surface-sunken admin-state-box"><h3>{t.after}</h3>{stateView(selected.afterState)}</section></div><p className="admin-help">{t.readOnly}</p>
      </div> : <AdminEmpty icon="list" title={t.select} />}
    </section>
  </div>;
}
