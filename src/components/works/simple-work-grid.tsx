import type { CommunityListItem } from '@/lib/community/queries';
import { CommunityWorkCard, WorkGrid } from './community-work-card';

/** 一页作品的网格（作者主页、我的 · 喜欢）：与发现页同一张作品卡，可直接点喜欢。 */
export function SimpleWorkGrid({ items }: { items: CommunityListItem[] }) {
  return (
    <WorkGrid>
      {items.map((work) => (
        <li key={work.id} className="min-w-0">
          <CommunityWorkCard work={work} />
        </li>
      ))}
    </WorkGrid>
  );
}
