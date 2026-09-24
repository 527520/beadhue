import { forbidden } from 'next/navigation';
import { getDb } from '@/lib/auth/db';
import { authorize } from '@/lib/auth/authorization';
import { getSessionActor } from '@/lib/auth/session';
import { queryAnalyticsDimensions, queryAnalyticsFunnel, queryAnalyticsSummary, queryAnalyticsTrend } from '@/lib/analytics/reports';
import { resolveDashboardQuery, type DashboardSearchParams } from '@/lib/analytics/dashboardQuery';
import { zhCN } from '@/messages/zh-CN';
import { AdminPageHead } from '@/components/admin-ui/page-head';
import { AdminCard, CardHead } from '@/components/admin-ui/parts';
import { AnalyticsFilters, BarList, Kpi, RangeChips, TrendChart } from '@/components/admin-ui/analytics';

type Dashboard = typeof zhCN.communityAdmin.analyticsDashboard;
function dimensionValueLabel(t: Dashboard, dimension: string, value: string): string {
  const maps: Record<string, Record<string, string>> = { device: t.devices, browser: t.browsers, os: t.systems, actor: t.actors, event: t.steps };
  return maps[dimension]?.[value] ?? value;
}
const shanghaiDay = (time: number) => new Date(time + 8 * 3600000).toISOString().slice(0, 10);
const noteClass = 'rounded-md border border-line bg-bg px-3 py-2.5 text-body-sm text-ink-2';

/** 匿名分析（原型 admin/ops.js analyticsSection）：范围芯片、四张指标卡、每日趋势、转化路径、分类统计；数据来自同意统计的访客。 */
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const actor = await getSessionActor();
  if (!authorize(actor, 'analytics:read')) forbidden();
  const now = new Date();
  const params = await searchParams;
  const { requested, query, dimension, funnel, invalid, filtersIgnored } = resolveDashboardQuery(params, now);
  const db = getDb();
  const [summary, trend, breakdown, funnelResult] = await Promise.all([
    queryAnalyticsSummary(db, query, now), queryAnalyticsTrend(db, query, now),
    queryAnalyticsDimensions(db, query, dimension, now), queryAnalyticsFunnel(db, query, funnel, now),
  ]);
  const t = zhCN.communityAdmin.analyticsDashboard;
  const a = zhCN.adminUi.analytics;
  const today = shanghaiDay(now.getTime());
  const ranges = (['7', '30', '90'] as const).map((key) => ({ key, href: `/admin/analytics?start=${shanghaiDay(now.getTime() - (Number(key) - 1) * 86400000)}&end=${today}` }));
  const days = Math.round((Date.parse(query.end) - Date.parse(query.start)) / 86400000) + 1;
  const active = query.end === today && ['7', '30', '90'].includes(String(days)) ? String(days) : null;
  const points = trend.points.map((point) => ({ day: point.day, events: point.events, uniqueVisitors: point.uniqueVisitors ?? null }));
  const steps = funnelResult.steps ?? [];
  const note = active ? a.ranges[active as keyof typeof a.ranges] : a.rangeNote(query.start, query.end);
  const requestedStrings = Object.fromEntries(Object.entries(requested).map(([key, value]) => [key, value === undefined ? undefined : String(value)]));
  return (
    <>
      <AdminPageHead section="analytics" actions={<div className="flex min-w-0 items-center gap-2"><RangeChips ranges={ranges} active={active} /><AnalyticsFilters requested={requestedStrings} dimension={dimension} funnel={funnel} /></div>} />
      {invalid ? <p role="alert" className="rounded-md bg-warning-soft px-3 py-2.5 text-body-sm text-warning">{t.invalidQuery}</p> : null}
      <p className={noteClass}>{summary.capability.mode === 'exact' ? t.exactMode : t.aggregateMode}{summary.capability.mode === 'aggregate' ? ` ${t.rollupFreshness}` : ''}</p>
      {filtersIgnored ? <p className={noteClass}>{t.ignoredFilters}</p> : null}
      <div className="grid grid-cols-12 gap-5 max-lg:gap-4 max-md:gap-3">
        <div className="col-span-full grid grid-cols-4 gap-5 max-lg:grid-cols-2 max-lg:gap-4 max-md:gap-3">
          <Kpi label={a.kpis.visitors} value={summary.totals.uniqueVisitors ?? null} spark={points.map((point) => point.uniqueVisitors ?? 0)} note={note} />
          <Kpi label={a.kpis.sessions} value={summary.totals.sessions ?? null} spark={[]} note={note} />
          <Kpi label={a.kpis.events} value={summary.totals.events} spark={points.map((point) => point.events)} note={note} />
          <Kpi label={a.kpis.converted} value={steps.at(-1)?.sessions ?? null} spark={steps.map((step) => step.sessions)} note={t.funnelNames[funnel]} />
        </div>
        <AdminCard className="col-span-full flex flex-col xl:col-span-7">
          <CardHead title={a.trend} aside={note} />
          <TrendChart points={points} />
        </AdminCard>
        <AdminCard className="col-span-full flex flex-col xl:col-span-5">
          <CardHead title={a.funnel} aside={t.funnelNames[funnel]} />
          {funnelResult.steps
            ? <BarList showRate rows={funnelResult.steps.map((step) => ({ label: t.steps[step.name as keyof typeof t.steps] ?? step.name, value: step.sessions, rate: step.conversionFromPrevious }))} />
            : <p className="px-5 py-4 text-body-sm text-ink-3">{funnelResult.unavailableReason}</p>}
          <p className="mt-auto border-t border-line px-5 py-3 text-caption font-normal text-ink-3">{t.funnelHelp}</p>
        </AdminCard>
        <AdminCard className="col-span-full flex flex-col">
          <CardHead title={a.dimension} aside={t.dimensions[dimension as keyof typeof t.dimensions]} />
          {breakdown.values.length
            ? <BarList rows={breakdown.values.map((row) => ({ label: dimensionValueLabel(t, dimension, row.value), value: row.events }))} />
            : <p className="px-5 py-4 text-body-sm text-ink-3">{t.noDimension}</p>}
          <p className="border-t border-line px-5 py-3 text-caption font-normal text-ink-3">{t.footnote}</p>
        </AdminCard>
      </div>
    </>
  );
}
