'use client';

import { Progress as BaseProgress } from '@base-ui/react/progress';
import { cn } from '@/lib/cn';

export interface ProgressProps {
  /** 0–100 */
  value: number;
  label: string;
  /** 显示标签与百分比（原型样式）；false 时只给可访问名称。 */
  showLabel?: boolean;
  className?: string;
}

/** 6px 深墨进度条（跟拼进度、原图空间、批次进度），旁边写出百分比。 */
export function Progress({ value, label, showLabel = true, className }: ProgressProps) {
  return (
    <BaseProgress.Root data-slot="progress" value={value} aria-label={label} className={cn('grid gap-2', className)}>
      {showLabel ? (
        <span className="flex justify-between text-caption font-normal text-ink-3">
          <BaseProgress.Label>{label}</BaseProgress.Label>
          <BaseProgress.Value className="tabular-nums">{(_, number) => `${Math.round(number ?? 0)}%`}</BaseProgress.Value>
        </span>
      ) : null}
      <BaseProgress.Track className="h-1.5 overflow-hidden rounded-full bg-bg-muted">
        <BaseProgress.Indicator className="block h-full rounded-full bg-ink transition-[width] duration-state ease-standard" />
      </BaseProgress.Track>
    </BaseProgress.Root>
  );
}
