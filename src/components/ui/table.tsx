import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** 表格基础样式：吸顶表头（40 高、--bg-subtle 底）、行高 56、悬停变浅底、选中行 --bg-muted。 */
export function Table({ className, ...props }: ComponentProps<'table'>) {
  return <table data-slot="table" className={cn('w-full border-collapse text-body-sm', className)} {...props} />;
}

export function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn('sticky top-0 z-1 h-10 border-b border-line bg-bg-subtle px-3 text-left font-medium whitespace-nowrap text-ink-3', className)}
      {...props}
    />
  );
}

export function TableRow({ className, selected, ...props }: ComponentProps<'tr'> & { selected?: boolean }) {
  return (
    <tr
      data-slot="table-row"
      data-selected={selected || undefined}
      aria-selected={selected}
      className={cn('transition-colors duration-state ease-standard [tbody>&]:hover:bg-bg-subtle data-selected:bg-bg-muted', className)}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td data-slot="table-cell" className={cn('h-14 border-b border-line px-3 py-2 align-middle text-ink-2', className)} {...props} />;
}
