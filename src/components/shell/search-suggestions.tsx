'use client';

import { History, Search } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { chipVariants } from '@/components/ui/chip';
import { menuItemClass } from '@/components/ui/menu';
import { clearRecentSearches, useRecentSearches } from './recent-searches';
import { ShellLink } from './shell-context';
import { normalizeSuggestQuery, useSearchSuggest, type SearchSuggestResult } from './use-search-suggest';

const t = zhCN.shell.search;

export function searchHref(query: string): string {
  return `/?${new URLSearchParams({ q: query.trim() })}`;
}

const linkItemClass = cn(menuItemClass, 'hover:bg-bg-muted focus-visible:bg-bg-muted focus-visible:outline-none');
const groupLabelClass = 'px-2.5 pt-2 pb-1 text-caption text-ink-3';

export interface SearchSuggestionsProps {
  query: string;
  /** panel：桌面顶栏弹出层；page：手机全屏搜索页（只有最近搜索、大家在搜与附加内容）。 */
  layout: 'panel' | 'page';
  /** 点了任一建议（会跳转）；remember 为要记入最近搜索的关键词。 */
  onPick: (remember?: string) => void;
  /** 手机搜索页的附加区块（票 04：按类目看看）。 */
  extras?: ReactNode;
}

/** 搜索建议：空关键词为「最近搜索（本机）」+「大家在搜」；有关键词时为「搜索「…」」+ 匹配的图纸与作者。 */
export function SearchSuggestions({ query, layout, onPick, extras }: SearchSuggestionsProps) {
  const q = layout === 'page' ? '' : normalizeSuggestQuery(query);
  const result = useSearchSuggest(q, true);
  if (q) return <TypedSuggestions q={q} result={result} onPick={onPick} />;
  return <EmptyQuerySuggestions layout={layout} hot={result?.tags.map((tag) => tag.name) ?? []} onPick={onPick} extras={extras} />;
}

function EmptyQuerySuggestions({ layout, hot, onPick, extras }: { layout: 'panel' | 'page'; hot: string[]; onPick: (remember?: string) => void; extras?: ReactNode }) {
  const recent = useRecentSearches();
  const recentId = useId();
  const hotId = useId();
  const page = layout === 'page';
  const heading = cn('text-caption text-ink-3', page && 'mb-2.5');
  const chips = cn('flex flex-wrap gap-2', !page && 'mt-2');
  return (
    <div className={page ? 'grid gap-6 pt-4' : 'grid gap-4 p-2'}>
      {recent.length ? (
        <section aria-labelledby={recentId}>
          <div className={cn('flex items-center justify-between gap-3', page && '-mt-1.5 mb-1')}>
            <h2 id={recentId} className="text-caption text-ink-3">{t.recent}</h2>
            <Button variant="ghost" size="sm" onClick={clearRecentSearches}>{t.clearRecent}</Button>
          </div>
          <div className={chips}>
            {recent.map((item) => (
              <ShellLink key={item} href={searchHref(item)} onClick={() => onPick()} className={chipVariants({ variant: 'outline' })}>
                <History aria-hidden="true" strokeWidth={1.75} />
                {item}
              </ShellLink>
            ))}
          </div>
        </section>
      ) : null}
      {hot.length ? (
        <section aria-labelledby={hotId}>
          <h2 id={hotId} className={heading}>{t.hot}</h2>
          <div className={chips}>
            {hot.map((item) => (
              <ShellLink key={item} href={searchHref(item)} onClick={() => onPick()} className={chipVariants()}>
                {item}
              </ShellLink>
            ))}
          </div>
        </section>
      ) : null}
      {extras}
    </div>
  );
}

function TypedSuggestions({ q, result, onPick }: { q: string; result: SearchSuggestResult | null; onPick: (remember?: string) => void }) {
  const works = result?.works ?? [];
  const authors = result?.authors ?? [];
  return (
    <div className="grid gap-1">
      <ShellLink href={searchHref(q)} onClick={() => onPick(q)} className={linkItemClass}>
        <Search aria-hidden="true" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 truncate">
          {t.searchFor}「<b className="font-semibold text-ink">{q}</b>」
        </span>
        <span className="ml-auto text-caption font-normal text-ink-3">{t.enter}</span>
      </ShellLink>
      {works.length ? (
        <div role="group" aria-label={t.works} className="grid">
          <div aria-hidden="true" className="mx-1 my-1.5 h-px bg-line" />
          <div aria-hidden="true" className={groupLabelClass}>{t.works}</div>
          {works.map((work) => (
            <ShellLink key={work.id} href={`/community/${work.id}`} onClick={() => onPick()} className={linkItemClass}>
              {/* eslint-disable-next-line @next/next/no-img-element -- 服务端按修订渲染的豆粒缩略图（长期缓存），不经 next/image 二次处理 */}
              <img src={work.thumbnailUrl} alt="" width={32} height={32} loading="lazy" className="size-8 shrink-0 rounded-sm bg-bg object-contain p-0.5" />
              <span className="min-w-0 flex-1 truncate">{work.title}</span>
              <span className="ml-auto text-caption font-normal text-ink-3 tabular-nums">{work.width}×{work.height}</span>
            </ShellLink>
          ))}
        </div>
      ) : null}
      {authors.length ? (
        <div role="group" aria-label={t.authors} className="grid">
          <div aria-hidden="true" className="mx-1 my-1.5 h-px bg-line" />
          <div aria-hidden="true" className={groupLabelClass}>{t.authors}</div>
          {authors.map((author) => (
            <ShellLink key={author.publicAuthorId} href={`/u/${encodeURIComponent(author.publicAuthorId)}`} onClick={() => onPick()} className={linkItemClass}>
              <Avatar id={author.publicAuthorId} name={author.displayName} color={author.avatarColor ?? undefined} size="sm" />
              <span className="min-w-0 flex-1 truncate">{author.displayName}</span>
            </ShellLink>
          ))}
        </div>
      ) : null}
      {result && !works.length && !authors.length ? <p className="px-2.5 py-2 text-body-sm text-ink-3">{t.none}</p> : null}
    </div>
  );
}
