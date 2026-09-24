import type { Metadata } from 'next';
import { getDb } from '@/lib/auth/db';
import { getSessionActor } from '@/lib/auth/session';
import { listDiscoverCategories } from '@/lib/community/discovery';
import { countPublicCommunityWorks, listPopularCommunityTags, listPublicCommunityWorks, parseCommunityListUrl, type CommunityListQuery } from '@/lib/community/queries';
import { parseTagIcon } from '@/lib/community/tagIcon';
import { AppError } from '@/lib/errors';
import { zhCN } from '@/messages/zh-CN';
import { builtinCategories, discoverSearchParams, readDiscoverState, type DiscoverCategory } from '@/components/works/discover/discover-state';
import { DiscoverView } from '@/components/works/discover/discover-view';

const t = zhCN.discover;
const HOT_SEARCH_LIMIT = 6;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { q } = readDiscoverState(await searchParams);
  return { title: q ? t.searchTitle(q) : t.title, description: t.description };
}

/** 发现 / 搜索（D66 `/`）：服务端渲染首屏作品、总数与类目条，交互部分在 DiscoverView。 */
export default async function DiscoverPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const state = readDiscoverState(raw);
  const params = discoverSearchParams(state);
  if (typeof raw.cursor === 'string' && raw.cursor) params.set('cursor', raw.cursor);
  const db = getDb();
  const [actor, tags] = await Promise.all([getSessionActor(), listDiscoverCategories(db)]);
  const categories: DiscoverCategory[] = [...builtinCategories(), ...tags.map((tag) => ({ id: tag.name, label: tag.name, icon: parseTagIcon(tag.icon) }))];

  let query: CommunityListQuery | null = null;
  try { query = parseCommunityListUrl(`http://local/?${params}`); } catch { query = null; }
  let page: Awaited<ReturnType<typeof listPublicCommunityWorks>> = { items: [], nextCursor: null };
  let total = 0;
  let invalid = query === null;
  if (query) {
    try {
      [page, total] = await Promise.all([
        listPublicCommunityWorks(db, query, { includeTags: false, viewerUserId: actor?.userId }),
        countPublicCommunityWorks(db, query),
      ]);
    } catch (error) {
      if (!(error instanceof AppError && error.code === 'VALIDATION')) throw error;
      invalid = true;
    }
  }
  const hot = page.items.length === 0 && !invalid ? (await listPopularCommunityTags(db, HOT_SEARCH_LIMIT)).map((tag) => tag.name) : [];
  return <DiscoverView key={params.toString()} state={state} categories={categories} items={page.items} nextCursor={page.nextCursor} total={total} hot={hot} invalid={invalid} />;
}
