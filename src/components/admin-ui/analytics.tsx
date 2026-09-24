'use client';

import { SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';
import { Button } from '@/components/ui/button';
import { chipVariants } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select } from '@/components/ui/select';
import { ChartLegend, LineChart, Sparkline, type ChartSeries } from './charts';
import { fmtNum } from './format';

const a = zhCN.adminUi.analytics;
const d = zhCN.communityAdmin.analyticsDashboard;

/** 时间范围芯片（原型 .adm-range）：链接到对应的 start/end，选中深墨。 */
export function RangeChips({ ranges, active }: { ranges: Array<{ key: string; href: string }>; active: string | null }) {
  return (
    <nav aria-label={a.rangeLabel} className="flex gap-2 max-md:w-full max-md:overflow-x-auto">
      {ranges.map((range) => (
        <Link key={range.key} href={range.href} aria-current={active === range.key ? 'page' : undefined}
          className={cn(chipVariants({ selected: active === range.key }), 'focus-visible:focus-ring')}>{a.ranges[range.key as keyof typeof a.ranges]}</Link>
      ))}
    </nav>
  );
}

type Requested = Record<string, string | undefined>;

/** 筛选弹出层：日期、事件名、分类方式、转化路径与组合筛选；提交后按查询串跳转（服务端渲染结果）。 */
export function AnalyticsFilters({ requested, dimension, funnel }: { requested: Requested; dimension: string; funnel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Requested>({ ...requested, dimension, funnel });
  const set = (key: string, value: string) => setValues({ ...values, [key]: value });
  const option = (map: Record<string, string>) => [{ value: '', label: d.all }, ...Object.entries(map).map(([value, label]) => ({ value, label }))];
  const submit = () => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
    setOpen(false);
    router.push(`/admin/analytics?${params}`);
  };
  const active = Object.entries(requested).filter(([key, value]) => value && key !== 'start' && key !== 'end').length;
  return (
    <Popover open={open} onOpenChange={setOpen} sheetTitle={a.filters}>
      <PopoverTrigger render={<Button variant="outline" />}>
        <SlidersHorizontal aria-hidden="true" strokeWidth={1.75} />{a.filters}
        {active ? <span className="inline-grid h-4.5 min-w-4.5 place-items-center rounded-full bg-ink px-1.25 text-caption leading-none font-semibold text-on-ink">{active}</span> : null}
      </PopoverTrigger>
      <PopoverContent wide align="end" aria-label={a.filters}>
        <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <div className="grid grid-cols-2 gap-3">
            <Field label={d.start}><Input type="date" value={values.start ?? ''} onChange={(event) => set('start', event.target.value)} /></Field>
            <Field label={d.end}><Input type="date" value={values.end ?? ''} onChange={(event) => set('end', event.target.value)} /></Field>
            <Field label={d.eventName} className="col-span-2"><Input value={values.eventName ?? ''} maxLength={80} placeholder={d.eventExample} onChange={(event) => set('eventName', event.target.value)} /></Field>
            <div className="grid gap-1.5"><span className="text-footnote font-medium text-ink">{d.dimension}</span><Select label={d.dimension} value={values.dimension ?? dimension} onValueChange={(value) => set('dimension', value)} options={Object.entries(d.dimensions).map(([value, label]) => ({ value, label }))} /></div>
            <div className="grid gap-1.5"><span className="text-footnote font-medium text-ink">{d.funnel}</span><Select label={d.funnel} value={values.funnel ?? funnel} onValueChange={(value) => set('funnel', value)} options={Object.entries(d.funnelNames).map(([value, label]) => ({ value, label }))} /></div>
            {([['device', d.device, d.devices], ['browser', d.browser, d.browsers], ['os', d.os, d.systems], ['actor', d.actor, d.actors]] as const).map(([key, label, map]) => (
              <div key={key} className="grid gap-1.5"><span className="text-footnote font-medium text-ink">{label}</span><Select label={label} value={values[key] ?? ''} onValueChange={(value) => set(key, value)} options={option(map)} /></div>
            ))}
          </div>
          <p className="text-caption font-normal text-ink-3">{d.advancedHint}</p>
          <div className="flex justify-end gap-2">
            <Button nativeButton={false} render={<Link href="/admin/analytics" onClick={() => setOpen(false)} />}>{a.reset}</Button>
            <Button type="submit" variant="primary">{a.apply}</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export function Kpi({ label, value, spark, note }: { label: string; value: number | null; spark: number[]; note: string }) {
  return (
    <div className="grid min-w-0 gap-1.5 rounded-lg border border-line bg-bg py-4 pr-4 pl-5 max-md:p-3.5 max-md:pb-3">
      <span className="text-body-sm font-medium whitespace-nowrap text-ink-2">{label}</span>
      <span className="flex min-h-9 items-center justify-between gap-3"><b className="text-title-1 text-ink tabular-nums">{value === null ? d.emptyValue : fmtNum(value)}</b><Sparkline values={spark} className="max-md:w-14" /></span>
      <span className="text-caption font-normal text-ink-3">{note}</span>
    </div>
  );
}

export function TrendChart({ points }: { points: Array<{ day: string; events: number; uniqueVisitors: number | null }> }) {
  if (!points.length) return <p className="px-5 py-4 text-body-sm text-ink-3">{a.noData}</p>;
  const series: ChartSeries[] = [
    { label: a.series.visitors, tone: 'ink', values: points.map((point) => point.uniqueVisitors ?? 0) },
    { label: a.series.events, tone: 'chart-2', values: points.map((point) => point.events) },
  ];
  const days = points.map((point) => { const [, month, day] = point.day.split('-').map(Number); return { short: `${month}/${day}`, long: `${month}月${day}日` }; });
  return (
    <>
      <ChartLegend series={series} />
      <div className="flex min-h-55 flex-1 px-5 py-4 max-md:px-4 max-md:py-3"><LineChart days={days} series={series} label={a.trendLabel} /></div>
    </>
  );
}

/** 横向条形列表（转化路径、分类统计）。 */
export function BarList({ rows, showRate }: { rows: Array<{ label: string; value: number; rate?: number | null }>; showRate?: boolean }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <ol className="grid gap-3.5 px-5 pt-4 pb-5 max-md:px-4">
      {rows.map((row) => (
        <li key={row.label} className={cn('grid items-center gap-3 text-body-sm text-ink-2', showRate ? 'grid-cols-[88px_minmax(0,1fr)_56px_44px]' : 'grid-cols-[88px_minmax(0,1fr)_56px]', 'max-md:gap-2')}>
          <span className="truncate">{row.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-bg-muted"><i className="block h-full rounded-full bg-ink" style={{ width: `${(row.value / max) * 100}%` }} /></span>
          <b className="text-right font-semibold text-ink tabular-nums">{fmtNum(row.value)}</b>
          {showRate ? <span className="text-right text-ink-3 tabular-nums">{row.rate === null || row.rate === undefined ? '—' : `${Math.round(row.rate * 100)}%`}</span> : null}
        </li>
      ))}
    </ol>
  );
}
