'use client';

import { X } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';

/** 芯片：胶囊高 32；默认 --bg-muted，选中深墨底白字；可带计数；可移除芯片带 ×。 */
export const chipVariants = cva(
  [
    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-footnote leading-none font-medium whitespace-nowrap text-ink',
    'transition-colors duration-state ease-standard focus-visible:focus-ring [&>svg]:size-4 [&>svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        default: 'bg-bg-muted hover:bg-bg-emphasis',
        outline: 'bg-bg inset-ring-1 inset-ring-line-strong hover:inset-ring-ink',
      },
      selected: {
        true: 'bg-ink text-on-ink hover:bg-ink [&_[data-slot=chip-count]]:text-on-ink/70',
        false: '',
      },
    },
    defaultVariants: { variant: 'default', selected: false },
  },
);

type ChipBase = VariantProps<typeof chipVariants> & { count?: number; icon?: ReactNode };

export type ChipProps = Omit<ComponentProps<'button'>, 'children'> & ChipBase & { children: ReactNode };

/** 可点的芯片（筛选、类目、快捷搜索）；selected 同步到 aria-pressed。 */
export function Chip({ className, variant, selected = false, count, icon, children, type, ...props }: ChipProps) {
  return (
    <button
      data-slot="chip"
      type={type ?? 'button'}
      aria-pressed={selected ?? undefined}
      className={cn(chipVariants({ variant, selected }), className)}
      {...props}
    >
      {icon}
      {children}
      {count !== undefined ? <ChipCount value={count} /> : null}
    </button>
  );
}

function ChipCount({ value }: { value: number }) {
  return (
    <span data-slot="chip-count" className="text-ink-3 tabular-nums">
      {value}
    </span>
  );
}

export type RemovableChipProps = Omit<ComponentProps<'span'>, 'children'> &
  ChipBase & {
    children: string;
    onRemove: () => void;
    /** 移除按钮的可访问名称，默认「移除：<文字>」。 */
    removeLabel?: string;
  };

/** 已选条件芯片：文字 + 右侧 × 按钮。 */
export function RemovableChip({ className, variant, selected = false, count, icon, children, onRemove, removeLabel, ...props }: RemovableChipProps) {
  return (
    <span data-slot="chip" className={cn(chipVariants({ variant, selected }), className)} {...props}>
      {icon}
      {children}
      {count !== undefined ? <ChipCount value={count} /> : null}
      <button
        type="button"
        data-slot="chip-remove"
        aria-label={removeLabel ?? zhCN.ui.removeChip(children)}
        onClick={onRemove}
        className={cn(
          '-mr-1.5 grid size-4.5 place-items-center rounded-full focus-visible:focus-ring [&>svg]:size-4',
          selected ? 'hover:bg-on-ink/18' : 'hover:bg-ink/8',
        )}
      >
        <X aria-hidden="true" strokeWidth={1.75} />
      </button>
    </span>
  );
}
