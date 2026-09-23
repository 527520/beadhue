'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';
import { Button } from './button';
import { Select } from './select';

/** 页码列表：首尾常驻、当前页前后各一页，其余用省略号。 */
export function pageItems(page: number, pageCount: number): Array<number | 'gap'> {
  if (pageCount <= 5) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const pages = new Set([1, pageCount, page - 1, page, page + 1].filter((value) => value >= 1 && value <= pageCount));
  if (page <= 3) [2, 3].forEach((value) => pages.add(value));
  if (page >= pageCount - 2) [pageCount - 2, pageCount - 1].forEach((value) => pages.add(value));
  const sorted = [...pages].sort((a, b) => a - b);
  const items: Array<number | 'gap'> = [];
  sorted.forEach((value, index) => {
    if (index > 0 && value - sorted[index - 1] > 1) items.push('gap');
    items.push(value);
  });
  return items;
}

export interface PaginationProps {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  pageSizes?: readonly number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  /** 窄屏只保留「上一页 / 第 n/m 页 / 下一页」；默认按视口（< md）自动切换。 */
  variant?: 'auto' | 'full' | 'compact';
  className?: string;
}

const pageButtonClass = cn(
  'inline-grid h-8 min-w-8 place-items-center rounded-sm px-2 text-footnote leading-none font-medium text-ink-2 tabular-nums',
  'transition-colors duration-state hover:bg-bg-muted focus-visible:focus-ring disabled:cursor-not-allowed disabled:text-ink-4 disabled:hover:bg-transparent',
  'aria-[current=page]:bg-ink aria-[current=page]:text-on-ink [&>svg]:size-4',
);

/** 后台表格底部通栏单行：总数 · 每页条数 · 页码 · 跳页。 */
export function Pagination({ page, pageCount, total, pageSize, pageSizes = [10, 20, 50, 100], onPageChange, onPageSizeChange, variant = 'auto', className }: PaginationProps) {
  const t = zhCN.ui;
  const [jump, setJump] = useState('');
  const go = (next: number) => onPageChange(Math.min(pageCount, Math.max(1, next)));
  const compact = (
    <nav aria-label={t.pagination} data-slot="pagination" data-variant="compact" className={cn('flex items-center justify-between gap-4 px-4 py-3 text-body-sm text-ink-2', variant === 'auto' && 'md:hidden', className)}>
      <Button variant="outline" disabled={page <= 1} onClick={() => go(page - 1)}>
        <ChevronLeft aria-hidden="true" strokeWidth={1.75} className="size-4!" />
        {t.prevPage}
      </Button>
      <span className="tabular-nums">{t.pageStatus(page, pageCount)}</span>
      <Button variant="outline" disabled={page >= pageCount} onClick={() => go(page + 1)}>
        {t.nextPage}
        <ChevronRight aria-hidden="true" strokeWidth={1.75} className="size-4!" />
      </Button>
    </nav>
  );
  if (variant === 'compact') return compact;
  const full = (
    <nav
      aria-label={t.pagination}
      data-slot="pagination"
      data-variant="full"
      className={cn('flex flex-nowrap items-center gap-4 px-4 py-3 text-body-sm whitespace-nowrap text-ink-3', variant === 'auto' && 'max-md:hidden', className)}
    >
      <span>
        {t.pageTotalPrefix} <b className="font-semibold text-ink tabular-nums">{total}</b> {t.pageTotalSuffix}
      </span>
      {onPageSizeChange ? (
        <span className="inline-flex items-center gap-2">
          {t.perPage}
          <Select
            size="sm"
            label={t.perPage}
            value={String(pageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value))}
            options={pageSizes.map((size) => ({ value: String(size), label: t.perPageOption(size) }))}
          />
        </span>
      ) : null}
      <div className="ml-auto flex items-center gap-1">
        <button type="button" className={pageButtonClass} aria-label={t.prevPage} disabled={page <= 1} onClick={() => go(page - 1)}>
          <ChevronLeft aria-hidden="true" strokeWidth={1.75} />
        </button>
        {pageItems(page, pageCount).map((item, index) =>
          item === 'gap' ? (
            <span key={`gap-${index}`} aria-hidden="true" className="min-w-6 text-center text-ink-4">
              …
            </span>
          ) : (
            <button key={item} type="button" className={pageButtonClass} aria-label={t.goToPage(item)} aria-current={item === page ? 'page' : undefined} onClick={() => go(item)}>
              {item}
            </button>
          ),
        )}
        <button type="button" className={pageButtonClass} aria-label={t.nextPage} disabled={page >= pageCount} onClick={() => go(page + 1)}>
          <ChevronRight aria-hidden="true" strokeWidth={1.75} />
        </button>
      </div>
      <label className="inline-flex items-center gap-2">
        {t.jumpTo}
        <input
          inputMode="numeric"
          aria-label={t.jumpToLabel}
          value={jump}
          onChange={(event) => setJump(event.target.value.replace(/\D/g, ''))}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && jump) {
              go(Number(jump));
              setJump('');
            }
          }}
          className="h-control-sm w-14 rounded-sm border border-line-strong bg-bg px-2 text-center text-footnote text-ink tabular-nums outline-none focus:border-accent focus:shadow-field-focus"
        />
        {t.pageUnit}
      </label>
    </nav>
  );
  if (variant === 'full') return full;
  return (
    <>
      {full}
      {compact}
    </>
  );
}
