import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** 骨架：与真实内容同尺寸的灰块，全站唯一允许循环的动效（减少动态时静止）。 */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        'relative overflow-hidden rounded-md bg-bg-muted',
        'after:absolute after:inset-0 after:animate-shimmer after:bg-linear-to-r after:from-transparent after:via-bg/60 after:to-transparent after:content-[""] motion-reduce:after:hidden',
        className,
      )}
      {...props}
    />
  );
}
