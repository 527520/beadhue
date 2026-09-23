import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** 键盘按键提示（搜索框的「/」、菜单项的快捷键）。 */
export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'inline-grid h-5.5 min-w-5.5 place-items-center rounded-kbd px-1.5 font-sans text-caption leading-none font-medium text-ink-3 inset-ring-1 inset-ring-line-strong',
        className,
      )}
      {...props}
    />
  );
}
