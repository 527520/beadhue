'use client';

import { ArrowUpRight, ChevronRight, Cloud, Database, Flag, Inbox, Mail, MessageCircle, MessagesSquare, ShieldCheck, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { AdminOverview } from '@/lib/admin/overview';
import type { ServiceStatusItem } from '@/lib/admin/serviceStatus';
import type { TrendDay } from '@/lib/admin/trends';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AdminCard, CardHead, IconTile, Thumb } from './parts';
import { ChartLegend, LineChart, Sparkline, type ChartSeries } from './charts';
import { fmtAgo, fmtNum } from './format';

const t = zhCN.adminUi.overview;
const risk = zhCN.communityAdmin.states.risk;

export type TodoItem =
  | { kind: 'review'; id: string; at: string | null; title: string; revisionId: string; revisionNumber: number; who: string; href: string }
  | { kind: 'comment'; id: string; at: string; title: string; status: string; who: string; href: string }
  | { kind: 'report'; id: string; at: string; title: string; target: string; href: string };

function Delta({ now, before, unit = '', backlog = true }: { now: number; before: number; unit?: string; backlog?: boolean }) {
  const diff = now - before;
  if (!diff) return <span className="text-caption font-normal whitespace-nowrap text-ink-3">{t.flat}</span>;
  const tone = !backlog ? 'text-ink-3' : diff < 0 ? 'text-success' : 'text-warning';
  return (
    <span className={cn('inline-flex items-center gap-1 text-caption font-normal whitespace-nowrap', tone)} title={t.deltaHelp}>
      <ArrowUpRight aria-hidden="true" strokeWidth={1.75} className={cn('size-4', diff < 0 && 'rotate-90')} />
      {t.vsYesterday} <span className="tabular-nums">{diff > 0 ? '+' : '−'}{Math.abs(diff)}{unit}</span>
    </span>
  );
}

function Metric({ href, icon: Icon, label, value, spark, delta }: { href: string; icon: LucideIcon; label: string; value: ReactNode; spark: number[]; delta: ReactNode }) {
  return (
    <Link href={href} className="grid min-w-0 gap-1.5 rounded-lg border border-line bg-bg py-4 pr-4 pl-5 transition-[border-color,box-shadow] duration-state ease-standard hover:border-line-strong hover:shadow-float focus-visible:focus-ring max-md:p-3.5 max-md:pb-3">
      <span className="flex min-w-0 items-center gap-1.5 text-body-sm font-medium whitespace-nowrap text-ink-2">
        <Icon aria-hidden="true" strokeWidth={1.75} className="size-4 shrink-0 text-ink-3 max-md:hidden" /><span className="min-w-0 truncate">{label}</span>
        <ChevronRight aria-hidden="true" strokeWidth={1.75} className="ml-auto size-4 shrink-0 text-ink-4" />
      </span>
      <span className="flex min-h-9 min-w-0 items-center justify-between gap-3">{value}<Sparkline values={spark} className="w-14 xl:w-22" /></span>
      {delta}
    </Link>
  );
}

const SERVICE_ICON: Record<ServiceStatusItem['id'], LucideIcon> = { database: Database, storage: Cloud, moderation: ShieldCheck, mail: Mail };
const STATE_TONE = { ok: 'success', degraded: 'warning', off: 'neutral' } as const;

export function serviceDetail(item: ServiceStatusItem): { detail: string; reason: string | null } {
  const s = zhCN.adminUi.services;
  const reason = item.detail.reason ? (item.detail.reason === 'errors' ? s.reasons.errors(item.detail.failures ?? 0) : s.reasons[item.detail.reason]) : null;
  switch (item.id) {
    case 'database': return { detail: s.latency(item.detail.latencyMs ?? 0), reason: null };
    case 'storage': return { detail: item.state === 'ok' ? s.cos : s.local, reason: null };
    case 'moderation': return { detail: s.calls(item.detail.calls ?? 0), reason };
    default: return { detail: s.adapters[item.detail.adapter ?? 'fake'] ?? item.detail.adapter ?? '', reason: item.detail.reason === 'fake' ? null : reason };
  }
}

/** 服务列表（总览与系统信息共用）。 */
export function ServiceList({ services }: { services: ServiceStatusItem[] }) {
  const s = zhCN.adminUi.services;
  return (
    <ul role="list" className="grid">
      {services.map((item) => {
        const Icon = SERVICE_ICON[item.id];
        const { detail, reason } = serviceDetail(item);
        return (
          <li key={item.id} className="flex items-start gap-3 border-b border-line px-5 py-3 max-md:px-4">
            <IconTile size="sm" className={cn(item.state === 'degraded' && 'bg-warning-soft text-warning')}><Icon strokeWidth={1.75} /></IconTile>
            <span className="grid min-w-0 flex-1">
              <b className="text-body-sm font-semibold text-ink">{s.names[item.id]}</b>
              <span className="text-caption font-normal text-ink-3">{detail}</span>
              {reason ? <span className={cn('mt-1 text-caption font-normal', item.state === 'degraded' ? 'text-warning' : 'text-ink-3')}>{reason}</span> : null}
            </span>
            <Badge tone={STATE_TONE[item.state]} dot className="mt-1.75">{s.states[item.state]}</Badge>
          </li>
        );
      })}
    </ul>
  );
}

export function QuotaBar({ calls, budget }: { calls: number; budget: number }) {
  const percent = budget > 0 ? Math.min(100, (calls / budget) * 100) : 0;
  return (
    <div className="grid gap-2">
      <div className="flex justify-between gap-3 text-caption font-normal text-ink-3">
        <span>{t.quota}</span><span className="tabular-nums"><b className="font-semibold text-ink">{calls}</b> / {fmtNum(budget)}</span>
      </div>
      <div role="progressbar" aria-label={t.quota} aria-valuemin={0} aria-valuemax={budget} aria-valuenow={calls} className="h-1.5 overflow-hidden rounded-full bg-bg-muted">
        <i className="block h-full rounded-full bg-ink" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function trendDays(items: TrendDay[]) {
  return items.map((item, index) => {
    const [, month, day] = item.date.split('-').map(Number);
    return { short: index === items.length - 1 ? '今天' : `${month}/${day}`, long: `${month}月${day}日` };
  });
}

function TodoRow({ item }: { item: TodoItem }) {
  const lead = item.kind === 'review' ? <Thumb revisionId={item.revisionId} /> : <IconTile>{item.kind === 'comment' ? <MessageCircle strokeWidth={1.75} /> : <Flag strokeWidth={1.75} />}</IconTile>;
  const title = item.kind === 'review' ? item.title : item.kind === 'comment' ? `“${item.title}”`
    : item.target === 'work' ? t.reportedWork(risk[item.title as keyof typeof risk] ?? item.title) : t.reportedComment(risk[item.title as keyof typeof risk] ?? item.title);
  const badge = item.kind === 'review'
    ? <Badge tone="info">{item.revisionNumber > 1 ? `${t.kinds.review} · R${item.revisionNumber}` : t.kinds.review}</Badge>
    : item.kind === 'comment'
      ? <Badge tone={item.status === 'rejected' ? 'danger' : 'warning'}>{`${t.kinds.comment} · ${item.status === 'rejected' ? zhCN.communityAdmin.states.comment.rejected : zhCN.adminUi.comments.verdicts.review}`}</Badge>
      : <Badge tone="danger">{t.kinds.report}</Badge>;
  const meta = item.kind === 'report' ? t.reportedBy(fmtAgo(item.at)) : `${item.who} · ${fmtAgo(item.at)}`;
  return (
    <li className="flex min-h-17 items-center gap-3 border-b border-line py-2.5 pr-3 pl-5 max-md:pr-2 max-md:pl-4">
      {lead}
      <span className="grid min-w-0 flex-1 gap-1">
        <span className="truncate text-body-sm font-medium text-ink">{title}</span>
        <span className="flex min-w-0 items-center gap-2 text-caption font-normal text-ink-3">{badge}<span className="truncate">{meta}</span></span>
      </span>
      <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={item.href} />} aria-label={t.handleLabel(title)}>{t.handle}</Button>
    </li>
  );
}

export function OverviewView({ counts, trends, todo, todoTotal, services, moderation, updatedAt }: {
  counts: AdminOverview; trends: TrendDay[]; todo: TodoItem[]; todoTotal: number;
  services: ServiceStatusItem[] | null; moderation: { calls: number; budget: number } | null; updatedAt: string;
}) {
  const days = trendDays(trends);
  const pick = (key: keyof Omit<TrendDay, 'date'>) => trends.map((item) => item[key]);
  const series: ChartSeries[] = [
    { label: t.series.submissions, tone: 'ink', values: pick('submissions') },
    { label: t.series.likes, tone: 'chart-2', values: pick('likes') },
    { label: t.series.newUsers, tone: 'chart-3', values: pick('newUsers') },
  ];
  const last = (values: number[]) => [values.at(-1) ?? 0, values.at(-2) ?? 0] as const;
  const value = (n: number) => <b className="text-title-1 text-ink tabular-nums">{n}</b>;
  const moderationSpark = pick('moderationCalls');
  const time = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(updatedAt));
  const withSystem = Boolean(services);
  const moderationState = services?.find((item) => item.id === 'moderation')?.state ?? (counts.moderationDegraded ? 'degraded' : 'ok');
  return (
    <div className="grid flex-1 grid-cols-12 gap-5 max-lg:gap-4 max-md:gap-3">
      <div className="col-span-full grid grid-cols-4 gap-5 max-lg:grid-cols-2 max-lg:gap-4 max-md:gap-3">
        <Metric href="/admin/reviews" icon={Inbox} label={t.metrics.reviews} value={value(counts.pendingRevisions)} spark={pick('submissions')}
          delta={<Delta now={last(pick('submissions'))[0]} before={last(pick('submissions'))[1]} />} />
        <Metric href="/admin/comments" icon={MessagesSquare} label={t.metrics.comments} value={value(counts.pendingComments)} spark={pick('comments')}
          delta={<Delta now={last(pick('comments'))[0]} before={last(pick('comments'))[1]} />} />
        <Metric href="/admin/reports" icon={Flag} label={t.metrics.reports} value={value(counts.openReports)} spark={pick('reports')}
          delta={<Delta now={last(pick('reports'))[0]} before={last(pick('reports'))[1]} />} />
        <Metric href={withSystem ? '/admin/system' : '/admin/comments'} icon={ShieldCheck} label={t.metrics.moderation}
          value={<span className="grid justify-items-start gap-0.5 whitespace-nowrap">
            <Badge tone={STATE_TONE[moderationState]} dot>{zhCN.adminUi.services.states[moderationState]}</Badge>
            <span className="text-body-sm text-ink-3 tabular-nums">{t.todayCalls(moderation?.calls ?? moderationSpark.at(-1) ?? 0)}</span>
          </span>}
          spark={moderationSpark}
          delta={<Delta now={last(moderationSpark)[0]} before={last(moderationSpark)[1]} unit={t.callsUnit} backlog={false} />} />
      </div>
      <AdminCard aria-labelledby="adm-todo-title" className={cn('col-span-full flex flex-col', withSystem ? 'xl:col-span-5' : 'xl:col-span-7', withSystem && 'lg:max-xl:col-span-7')}>
        <CardHead id="adm-todo-title" title={t.todo} aside={t.todoTotal(todoTotal)} />
        {todo.length ? <ul role="list" className="grid">{todo.map((item) => <TodoRow key={`${item.kind}-${item.id}`} item={item} />)}</ul>
          : <p className="px-5 py-4 text-body-sm text-ink-3">{t.allClear}</p>}
        <footer className="mt-auto grid grid-cols-3">
          {([['/admin/reviews', t.queues.reviews, counts.pendingRevisions], ['/admin/comments', t.queues.comments, counts.pendingComments], ['/admin/reports', t.queues.reports, counts.openReports]] as const).map(([href, label, count], index) => (
            <Link key={href} href={href} className={cn('flex items-center justify-between gap-2 px-5 py-3.5 text-body-sm whitespace-nowrap text-ink-2 hover:bg-bg-subtle hover:text-ink focus-visible:focus-ring max-md:flex-col max-md:items-start max-md:gap-0.5 max-md:px-4 max-md:py-3',
              index > 0 && 'border-l border-line', index === 0 && 'rounded-bl-lg', index === 2 && 'rounded-br-lg')}>
              {label}<b className="font-semibold text-ink tabular-nums">{count}</b>
            </Link>
          ))}
        </footer>
      </AdminCard>
      <AdminCard aria-labelledby="adm-trend-title" className={cn('col-span-full flex flex-col', withSystem ? 'lg:max-xl:order-last xl:col-span-4' : 'xl:col-span-5')}>
        <CardHead id="adm-trend-title" title={t.trend} aside={<span className="tabular-nums">{t.trendRange(days[0]?.long ?? '')}</span>} />
        <ChartLegend series={series} />
        <div className="flex min-h-55 flex-1 px-5 py-4 max-md:px-4 max-md:py-3"><LineChart days={days} series={series} label={t.trendLabel} /></div>
      </AdminCard>
      {services ? (
        <AdminCard aria-labelledby="adm-svc-title" className="col-span-full flex flex-col lg:max-xl:col-span-5 xl:col-span-3">
          <CardHead id="adm-svc-title" title={t.services} aside={t.updatedAt(time)} />
          <ServiceList services={services} />
          <footer className="mt-auto grid gap-3 px-5 pt-3 pb-4 max-md:px-4">
            {moderation ? <QuotaBar calls={moderation.calls} budget={moderation.budget} /> : null}
            <Link href="/admin/system" className="text-body-sm font-medium text-accent hover:underline hover:underline-offset-3 focus-visible:focus-ring">{t.openSystem}</Link>
          </footer>
        </AdminCard>
      ) : null}
    </div>
  );
}
