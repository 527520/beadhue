'use client';

import Link from 'next/link';
import { useMemo, type ReactNode } from 'react';
import type { TagIcon } from '@/lib/community/tagIcon';
import { cn } from '@/lib/cn';
import { ALL_CATEGORY_ICON, FEATURED_CATEGORY_ICON, tagIconPattern } from '@/lib/render/tagIconArt';
import { zhCN } from '@/messages/zh-CN';
import { PixelIcon } from '@/components/ui/bead-image';
import { useScrolled } from '@/components/shell/use-scrolled';
import { discoverHref, type DiscoverState } from './discover-state';

const t = zhCN.discover;

/** 类目条上的一个类目：id 为地址里的 cat 值（all / featured / 标签名）。 */
export interface DiscoverCategory {
  id: string;
  label: string;
  /** 标签图标（服务端已解析）；null 用默认豆粒。 */
  icon: TagIcon | null;
}

export function builtinCategories(): DiscoverCategory[] {
  return [
    { id: 'all', label: t.all, icon: null },
    { id: 'featured', label: t.featured, icon: null },
  ];
}

function categoryPattern(category: DiscoverCategory) {
  if (category.id === 'all') return ALL_CATEGORY_ICON;
  if (category.id === 'featured') return FEATURED_CATEGORY_ICON;
  return tagIconPattern(category.icon);
}

function CategoryIcon({ category, className }: { category: DiscoverCategory; className?: string }) {
  const pattern = useMemo(() => categoryPattern(category), [category]);
  return <PixelIcon pattern={pattern} className={className} />;
}

/**
 * 吸顶像素类目条（原型 layout.css .cats-bar）：横向滚动的类目 + 右端工具（筛选、排序）。
 * 类目是普通链接（服务端渲染、可爬），切换类目时保留搜索词、筛选与排序。
 */
export function CategoryBar({ categories, state, tools }: { categories: DiscoverCategory[]; state: DiscoverState; tools: ReactNode }) {
  const stuck = useScrolled(8);
  return (
    <div
      data-ui=""
      data-stuck={stuck || undefined}
      className="sticky top-topbar z-30 border-b border-transparent bg-bg/96 backdrop-blur-md transition-[border-color,box-shadow] duration-state ease-standard data-stuck:border-line data-stuck:shadow-stuck"
    >
      <div className="page-container-wide flex h-21 items-center gap-4 max-md:h-18 max-md:gap-2">
        <nav
          aria-label={t.categories}
          className="relative flex min-w-0 flex-1 snap-x snap-proximity gap-2 overflow-x-auto [mask-image:linear-gradient(90deg,black_calc(100%-48px),transparent)] [scrollbar-width:none] max-md:[mask-image:linear-gradient(90deg,black_calc(100%-32px),transparent)] [&::-webkit-scrollbar]:hidden"
        >
          {categories.map((category) => {
            const current = category.id === state.cat;
            return (
              <Link
                key={category.id}
                href={discoverHref(state, { cat: category.id })}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'group/cat relative grid h-18 min-w-16 shrink-0 snap-start content-center justify-items-center gap-1.5 px-2 text-caption leading-none whitespace-nowrap text-ink-3 transition-colors duration-state ease-standard hover:text-ink focus-visible:focus-ring max-md:h-16 max-md:min-w-14 max-md:gap-1.25',
                  current && 'font-semibold text-ink after:absolute after:inset-x-3.5 after:bottom-0.5 after:h-0.5 after:rounded-full after:bg-ink after:content-[""]',
                )}
              >
                <CategoryIcon
                  category={category}
                  className={cn(
                    'size-7 transition-[opacity,translate] duration-state ease-standard group-hover/cat:-translate-y-px group-hover/cat:opacity-100 max-md:size-6',
                    current ? 'opacity-100' : 'opacity-78',
                  )}
                />
                {category.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-2">{tools}</div>
      </div>
    </div>
  );
}

/** 手机全屏搜索页的「按类目看看」：四列类目格。 */
export function CategoryGrid({ categories, state }: { categories: DiscoverCategory[]; state: DiscoverState }) {
  const items = categories.filter((category) => category.id !== 'all');
  if (!items.length) return null;
  return (
    <section aria-labelledby="discover-browse-categories">
      <h2 id="discover-browse-categories" className="mb-2.5 text-caption text-ink-3">{t.browseCategories}</h2>
      <div className="grid grid-cols-4 gap-x-2 gap-y-3">
        {items.map((category) => (
          <Link
            key={category.id}
            href={discoverHref({ ...state, q: '' }, { cat: category.id })}
            className="grid justify-items-center gap-1.5 rounded-md bg-bg-subtle py-2.5 text-caption leading-none text-ink-2 focus-visible:focus-ring"
          >
            <CategoryIcon category={category} className="size-6" />
            <span className="max-w-full truncate px-1">{category.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
