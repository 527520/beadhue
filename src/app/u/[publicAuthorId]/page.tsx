import { BadgeCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getDb } from '@/lib/auth/db';
import { getSessionActor } from '@/lib/auth/session';
import { getCommunityAuthor } from '@/lib/community/discovery';
import { listPublicCommunityWorks, parseCommunityListUrl } from '@/lib/community/queries';
import { AppError } from '@/lib/errors';
import { zhCN } from '@/messages/zh-CN';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { MobileTopBack, MobileTopTitle } from '@/components/shell/mobile-topbar';
import { SiteShell } from '@/components/shell/site-shell';
import { formatCount } from '@/components/works/detail/detail-format';
import { AuthorWorks, ManageLink } from './author-view';
import { ShareProfileButton } from './share-button';

const t = zhCN.detail.author;
const loadAuthor = cache(async (id: string) => (id.length <= 80 ? getCommunityAuthor(getDb(), id) : null));

type Params = Promise<{ publicAuthorId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const author = await loadAuthor(decodeURIComponent((await params).publicAuthorId));
  if (!author) return { title: t.notFound, robots: { index: false, follow: false } };
  return { title: `${author.displayName}${t.titleSuffix}` };
}

async function loadWorks(id: string, cursor: string | undefined, viewerUserId?: string) {
  const query = (value?: string) => parseCommunityListUrl(`http://local/?${new URLSearchParams({ author: id, sort: 'new', ...(value ? { cursor: value } : {}) })}`);
  try {
    return await listPublicCommunityWorks(getDb(), query(cursor), { includeTags: false, viewerUserId });
  } catch (error) {
    // 过期或被改过的游标：回到第一页，而不是报错页。
    if (cursor && error instanceof AppError && error.code === 'VALIDATION') return listPublicCommunityWorks(getDb(), query(), { includeTags: false, viewerUserId });
    throw error;
  }
}

/** 作者主页（D66 `/u/[publicAuthorId]`，原型 me.js renderAuthor）：头像、名字、官方徽标、简介、统计、作品网格（游标分页）。 */
export default async function AuthorPage({ params, searchParams }: { params: Params; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const id = decodeURIComponent((await params).publicAuthorId);
  const author = await loadAuthor(id);
  if (!author) notFound();
  const actor = await getSessionActor();
  const cursor = (await searchParams)?.cursor;
  const works = await loadWorks(id, typeof cursor === 'string' && cursor ? cursor : undefined, actor?.userId);
  const official = author.authorType === 'official';
  const bio = official ? t.officialBio : '';
  const stats = [[t.works, author.counts.works], [t.likes, author.counts.likes], [t.reuses, author.counts.reuses]] as const;
  return (
    <SiteShell nav={null} topbarCta="secondary" mobileTop={<><MobileTopBack /><MobileTopTitle>{author.displayName}</MobileTopTitle><ShareProfileButton /></>}>
      <div data-ui="" className="page-container pb-8">
        <header className="flex items-center gap-5 pt-8 pb-6 max-md:gap-4 max-md:pt-4 max-md:pb-5">
          <Avatar id={author.publicAuthorId} name={author.displayName} size="xl" className="max-md:size-14 max-md:text-avatar-lg" />
          <div className="grid min-w-0 flex-1 gap-1">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-title-1 text-ink max-md:text-title-2">{author.displayName}</h1>
              {official ? <Badge tone="official"><BadgeCheck aria-hidden="true" strokeWidth={1.75} />{t.official}</Badge> : null}
            </div>
            {bio ? <p className="text-body text-ink-2 max-md:text-body-sm">{bio}</p> : null}
            <dl aria-label={t.stats} className="flex flex-wrap items-center gap-2 text-body-sm text-ink-3">
              {stats.map(([label, value], index) => (
                <div key={label} className="flex items-center gap-2">
                  {index > 0 ? <span aria-hidden="true" className="text-ink-4">·</span> : null}
                  <dt>{label}</dt>
                  <dd className="font-semibold text-ink tabular-nums">{formatCount(value)}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="flex shrink-0 items-center gap-2 max-md:hidden">
            <ManageLink authorId={author.publicAuthorId} />
            <ShareProfileButton variant="button" />
          </div>
        </header>
        <section aria-labelledby="author-works" className="border-t border-line pt-6">
          <div className="mb-4 flex items-baseline gap-3">
            <h2 id="author-works" className="text-title-2 text-ink">{t.works}</h2>
            <span className="text-body-sm text-ink-3 tabular-nums">{author.counts.works}</span>
          </div>
          {works.items.length
            ? <AuthorWorks key={typeof cursor === 'string' ? cursor : ''} authorId={id} items={works.items} nextCursor={works.nextCursor} />
            : <EmptyState kind="designs" title={t.empty} description={t.emptyHint(author.displayName)} />}
        </section>
      </div>
    </SiteShell>
  );
}
