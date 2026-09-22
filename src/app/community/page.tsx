import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/layout/SiteHeader';
import { ButtonLink } from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import CommunityThumbnail from '@/components/community/CommunityThumbnail';
import { CommunityListImpression } from '@/components/community/CommunityImpression';
import { getDb } from '@/lib/auth/db';
import { listPopularCommunityTags, listPublicCommunityWorks, parseCommunityListUrl, type CommunityListQuery } from '@/lib/community/queries';
import { communityTagHref } from '@/lib/community/tagHref';
import { zhCN } from '@/messages/zh-CN';
import CommunityFilters from '@/components/community/CommunityFilters';
import { AppError } from '@/lib/errors';

export const metadata: Metadata = { title: zhCN.communityAdmin.communityTitle, description: zhCN.communityAdmin.communityDescription };

function InvalidFilters() {
  const t = zhCN.communityAdmin.community;
  return <main id="main" className="workspace-page"><SiteHeader title={t.headerTitle} currentPath="/community" /><section className="community-empty pegboard"><span className="empty-state-icon" aria-hidden="true"><Icon name="filter" size={26} /></span><h2>{t.invalidFilters}</h2><p>{t.invalidFiltersHint}</p><ButtonLink variant="primary" icon="close" href="/community">{t.clearFilters}</ButtonLink></section></main>;
}

export default async function CommunityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = zhCN.communityAdmin.community;
  const params = await searchParams;
  const url = new URL('http://local/community');
  if (!params.sort) url.searchParams.set('sort', 'featured');
  for (const [key, raw] of Object.entries(params)) if (typeof raw === 'string') url.searchParams.set(key, raw);
  let query: CommunityListQuery;
  try { query = parseCommunityListUrl(url.toString()); } catch { return <InvalidFilters />; }
  let result: Awaited<ReturnType<typeof listPublicCommunityWorks>>;
  let popularTags: Awaited<ReturnType<typeof listPopularCommunityTags>> = [];
  try { [result, popularTags] = await Promise.all([listPublicCommunityWorks(getDb(), query), listPopularCommunityTags(getDb())]); }
  catch (error) { if (error instanceof AppError && error.code === 'VALIDATION') return <InvalidFilters />; throw error; }
  const activeFilters = ['q', 'author', 'tag', 'boardProfile', 'palette', 'from', 'to'].some((key) => url.searchParams.has(key) && url.searchParams.get(key) !== '');
  const nextParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (typeof value === 'string') nextParams.set(key, value);
  const returnTo = `/community?${nextParams}`;
  nextParams.delete('cursor');
  if (result.nextCursor) nextParams.set('cursor', result.nextCursor);
  const withoutTag = new URLSearchParams(nextParams); withoutTag.delete('tag'); withoutTag.delete('cursor');
  const activeTag = query.tag ? popularTags.find((tag) => tag.name.toLocaleLowerCase('zh-CN') === query.tag!.toLocaleLowerCase('zh-CN') || tag.slug === query.tag)?.name ?? query.tag : null;
  return (
    <main id="main" className="workspace-page">
      <SiteHeader title={t.headerTitle} currentPath="/community" primaryActions={<ButtonLink variant="secondary" size="sm" icon="folder" href="/community/mine">{t.mine}</ButtonLink>} />
      <CommunityListImpression sort={query.sort} />
      <div className="container discovery-page">
        <section className="intro"><div><div className="eyebrow">{zhCN.beadhue.discoveryEyebrow}</div><h1>{zhCN.beadhue.discoveryTitle}</h1><p>{zhCN.beadhue.discoveryIntro}</p></div><Link href="/app" className="button intro-action"><Icon name="plus" />{zhCN.beadhue.createFromImage}</Link></section>
        {!activeFilters && result.items.length > 0 && <section className="featured" aria-label={zhCN.beadhue.featured}>
          {result.items.slice(0, 2).map((work, index) => <Link key={work.id} className={index === 0 ? 'feature-art' : 'feature-aside'} href={`/community/${work.id}`}>
            <div className={index === 0 ? 'feature-copy' : undefined}>
              {index === 0 ? <span className="pill">{work.featured ? zhCN.beadhue.weeklyInspiration : zhCN.beadhue.dailyInspiration}</span> : <div className="eyebrow">{zhCN.beadhue.startFavorite}</div>}
              {index === 0 ? <h2>{work.title}</h2> : <h3>{work.title}</h3>}
              <p>{work.colorCount} {zhCN.beadhue.heroColorSuffix}</p>
              <span className="text-link">{zhCN.beadhue.viewPattern}<Icon name="arrow" /></span>
            </div>
            <div className="feature-image"><CommunityThumbnail revisionId={work.revisionId} width={work.width} height={work.height} label={t.preview(work.title)} loading="eager" /></div>
          </Link>)}
        </section>}
        <CommunityFilters key={JSON.stringify(query)} query={query} />
        {<nav className="chip-row" aria-label={t.tagBar}>
          <Link href="/community" className={`chip${!activeTag ? ' active' : ''}`}>{zhCN.beadhue.all}</Link>
          {activeTag && <Link href={`/community?${withoutTag}`} className="chip active" aria-label={t.clearTag(activeTag)}>{t.activeTag(activeTag)} ×</Link>}
          {popularTags.filter((tag) => tag.name !== activeTag).map((tag) => <Link key={tag.id} href={communityTagHref(tag.name)} className="chip">{tag.name}<small>{tag.count}</small></Link>)}
        </nav>}
        {activeFilters && result.items.length > 0 && <Link href="/community" className="link-soft">{t.clearFilters}</Link>}
        {result.items.length === 0 ? <section className="community-empty pegboard"><span className="empty-state-icon" aria-hidden="true"><Icon name={activeFilters ? 'search' : 'grid'} size={26} /></span><h2>{activeFilters ? t.noMatch : t.emptyTitle}</h2><p>{activeFilters ? t.noMatchHint : t.emptyBody}</p><ButtonLink variant="primary" icon={activeFilters ? 'close' : 'folder'} href={activeFilters ? '/community' : '/designs'}>{activeFilters ? t.clearFilters : t.chooseDesign}</ButtonLink></section> : (
          <><div className="browse-head"><h2>{zhCN.beadhue.galleryTitle}</h2><small>{result.items.length} {zhCN.beadhue.patternCountSuffix}{result.nextCursor ? zhCN.beadhue.moreAvailable : ''}</small></div>
          <div className="work-grid">{result.items.map((work) => (
            <article key={work.id} className="work-card">
              <Link href={`/community/${work.id}?returnTo=${encodeURIComponent(returnTo)}`} className="work-image">
                <CommunityThumbnail revisionId={work.revisionId} width={work.width} height={work.height} label={t.preview(work.title)} />
                {work.featured && <span className="pill">{zhCN.beadhue.weeklyFeatured}</span>}<span className="image-save"><Icon name="arrow" /></span>
              </Link>
              <h3><Link href={`/community/${work.id}?returnTo=${encodeURIComponent(returnTo)}`}>{work.title}</Link></h3>
              <div className="work-meta"><span className="mono">{work.width} × {work.height} · {work.colorCount} {zhCN.beadhue.colorSuffix}</span><span className="swatches" role="img" aria-label={t.colorBand(work.colorCount)}>{work.preview.colorBand.map(color => <i key={color} style={{ backgroundColor: color }} />)}</span></div>
              <div className="card-footer"><span className="author"><span className="author-dot">{work.author.displayName.charAt(0)}</span>{work.author.displayName}</span><span><Icon name="heart" size={12} /> {work.counts.likes}</span></div>
            </article>
          ))}</div></>

        )}
        {result.nextCursor && <div className="community-more"><ButtonLink variant="secondary" size="sm" icon="chevron-down" href={`/community?${nextParams}`}>{t.next}</ButtonLink></div>}
      </div>
    </main>
  );
}
