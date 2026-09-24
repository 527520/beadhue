import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteShell } from '@/components/shell/site-shell';
import { DetailMobileTop } from '@/components/works/detail/detail-mobile-top';
import { DetailView, type DetailWork } from '@/components/works/detail/detail-view';
import { longDate, relativeTime } from '@/components/works/detail/detail-format';
import { getDb } from '@/lib/auth/db';
import { getSessionActor } from '@/lib/auth/session';
import { listRelatedCommunityWorks } from '@/lib/community/discovery';
import { getPublicCommunityWork, likedWorkIds, listPublicCommunityWorks, parseCommunityListUrl } from '@/lib/community/queries';
import { communityThumbnailUrl } from '@/lib/community/thumbnailUrl';
import { DEFAULT_BOARD_PROFILE_ID, getBoardProfile, isBoardProfileId } from '@/lib/boardProfiles';
import { isBuiltinPaletteId, listBuiltinPalettes } from '@/lib/palettes';
import { boardCount } from '@/lib/render/viewer';
import { thumbnailCellSize, thumbnailPixelSize } from '@/lib/render/thumbnailSize';
import { zhCN } from '@/messages/zh-CN';

const RAIL_SIZE = 5;

async function load(id: string, includeSnapshot = false) {
  if (!/^[0-9a-f-]{36}$/iu.test(id)) return null;
  return getPublicCommunityWork(getDb(), id, { includeSnapshot });
}

/** 色号清单右侧的色板名：内置色板「名称 N 色」，自定义色板统称。 */
function paletteLabel(palette: { kind: string; id: string | null }): string {
  if (palette.kind !== 'builtin' || !palette.id) return zhCN.detail.customPalette;
  const summary = isBuiltinPaletteId(palette.id) ? listBuiltinPalettes().find((item) => item.id === palette.id) : undefined;
  return summary ? zhCN.detail.paletteName(summary.label, summary.engineColorCount) : palette.id;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const work = await load((await params).id);
  if (!work) return { title: zhCN.communityAdmin.communityMissing, robots: { index: false, follow: false } };
  const image = thumbnailPixelSize(work.width, work.height);
  return {
    title: work.title,
    description: zhCN.communityAdmin.detail.metadataDescription(work.author.displayName, work.width, work.height),
    openGraph: {
      title: work.title,
      description: zhCN.communityAdmin.detail.openGraphDescription(work.author.displayName),
      images: [{ url: communityThumbnailUrl(work.revisionId), width: image.width, height: image.height, alt: work.title }],
    },
  };
}

/**
 * 作品详情（D66 `/community/[id]`，票 05）：匿名访客只拿服务端豆粒大图与统计，不下发完整图纸网格、
 * 色板 JSON 与色号清单（ADR-0021 / D53）；相似作品与作者的更多作品随首屏服务端渲染。
 */
export default async function CommunityDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await getSessionActor();
  const loggedIn = Boolean(actor);
  const work = await load((await params).id, loggedIn);
  if (!work) notFound();
  const db = getDb();
  const [related, byAuthor, liked] = await Promise.all([
    listRelatedCommunityWorks(db, work.id, { limit: RAIL_SIZE, viewerUserId: actor?.userId }),
    listPublicCommunityWorks(db, parseCommunityListUrl(`http://local/?${new URLSearchParams({ author: work.author.publicAuthorId, sort: 'new' })}`), { includeTags: false, viewerUserId: actor?.userId }),
    likedWorkIds(db, actor?.userId, [work.id]),
  ]);
  const candidate = (await searchParams)?.returnTo;
  // 回到来时的发现页（含筛选）；旧的 /community?… 地址仍接受，重定向会带着参数回到 /。
  const returnTo = typeof candidate === 'string' && candidate.length <= 2000 && /^\/(?:community)?\?/u.test(candidate) && !/[\\\r\n]/u.test(candidate) ? candidate : '/';
  const board = getBoardProfile(isBoardProfileId(work.boardProfile) ? work.boardProfile : DEFAULT_BOARD_PROFILE_ID);
  const detail: DetailWork = {
    id: work.id,
    title: work.title,
    author: work.author,
    width: work.width,
    height: work.height,
    colorCount: work.colorCount,
    beadCount: work.beadCount,
    colorUsage: work.colorUsage,
    colorBand: work.preview.colorBand,
    pattern: work.snapshot?.pattern ?? null,
    thumbnailUrl: work.thumbnailUrl,
    largeImageUrl: work.largeImageUrl,
    imageCell: thumbnailCellSize(work.width, work.height, 'large'),
    tags: work.tags,
    featured: work.featured,
    liked: liked.has(work.id),
    likes: work.counts.likes,
    comments: work.counts.comments,
    commentsLocked: work.commentsLocked,
    publishedAt: work.publishedAt,
    publishedLabel: relativeTime(work.publishedAt),
    publishedTitle: longDate(work.publishedAt),
    beadSize: `${board.beadDiameterMm}mm`,
    boardCols: board.boardCols,
    boardRows: board.boardRows,
    boards: boardCount(work.width, work.height, board.boardCols, board.boardRows),
    paletteLabel: paletteLabel(work.palette),
  };
  const share = {
    id: work.id, title: work.title, authorName: work.author.displayName, authorId: work.author.publicAuthorId,
    width: work.width, height: work.height, colorCount: work.colorCount, beadCount: work.beadCount,
    pattern: null, largeImageUrl: work.largeImageUrl,
  };
  return (
    <SiteShell nav="discover" topbarCta="secondary" tabbar={false} mobileTop={<DetailMobileTop work={share} backHref={returnTo} />}>
      <DetailView work={detail} loggedIn={loggedIn} related={related ?? []} byAuthor={byAuthor.items.slice(0, RAIL_SIZE * 2)} />
    </SiteShell>
  );
}
