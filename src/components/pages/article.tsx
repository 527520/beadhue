import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';

export interface ArticleTocItem {
  id: string;
  title: string;
}

export interface ArticlePageProps {
  eyebrow?: ReactNode;
  title: string;
  lead?: ReactNode;
  /** 目录锚点；三项以上才显示（≥1280 左侧吸顶，更窄时为可展开的「本页目录」）。 */
  toc?: readonly ArticleTocItem[];
  children: ReactNode;
}

const tocLink = 'block rounded-sm py-1 text-body-sm text-ink-3 transition-colors duration-state hover:text-ink focus-visible:focus-ring';

function TocList({ items }: { items: readonly ArticleTocItem[] }) {
  return (
    <ol className="grid">
      {items.map((item) => (
        <li key={item.id}><a href={`#${item.id}`} className={tocLink}>{item.title}</a></li>
      ))}
    </ol>
  );
}

/**
 * 静态文章版式（帮助 / 关于 / 隐私 / 社区规范 / 版权）：720px 窄栏、标题 title-1 + 导语、区块标题 title-2、
 * 正文 body；目录只放锚点，不做滚动监听。
 */
export function ArticlePage({ eyebrow, title, lead, toc, children }: ArticlePageProps) {
  const items = toc && toc.length >= 3 ? toc : null;
  return (
    <div data-ui="" className="page-container pt-10 pb-8 max-md:pt-6">
      <div className={cn('mx-auto grid max-w-article', items && 'xl:max-w-none xl:grid-cols-[minmax(0,1fr)_minmax(0,720px)_minmax(0,1fr)] xl:gap-x-12')}>
        {items ? (
          <nav aria-label={zhCN.pages.toc} className="max-xl:hidden xl:col-start-1 xl:justify-self-end">
            <div className="sticky top-below-topbar-lg w-50">
              <p className="mb-2 text-caption text-ink-4">{zhCN.pages.toc}</p>
              <TocList items={items} />
            </div>
          </nav>
        ) : null}
        <article className={cn('min-w-0 wrap-anywhere', items && 'xl:col-start-2 xl:row-start-1')}>
          <header className="grid gap-3 border-b border-line pb-8 max-md:pb-6">
            {eyebrow ? <p className="text-caption text-ink-3">{eyebrow}</p> : null}
            <h1 className="text-title-1 text-balance text-ink">{title}</h1>
            {lead ? <div className="text-body text-pretty text-ink-3">{lead}</div> : null}
          </header>
          {items ? (
            <details className="group mt-6 rounded-lg bg-bg-subtle px-4 xl:hidden">
              <summary className="flex h-control-md cursor-pointer list-none items-center gap-2 text-body-sm font-semibold text-ink focus-visible:focus-ring [&::-webkit-details-marker]:hidden">
                {zhCN.pages.toc}
                <ChevronDown aria-hidden="true" strokeWidth={1.75} className="ml-auto size-4 text-ink-3 transition-transform duration-state group-open:rotate-180" />
              </summary>
              <div className="pb-3"><TocList items={items} /></div>
            </details>
          ) : null}
          <div className="grid gap-10 pt-8 max-md:gap-8 max-md:pt-6">{children}</div>
        </article>
      </div>
    </div>
  );
}

/** 文章里的一节：锚点 id + title-2 标题；锚点跳转时让出吸顶顶栏。 */
export function ArticleSection({ id, title, children, className }: { id?: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className={cn('grid min-w-0 scroll-mt-below-topbar gap-3', className)}>
      <h2 id={id ? `${id}-title` : undefined} className="text-title-2 text-balance text-ink">{title}</h2>
      {children}
    </section>
  );
}

/** 正文段落。 */
export function ArticleText({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-body text-pretty text-ink-2', className)}>{children}</p>;
}

/** 正文里的链接必须有下划线（axe link-in-text-block），不能只靠颜色区分。 */
export const articleLink = 'rounded-sm text-accent underline decoration-accent/40 underline-offset-3 transition-colors duration-state hover:decoration-accent focus-visible:focus-ring';
