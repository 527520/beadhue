'use client';

import { SlidersHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { zhCN } from '@/messages/zh-CN';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { activeFilterCount, DISCOVER_FILTER_KEYS, DISCOVER_FILTERS, discoverHref, discoverSearchParams, filterOptionLabel, type DiscoverFilters, type DiscoverState } from './discover-state';

const t = zhCN.discover;
const COUNT_DEBOUNCE_MS = 250;

function pickFilters(state: DiscoverFilters): DiscoverFilters {
  return { size: state.size, colors: state.colors, spec: state.spec, since: state.since };
}

/** 按草稿条件实时取「显示 N 张图纸」的 N（列表接口的 total，服务端按筛选缓存 60 秒）。 */
function useDraftCount(state: DiscoverState, draft: DiscoverFilters, open: boolean, initial: number): number {
  const key = discoverSearchParams({ ...state, ...draft, sort: 'rec' }).toString();
  const baseKey = discoverSearchParams({ ...state, sort: 'rec' }).toString();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [last, setLast] = useState(initial);
  const cache = key === baseKey ? initial : counts[key];
  useEffect(() => {
    if (!open || cache !== undefined) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch(`/api/community/works${key ? `?${key}` : ''}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { total?: unknown } | null) => {
          if (typeof body?.total !== 'number') return;
          const value = body.total;
          setCounts((previous) => ({ ...previous, [key]: value }));
          setLast(value);
        })
        .catch(() => undefined);
    }, COUNT_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [cache, key, open]);
  // 新数量回来之前沿用上一次的数字，按钮文案不闪。
  return cache ?? last;
}

/**
 * 筛选：桌面为「筛选」按钮下的宽弹出层，手机为底部面板。
 * 选项是可再次点击取消的单选芯片；底部「清除全部」+「显示 N 张图纸」（实时数量），应用后写进地址。
 */
export function FilterPopover({ state, total }: { state: DiscoverState; total: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DiscoverFilters>(() => pickFilters(state));
  const shown = useDraftCount(state, draft, open, total);
  const active = activeFilterCount(state);

  const onOpenChange = (next: boolean) => {
    if (next) setDraft(pickFilters(state));
    setOpen(next);
  };
  const apply = () => {
    setOpen(false);
    router.push(discoverHref(state, draft));
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange} sheetTitle={t.filter}>
      <PopoverTrigger
        render={<Button variant="outline" aria-haspopup="dialog" aria-label={active ? t.filterActive(active) : t.filter} className="data-popup-open:border-ink max-md:w-10 max-md:px-0" />}
      >
        <SlidersHorizontal aria-hidden="true" strokeWidth={1.75} />
        <span className="max-md:hidden">{t.filter}</span>
        {active ? (
          <span aria-hidden="true" className="-mr-1.5 inline-grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1.5 text-tabbar leading-none font-semibold text-on-ink max-md:absolute max-md:-top-1 max-md:-right-1 max-md:mr-0">
            {active}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent wide aria-label={t.filter}>
        <div className="grid gap-5 md:px-2 md:pt-2">
          {DISCOVER_FILTER_KEYS.map((key) => (
            <section key={key} aria-labelledby={`discover-filter-${key}`}>
              <h3 id={`discover-filter-${key}`} className="mb-2.5 text-body-sm leading-5 font-semibold text-ink">{t.filters[key].label}</h3>
              <div className="flex flex-wrap gap-2">
                {DISCOVER_FILTERS[key].map((value) => {
                  const selected = draft[key] === value;
                  return (
                    <Chip
                      key={value}
                      variant="outline"
                      selected={selected}
                      className="aria-pressed:inset-ring-ink"
                      onClick={() => setDraft((previous) => ({ ...previous, [key]: previous[key] === value ? '' : value }))}
                    >
                      {filterOptionLabel(key, value)}
                    </Chip>
                  );
                })}
              </div>
            </section>
          ))}
          <footer className="sticky -bottom-4 -mx-5 flex justify-between gap-2 border-t border-line bg-bg px-4 pt-3 pb-2 md:static md:-mx-5 md:px-5 md:pb-2 max-md:[&>button]:h-control-lg max-md:[&>button]:flex-1">
            <Button variant="ghost" onClick={() => setDraft({ size: '', colors: '', spec: '', since: '' })}>{t.clearAll}</Button>
            <Button variant="primary" disabled={shown === 0} onClick={apply}>{shown === 0 ? t.showNone : t.showCount(shown)}</Button>
          </footer>
        </div>
      </PopoverContent>
    </Popover>
  );
}
