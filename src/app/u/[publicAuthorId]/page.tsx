import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getDb } from '@/lib/auth/db';
import { getSessionActor } from '@/lib/auth/session';
import { getCommunityAuthor } from '@/lib/community/discovery';
import { listPublicCommunityWorks, parseCommunityListUrl } from '@/lib/community/queries';
import { zhCN } from '@/messages/zh-CN';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { MobileTopBack, MobileTopTitle } from '@/components/shell/mobile-topbar';
import { SiteShell } from '@/components/shell/site-shell';
import { SimpleWorkGrid } from '@/components/works/simple-work-grid';
import { ShareProfileButton } from './share-button';

const t = zhCN.shell.author;
const loadAuthor = cache(async (id: string) => (id.length <= 80 ? getCommunityAuthor(getDb(), id) : null));

export async function generateMetadata({ params }: { params: Promise<{ publicAuthorId: string }> }): Promise<Metadata> {
  const author = await loadAuthor(decodeURIComponent((await params).publicAuthorId));
  if (!author) return { title: t.notFound, robots: { index: false, follow: false } };
  return { title: `${author.displayName}${t.titleSuffix}` };
}

/** 作者主页骨架（D66）：头像、名字、官方徽标、统计与作品网格；分页、分享图等由票 05 补齐。 */
export default async function AuthorPage({ params }: { params: Promise<{ publicAuthorId: string }> }) {
  const id = decodeURIComponent((await params).publicAuthorId);
  const author = await loadAuthor(id);
  if (!author) notFound();
  const actor = await getSessionActor();
  const works = await listPublicCommunityWorks(getDb(), parseCommunityListUrl(`http://local/?${new URLSearchParams({ author: id, sort: 'new' })}`), { includeTags: false, viewerUserId: actor?.userId });
  const stats = [[t.works, author.counts.works], [t.likes, author.counts.likes], [t.reuses, author.counts.reuses]] as const;
  return (
    <SiteShell nav={null} topbarCta="secondary" mobileTop={<><MobileTopBack /><MobileTopTitle>{author.displayName}</MobileTopTitle><ShareProfileButton /></>}>
      <div data-ui="" className="page-container py-8 max-md:py-5">
        <header className="flex items-center gap-5 max-md:gap-4">
          <Avatar id={author.publicAuthorId} name={author.displayName} size="xl" />
          <div className="grid min-w-0 gap-1.5">
            <h1 className="flex items-center gap-2 text-title-1 text-ink">
              <span className="truncate">{author.displayName}</span>
              {author.authorType === 'official' ? <Badge tone="official">{t.official}</Badge> : null}
            </h1>
            <dl aria-label={t.stats} className="flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-ink-3">
              {stats.map(([label, value]) => (
                <div key={label} className="flex gap-1">
                  <dt>{label}</dt>
                  <dd className="font-semibold text-ink tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </header>
        <section aria-labelledby="author-works" className="mt-8">
          <h2 id="author-works" className="mb-4 text-title-2 text-ink">{t.worksTitle}</h2>
          {works.items.length ? <SimpleWorkGrid items={works.items} /> : <EmptyState kind="designs" title={t.empty} description={t.emptyHint} />}
        </section>
      </div>
    </SiteShell>
  );
}
