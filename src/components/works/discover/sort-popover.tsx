'use client';

import { ArrowUpDown, Check } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';
import { Button } from '@/components/ui/button';
import { menuItemClass } from '@/components/ui/menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DISCOVER_SORTS, discoverHref, sortLabel, type DiscoverState } from './discover-state';

const t = zhCN.discover;

/** 排序：推荐 / 最新发布 / 最多喜欢 / 最多引用，对勾表示当前项；手机为底部面板。 */
export function SortPopover({ state }: { state: DiscoverState }) {
  const [open, setOpen] = useState(false);
  const current = sortLabel(state.sort);
  return (
    <Popover open={open} onOpenChange={setOpen} sheetTitle={t.sort}>
      <PopoverTrigger render={<Button variant="outline" aria-label={t.sortCurrent(current)} className="data-popup-open:border-ink max-md:w-10 max-md:px-0" />}>
        <ArrowUpDown aria-hidden="true" strokeWidth={1.75} />
        <span className="max-md:hidden">{current}</span>
      </PopoverTrigger>
      <PopoverContent aria-label={t.sort}>
        <nav aria-label={t.sort} className="grid">
          {DISCOVER_SORTS.map((sort) => {
            const selected = state.sort === sort;
            return (
              <Link
                key={sort}
                href={discoverHref(state, { sort })}
                aria-current={selected ? 'true' : undefined}
                onClick={() => setOpen(false)}
                className={cn(menuItemClass, 'hover:bg-bg-muted focus-visible:bg-bg-muted focus-visible:outline-none max-md:min-h-12 max-md:text-body')}
              >
                <span className="min-w-0 flex-1">{t.sorts[sort]}</span>
                {selected ? <Check aria-hidden="true" strokeWidth={1.75} className="ml-auto text-ink!" /> : null}
              </Link>
            );
          })}
        </nav>
      </PopoverContent>
    </Popover>
  );
}
