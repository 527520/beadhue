import { Star } from 'lucide-react';
import type { CommunityListItem } from '@/lib/community/queries';
import { zhCN } from '@/messages/zh-CN';
import { Badge } from '@/components/ui/badge';
import { BeadDots, MetaItem, MetaSep, WorkCard } from '@/components/ui/work-card';

const t = zhCN.shell.author;

/**
 * 作品网格（票 03 骨架用：作者主页、我的 · 喜欢）：2/3/4/5/6 列，服务端豆粒缩略图。
 * 票 04 的发现页作品卡（点赞、骨架、加载更多）完成后，作者主页与喜欢页改用那一套。
 */
export function SimpleWorkGrid({ items }: { items: CommunityListItem[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-5 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {items.map((work) => (
        <li key={work.id} className="min-w-0">
          <WorkCard
            href={`/community/${work.id}`}
            linkLabel={t.viewWork(work.title)}
            title={work.title}
            // eslint-disable-next-line @next/next/no-img-element -- 服务端按修订渲染的豆粒缩略图，长期缓存
            media={<img src={work.thumbnailUrl} alt="" loading="lazy" decoding="async" />}
            badges={work.featured ? <Badge tone="featured"><Star aria-hidden="true" fill="currentColor" strokeWidth={1.75} />{zhCN.selection.featured}</Badge> : work.author.authorType === 'official' ? <Badge tone="on-image">{t.official}</Badge> : undefined}
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
        </li>
      ))}
    </ul>
  );
}
