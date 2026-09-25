import { cn } from '@/lib/cn';

const CIRCUMFERENCE = 2 * Math.PI * 6;

/** 跟拼进度环：14px，浅灰轨道 + 深墨进度，从 12 点方向顺时针走。装饰性，百分比写在旁边。 */
export function ProgressRing({ percent, className }: { percent: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={cn('size-3.5 shrink-0 -rotate-90', className)}>
      <circle cx="8" cy="8" r="6" fill="none" strokeWidth="2.4" className="stroke-line-strong" />
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE.toFixed(2)}
        strokeDashoffset={(CIRCUMFERENCE * (1 - clamped / 100)).toFixed(2)}
        className="stroke-ink"
      />
    </svg>
  );
}
