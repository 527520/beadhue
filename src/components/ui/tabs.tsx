'use client';

import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import { ToggleGroup as BaseToggleGroup } from '@base-ui/react/toggle-group';
import { Toggle as BaseToggle } from '@base-ui/react/toggle';
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** 页签：文字 + 2px 深墨下划线；页面级 44 高、面板内小号 40 高。 */
const tabListClass = 'flex overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';
const tabClass = cn(
  'relative inline-flex shrink-0 items-center gap-1.5 leading-none font-medium whitespace-nowrap text-ink-3 transition-colors duration-state ease-standard hover:text-ink',
  'focus-visible:focus-ring aria-selected:font-semibold aria-selected:text-ink aria-[current=page]:font-semibold aria-[current=page]:text-ink',
  'after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent after:content-[""]',
  'aria-selected:after:bg-ink aria-[current=page]:after:bg-ink',
);
const tabSize = { md: 'h-11 text-body', sm: 'h-10 text-body-sm' } as const;
const listGap = { md: 'gap-7', sm: 'gap-5' } as const;

export const Tabs = BaseTabs.Root;

export function TabsList({ className, size = 'md', ...props }: ComponentProps<typeof BaseTabs.List> & { size?: 'md' | 'sm' }) {
  return <BaseTabs.List data-slot="tabs-list" data-size={size} className={cn(tabListClass, listGap[size], className as string)} {...props} />;
}

export function Tab({ className, size = 'md', count, children, ...props }: ComponentProps<typeof BaseTabs.Tab> & { size?: 'md' | 'sm'; count?: number; children: ReactNode }) {
  return (
    <BaseTabs.Tab data-slot="tab" className={cn(tabClass, tabSize[size], className as string)} {...props}>
      {children}
      {count !== undefined ? <span className="font-normal text-ink-3 tabular-nums">{count}</span> : null}
    </BaseTabs.Tab>
  );
}

export function TabsPanel(props: ComponentProps<typeof BaseTabs.Panel>) {
  return <BaseTabs.Panel data-slot="tabs-panel" {...props} />;
}

/** 链接式页签（页面导航，如「我的」子页）：当前页用 aria-current。 */
export function TabLinks({ className, size = 'md', label, ...props }: ComponentProps<'nav'> & { size?: 'md' | 'sm'; label: string }) {
  return <nav data-slot="tab-links" aria-label={label} className={cn(tabListClass, listGap[size], className)} {...props} />;
}

export function TabLink({ href, current, size = 'md', count, children, className }: { href: string; current?: boolean; size?: 'md' | 'sm'; count?: number; children: ReactNode; className?: string }) {
  return (
    <Link href={href} data-slot="tab-link" aria-current={current ? 'page' : undefined} className={cn(tabClass, tabSize[size], className)}>
      {children}
      {count !== undefined ? <span className="font-normal text-ink-3 tabular-nums">{count}</span> : null}
    </Link>
  );
}

/** 分段控件：只用于同一视图的模式切换（编辑 / 跟拼、网格 / 列表），白色滑块在 --bg-muted 槽内。 */
export interface SegmentedControlProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  label: string;
  items: ReadonlyArray<{ value: T; label: string; icon?: ReactNode; iconOnly?: boolean }>;
  className?: string;
}

export function SegmentedControl<T extends string>({ value, onValueChange, label, items, className }: SegmentedControlProps<T>) {
  return (
    <BaseToggleGroup
      data-slot="segmented-control"
      aria-label={label}
      value={[value]}
      onValueChange={(next) => {
        const picked = next[0] as T | undefined;
        if (picked) onValueChange(picked);
      }}
      className={cn('inline-flex gap-0.5 rounded-full bg-bg-muted p-0.75', className)}
    >
      {items.map((item) => (
        <BaseToggle
          key={item.value}
          value={item.value}
          aria-label={item.iconOnly ? item.label : undefined}
          className={cn(
            'inline-flex h-8.5 items-center justify-center gap-1.5 rounded-full text-footnote leading-none font-semibold whitespace-nowrap text-ink-3',
            'transition-[background-color,color,box-shadow] duration-state ease-standard hover:text-ink focus-visible:focus-ring',
            'data-pressed:bg-bg data-pressed:text-ink data-pressed:shadow-seg [&_svg]:size-4',
            item.iconOnly ? 'w-8.5' : 'px-3.5',
          )}
        >
          {item.icon}
          {item.iconOnly ? null : item.label}
        </BaseToggle>
      ))}
    </BaseToggleGroup>
  );
}
