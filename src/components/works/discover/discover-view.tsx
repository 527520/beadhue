'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type MouseEvent } from 'react';
import type { CommunityListItem, CommunitySort } from '@/lib/community/queries';
import { LIMITS } from '@/lib/appInfo';
import { zhCN } from '@/messages/zh-CN';
import { CommunityListImpression } from '@/components/community/CommunityImpression';
import { MobileTopBack } from '@/components/shell/mobile-topbar';
import { rememberSearch } from '@/components/shell/recent-searches';
import { searchHref } from '@/components/shell/search-suggestions';
import { SiteShell } from '@/components/shell/site-shell';
import { Button, buttonVariants } from '@/components/ui/button';
import { chipVariants, RemovableChip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchField } from '@/components/ui/search-field';
import { useToast } from '@/components/ui/toast';
import { CommunityWorkCard, WorkCardSkeleton, WorkGrid } from '../community-work-card';
import { CategoryBar, CategoryGrid } from './category-bar';
import { activeChips, activeFilterCount, discoverHref, discoverSearchParams, NO_FILTERS, type DiscoverCategory, type DiscoverState } from './discover-state';
import { FilterPopover } from './filter-popover';
import { IntroStrip } from './intro-strip';
import { SortPopover } from './sort-popover';

const t = zhCN.discover;

export interface DiscoverViewProps {
  state: DiscoverState;
  categories: DiscoverCategory[];
  items: CommunityListItem[];
  nextCursor: string | null;
  total: number;
  /** 空结果下的热门搜索（公开作品最多的标签）。 */
  hot: string[];
  /** 地址里的筛选参数无法识别。 */
  invalid?: boolean;
}

/** 手机搜索结果页的顶栏：返回 + 回填关键词的搜索框。 */
function SearchResultTop({ q }: { q: string }) {
  const router = useRouter();
  const [value, setValue] = useState(q);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = value.trim();
    if (!next) return;
    rememberSearch(next);
    router.push(searchHref(next));
  };
  return (
    <>
      <MobileTopBack href="/" />
      <form action="/" role="search" aria-label={zhCN.shell.search.label} onSubmit={submit} className="mr-1 min-w-0 flex-1">
        <SearchField name="q" maxLength={LIMITS.searchQueryLength} value={value} onValueChange={setValue} placeholder={zhCN.shell.search.label} aria-label={zhCN.shell.search.label} autoComplete="off" enterKeyHint="search" wrapperClassName="h-10 pl-3.5" />
      </form>
    </>
  );
}

/** 「加载更多」：带游标的普通链接（无脚本与爬虫可翻页），有脚本时就地追加一页并先放骨架卡。 */
function useMoreWorks(state: DiscoverState, initialCursor: string | null) {
  const toast = useToast();
  const [items, setItems] = useState<CommunityListItem[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const base = discoverSearchParams(state);
  const href = (value: string) => {
    const params = new URLSearchParams(base);
    params.set('cursor', value);
    return `/?${params}`;
  };
  const load = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!cursor || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    const params = new URLSearchParams(base);
    params.set('cursor', cursor);
    void fetch(`/api/community/works?${params}`)
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { items?: CommunityListItem[]; nextCursor?: string | null } | null;
        if (!response.ok || !Array.isArray(body?.items)) throw new Error('load failed');
        const page = body.items;
        setItems((previous) => [...previous, ...page]);
        setCursor(body.nextCursor ?? null);
        setLoaded(true);
      })
      .catch(() => toast(t.loadFailed))
      .finally(() => setLoading(false));
  };
  return { items, cursor, loading, loaded, href, load };
}

/**
 * 发现页：吸顶类目条 + 筛选 / 排序 → 新手条 → 结果标题 → 已选芯片 → 作品网格 → 加载更多。
 * 首屏作品与类目由服务端渲染（ADR-0021 / D53 可爬）；筛选、排序、类目都写进地址。
 */
export function DiscoverView({ state, categories, items, nextCursor, total, hot, invalid = false }: DiscoverViewProps) {
  const router = useRouter();
  const more = useMoreWorks(state, nextCursor);
  const searching = Boolean(state.q);
  const chips = activeChips(state);
  const filtered = activeFilterCount(state) > 0 || chips.length > 0;
  const category = categories.find((item) => item.id === state.cat);
  const showHead = searching || state.cat !== 'all' || chips.length > 0;
  const showIntro = !searching && state.cat === 'all' && !filtered && !invalid;
  const seen = new Set(items.map((item) => item.id));
  const works = [...items, ...more.items.filter((item) => !seen.has(item.id))];
  const hasAny = works.length > 0;

  return (
    <SiteShell
      nav="discover"
      query={state.q}
      mobileTop={searching ? <SearchResultTop key={state.q} q={state.q} /> : 'discover'}
      searchExtras={<CategoryGrid categories={categories} state={state} />}
    >
      <CommunityListImpression sort={state.sort as CommunitySort} />
      <CategoryBar categories={categories} state={state} tools={<><FilterPopover key={discoverHref(state)} state={state} total={total} /><SortPopover state={state} /></>} />
      <div data-ui="" className="page-container-wide pt-5 max-md:pt-3">
        {showIntro ? <IntroStrip /> : null}
        {showHead ? (
          <header className="mt-1 mb-4 flex items-end gap-4 max-md:mb-3">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-title-1 text-ink">{searching ? `“${state.q}”` : (category?.label ?? state.cat)}</h1>
              <p className="mt-0.5 text-body-sm text-ink-3">
                <span className="tabular-nums">{t.resultCount(total)}</span>
                {searching ? ` · ${t.searchHint}` : null}
              </p>
            </div>
            {searching ? (
              <Link href="/" className={buttonVariants({ variant: 'ghost' })}>
                <X aria-hidden="true" strokeWidth={1.75} />
                {t.clearSearch}
              </Link>
            ) : null}
          </header>
        ) : (
          <h1 className="sr-only">{t.heading}</h1>
        )}
        {chips.length ? (
          <div role="group" aria-label={t.activeFilters} className="mb-5 flex flex-wrap items-center gap-2">
            {chips.map((chip) => (
              <RemovableChip key={chip.key} selected removeLabel={t.removeFilter(chip.label)} onRemove={() => router.push(discoverHref(state, { [chip.key]: '' }))}>
                {chip.label}
              </RemovableChip>
            ))}
            <Link href={discoverHref(state, NO_FILTERS)} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>{t.clearChips}</Link>
          </div>
        ) : null}
        <section aria-labelledby="discover-works">
          <h2 id="discover-works" className="sr-only">{t.works}</h2>
          {hasAny ? (
            <>
              <WorkGrid>
                {works.map((work, index) => (
                  <li key={work.id} className="min-w-0">
                    <CommunityWorkCard work={work} eager={index < 6} />
                  </li>
                ))}
                {more.loading ? Array.from({ length: 5 }, (_, index) => (
                  <WorkCardSkeleton key={`skeleton-${index}`} />
                )) : null}
              </WorkGrid>
              {more.cursor || more.loaded ? (
                <div className="flex justify-center pt-10 pb-2">
                  {more.loading ? (
                    <Button variant="secondary" loading>{t.loadMore}</Button>
                  ) : more.cursor ? (
                    <Link href={more.href(more.cursor)} onClick={more.load} className={buttonVariants({ variant: 'secondary' })}>{t.loadMore}</Link>
                  ) : (
                    <Button variant="secondary" disabled>{t.end}</Button>
                  )}
                </div>
              ) : null}
            </>
          ) : invalid ? (
            <EmptyState kind="search" title={t.invalid.title} description={t.invalid.text} actions={<Link href="/" className={buttonVariants({ variant: 'secondary' })}>{t.invalid.clear}</Link>} />
          ) : searching || filtered || state.cat !== 'all' ? (
            <EmptyState
              kind="search"
              title={searching ? t.empty.searchTitle(state.q) : t.empty.filterTitle}
              description={t.empty.text}
              actions={
                <>
                  <Link href="/" className={buttonVariants({ variant: 'secondary' })}>{t.empty.clear}</Link>
                  {hot.length ? (
                    <nav aria-label={t.empty.hot} className="mt-2 flex basis-full flex-wrap justify-center gap-2">
                      {hot.map((item) => (
                        <Link key={item} href={searchHref(item)} className={chipVariants()}>{item}</Link>
                      ))}
                    </nav>
                  ) : null}
                </>
              }
            />
          ) : (
            <EmptyState kind="empty" title={t.empty.noneTitle} description={t.empty.noneText} actions={<Link href="/app" className={buttonVariants({ variant: 'secondary' })}>{t.empty.create}</Link>} />
          )}
        </section>
      </div>
    </SiteShell>
  );
}
