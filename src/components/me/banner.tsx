import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * 页内提示横幅（原型 .me-banner）：浅灰底（提示）/ 暖黄底（警告）、图标 + 一句话 + 右侧一个动作。
 * 手机上折行；wideAction 时动作独占一行并与正文对齐。
 */
export function Banner({ tone = 'neutral', icon, action, wideAction, role, children }: { tone?: 'neutral' | 'warning'; icon: ReactNode; action?: ReactNode; wideAction?: boolean; role?: 'status' | 'alert'; children: ReactNode }) {
  return (
    <div
      role={role}
      data-slot="me-banner"
      className={cn(
        'mb-5 flex items-center gap-3 rounded-lg py-3 pr-3 pl-4 text-body-sm text-ink-2 max-md:mb-4 max-md:flex-wrap max-md:gap-x-3 max-md:gap-y-2 [&>svg]:size-5 [&>svg]:shrink-0',
        tone === 'warning' ? 'bg-warning-soft [&>svg]:text-warning' : 'bg-bg-subtle [&>svg]:text-ink-3',
        wideAction && 'max-md:items-start',
      )}
    >
      {icon}
      <div className="min-w-0 flex-1">{children}</div>
      {action ? <div className={cn('flex shrink-0 items-center gap-2', wideAction && 'max-md:basis-full max-md:pl-8')}>{action}</div> : null}
    </div>
  );
}
