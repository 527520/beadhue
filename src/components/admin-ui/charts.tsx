'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

/** 固定像素尺寸的迷你折线：不拉伸，线宽与圆点不变形。 */
export function Sparkline({ values, width = 88, height = 32, className }: { values: number[]; width?: number; height?: number; className?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pad = 3;
  const points = values.map((value, index) => [
    pad + (index / (values.length - 1)) * (width - pad * 2),
    pad + (1 - (value - min) / span) * (height - pad * 2),
  ] as const);
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `M${points[0][0].toFixed(1)},${height} ${points.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} L${points.at(-1)![0].toFixed(1)},${height} Z`;
  const [lx, ly] = points.at(-1)!;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false" className={cn('shrink-0 text-ink-2', className)}>
      <path d={area} className="fill-current opacity-8" />
      <polyline points={line} className="fill-none stroke-current" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx.toFixed(1)} cy={ly.toFixed(1)} r={2.5} className="fill-current" />
    </svg>
  );
}

/** 坐标轴：3 或 4 段，每段 1 / 2 / 2.5 / 5 × 10ⁿ，取顶端最贴近数据的一种。 */
export function niceScale(value: number): { count: number; step: number; max: number } {
  const niceStep = (raw: number) => {
    const base = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 2.5, 5, 10].map((m) => m * base).find((step) => step >= raw)!;
  };
  return [3, 4].map((count) => ({ count, step: niceStep(Math.max(value, 1) / count) }))
    .map((scale) => ({ ...scale, max: scale.step * scale.count }))
    .sort((a, b) => a.max - b.max)[0];
}

export type SeriesTone = 'ink' | 'chart-2' | 'chart-3';
export interface ChartSeries { label: string; tone: SeriesTone; values: number[] }
const STROKE: Record<SeriesTone, string> = { ink: 'stroke-ink', 'chart-2': 'stroke-chart-2', 'chart-3': 'stroke-chart-3' };
export const DOT: Record<SeriesTone, string> = { ink: 'bg-ink', 'chart-2': 'bg-chart-2', 'chart-3': 'bg-chart-3' };

/**
 * 多日折线：SVG 只画网格与折线（拉伸 + 不缩放描边），
 * 圆点、坐标文字、悬停列用 HTML 按百分比定位，任何宽度下都清晰；每列可聚焦，读屏读出当日数值。
 */
export function LineChart({ days, series, label }: { days: Array<{ short: string; long: string }>; series: ChartSeries[]; label: string }) {
  const [active, setActive] = useState<number | null>(null);
  const scale = niceScale(Math.max(0, ...series.flatMap((item) => item.values)));
  const ticks = Array.from({ length: scale.count + 1 }, (_, index) => scale.step * index);
  const n = days.length;
  const W = 600;
  const H = 240;
  const xp = (index: number) => (n <= 1 ? 50 : (index / (n - 1)) * 100);
  const yp = (value: number) => (1 - value / scale.max) * 100;
  return (
    <div role="group" aria-label={label} className="grid min-w-0 flex-1 grid-cols-[36px_minmax(0,1fr)] grid-rows-[minmax(160px,1fr)_28px] gap-x-2" onPointerLeave={() => setActive(null)}>
      <div aria-hidden="true" className="relative text-caption font-normal text-ink-4 tabular-nums">
        {ticks.map((tick) => <span key={tick} className="absolute right-0 -translate-y-1/2" style={{ top: `${yp(tick)}%` }}>{tick}</span>)}
      </div>
      <div className="relative mx-2.5">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false" className="absolute inset-0 size-full overflow-visible">
          {ticks.map((tick) => <line key={tick} x1={0} x2={W} y1={(yp(tick) / 100) * H} y2={(yp(tick) / 100) * H} className="stroke-line" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
          {series.map((item) => (
            <polyline key={item.label} className={cn('fill-none', STROKE[item.tone])} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"
              points={item.values.map((value, index) => `${((xp(index) / 100) * W).toFixed(1)},${((yp(value) / 100) * H).toFixed(1)}`).join(' ')} />
          ))}
        </svg>
        {active !== null ? <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-px bg-line-strong" style={{ left: `${xp(active)}%` }} /> : null}
        {series.map((item) => item.values.map((value, index) => (
          <i key={`${item.label}-${index}`} aria-hidden="true"
            className={cn('pointer-events-none absolute -mt-1 -ml-1 size-2 rounded-full ring-2 ring-bg transition-transform duration-state', DOT[item.tone], active === index && 'scale-140')}
            style={{ left: `${xp(index)}%`, top: `${yp(value)}%` }} />
        )))}
        {days.map((day, index) => {
          const left = Math.max(0, xp(index - 0.5));
          const right = Math.min(100, xp(index + 0.5));
          return (
            <button key={day.long} type="button" className="absolute inset-y-0 z-1 rounded-sm focus-visible:focus-ring"
              style={{ left: `${left}%`, width: `${right - left}%` }}
              aria-label={`${day.long}：${series.map((item) => `${item.label} ${item.values[index]}`).join('，')}`}
              onPointerOver={() => setActive(index)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} />
          );
        })}
        {active !== null ? (
          <div aria-hidden="true" className={cn('pointer-events-none absolute top-0 z-2 ml-3 grid min-w-33 gap-1 rounded-md bg-bg px-3 py-2.5 text-caption font-normal whitespace-nowrap text-ink-2 shadow-float ring-1 ring-line', active > (n - 1) / 2 && '-translate-x-[calc(100%+24px)]')}
            style={{ left: `${xp(active)}%` }}>
            <b className="font-semibold text-ink">{days[active].long}</b>
            {series.map((item) => (
              <span key={item.label} className="flex items-center gap-1.5"><i className={cn('size-2 rounded-full', DOT[item.tone])} />{item.label}<b className="ml-auto pl-3 font-semibold text-ink tabular-nums">{item.values[active]}</b></span>
            ))}
          </div>
        ) : null}
      </div>
      <div aria-hidden="true" className="relative col-start-2 mx-2.5 text-caption font-normal text-ink-3">
        {days.map((day, index) => <span key={day.long} className="absolute top-2 -translate-x-1/2 whitespace-nowrap" style={{ left: `${xp(index)}%` }}>{day.short}</span>)}
      </div>
    </div>
  );
}

/** 图例：色点 + 名称 + 合计。 */
export function ChartLegend({ series, showTotal = true }: { series: ChartSeries[]; showTotal?: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 px-5 pt-3.5 text-body-sm text-ink-2 max-md:px-4 max-md:pt-3">
      {series.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <i className={cn('size-2.5 rounded-full', DOT[item.tone])} />{item.label}
          {showTotal ? <b className="ml-0.5 font-semibold text-ink tabular-nums">{item.values.reduce((sum, value) => sum + value, 0).toLocaleString('en-US')}</b> : null}
        </span>
      ))}
    </div>
  );
}
