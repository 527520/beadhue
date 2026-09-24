'use client';

import { Star } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CommunityListItem } from '@/lib/community/queries';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';
import { Badge } from '@/components/ui/badge';
import { LikeButton } from '@/components/ui/like-button';
import { Skeleton } from '@/components/ui/skeleton';
import { BeadDots, MetaItem, MetaSep, WorkCard } from '@/components/ui/work-card';
import { useWorkLike } from './use-work-like';

const t = zhCN.discover;

export type CommunityCardItem = Pick<CommunityListItem, 'id' | 'title' | 'author' | 'width' | 'height' | 'colorCount' | 'preview' | 'thumbnailUrl' | 'featured' | 'liked'>;

/**
 * 豆社作品卡（design.md §5.1）：服务端豆粒缩略图、左上精选 / 官方徽标、右上可直接点的喜欢；
 * 标题一行，下方「作者 · 尺寸 · 颜色数」+ 用色小圆豆，按卡片宽度取舍。
 */
export function CommunityWorkCard({ work, href, eager = false }: { work: CommunityCardItem; href?: string; eager?: boolean }) {
  const { liked, toggle } = useWorkLike(work.id, work.liked);
  return (
    <WorkCard
      href={href ?? `/community/${work.id}`}
      linkLabel={t.viewWork(work.title)}
      title={work.title}
      // eslint-disable-next-line @next/next/no-img-element -- 服务端按修订渲染的豆粒缩略图，长期缓存，不经 next/image 二次处理
      media={<img src={work.thumbnailUrl} alt="" width={work.width} height={work.height} loading={eager ? 'eager' : 'lazy'} decoding="async" />}
      badges={work.featured ? (
        <Badge tone="featured"><Star aria-hidden="true" fill="currentColor" strokeWidth={1.75} />{t.featured}</Badge>
      ) : work.author.authorType === 'official' ? <Badge tone="on-image">{t.official}</Badge> : undefined}
      action={<LikeButton title={work.title} pressed={liked} onPressedChange={toggle} />}
      meta={
        <>
          <MetaItem grow>{work.author.displayName}</MetaItem>
          <MetaSep wide />
          <MetaItem wide>{work.width}×{work.height}</MetaItem>
          <MetaSep />
          <MetaItem>{t.colors(work.colorCount)}</MetaItem>
          <BeadDots colors={work.preview.colorBand} />
        </>
      }
    />
  );
}

/** 作品网格（design.md §2）：< 640 两列、640–1023 三列、1024–1279 四列、1280–1535 五列、≥ 1536 六列。 */
export const workGridClass = 'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-5 lg:grid-cols-4 lg:gap-x-5 lg:gap-y-7 xl:grid-cols-5 2xl:grid-cols-6';

export function WorkGrid({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <ul aria-label={label} className={cn(workGridClass, className)}>
      {children}
    </ul>
  );
}

/** 与作品卡同尺寸的骨架（加载更多时追加在网格末尾）。 */
export function WorkCardSkeleton() {
  return (
    <li aria-hidden="true" className="flex min-w-0 flex-col gap-2 sm:gap-2.5">
      <Skeleton className="aspect-square rounded-lg" />
      <div className="grid gap-1.5 px-0.5">
        <Skeleton className="h-4 w-7/10" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </li>
  );
}
