'use client';

import { BadgeCheck, Heart, Lock, Star } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CommunityListItem, CommunityTagDto, ColorUsageItem, PublicAuthorDto } from '@/lib/community/queries';
import type { Pattern } from '@/lib/types';
import { track } from '@/lib/analytics/client';
import { AVATAR_BEAD_COLORS } from '@/lib/render/beadTokens';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';
import { ensureAuthStatus } from '@/components/account/useAuthStatus';
import { usePublicConfig } from '@/components/config/usePublicConfig';
import { useLoginDialog, useRequireLogin } from '@/components/shell/login-dialog';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { chipVariants } from '@/components/ui/chip';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { FormAlert } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { CommunityWorkCard, WorkGrid } from '../community-work-card';
import { discoverHref, readDiscoverState } from '../discover/discover-state';
import { Discussion } from './discussion';
import { MakeCard } from './make-card';
import { DEFAULT_VIEW, PatternViewer, type ViewSettings, type ViewerSource } from './pattern-viewer';
import { ReportDialog, type ReportTarget } from './report-dialog';
import { useDetailLike } from './use-detail-like';
import { useReuseWork } from './use-reuse-work';
import { MoreMenu, ShareMenu, type ShareWork } from './work-actions';

const t = zhCN.detail;
const iconProps = { 'aria-hidden': true, strokeWidth: 1.75 } as const;

export interface DetailWork {
  id: string;
  title: string;
  author: PublicAuthorDto;
  width: number;
  height: number;
  colorCount: number;
  beadCount: number;
  colorUsage: ColorUsageItem[] | null;
  colorBand: string[];
  pattern: Pattern | null;
  thumbnailUrl: string;
  largeImageUrl: string;
  /** 大图每格像素（未登录查看器的放大上限）。 */
  imageCell: number;
  tags: CommunityTagDto[];
  featured: boolean;
  liked: boolean;
  likes: number;
  comments: number;
  commentsLocked: boolean;
  publishedAt: string;
  /** 服务端算好的「1 天前」，避免水合时间差。 */
  publishedLabel: string;
  publishedTitle: string;
  beadSize: string;
  boardCols: number;
  boardRows: number;
  boards: number;
  paletteLabel: string;
}

export interface DetailViewProps {
  work: DetailWork;
  loggedIn: boolean;
  related: CommunityListItem[];
  byAuthor: CommunityListItem[];
}

export function shareWorkOf(work: DetailWork): ShareWork {
  return {
    id: work.id, title: work.title, authorName: work.author.displayName, authorId: work.author.publicAuthorId,
    width: work.width, height: work.height, colorCount: work.colorCount, beadCount: work.beadCount,
    pattern: work.pattern, largeImageUrl: work.largeImageUrl,
  };
}

export const authorHref = (id: string) => `/u/${encodeURIComponent(id)}`;
const tagHref = (name: string) => discoverHref(readDiscoverState({}), { cat: name });

function LikePill({ liked, count, onToggle, size }: { liked: boolean; count: number; onToggle: () => void; size?: 'lg' }) {
  return (
    <Button variant="outline" size={size} aria-pressed={liked} onClick={onToggle} className={cn('tabular-nums', size === 'lg' && 'min-w-24 shrink-0')}>
      <Heart {...iconProps} className={cn('transition-transform duration-state ease-standard', liked && 'animate-bead-pop fill-heart stroke-heart')} />
      <span className="sr-only">{t.likeLabel}</span>
      <span>{count}</span>
    </Button>
  );
}

/** 相似作品 / 作者的更多作品：只显示一整行（手机 2×2、平板 3、桌面 4 / 5）。 */
function Rail({ id, title, link, items }: { id: string; title: string; link: React.ReactNode; items: CommunityListItem[] }) {
  return (
    <section aria-labelledby={id} className="pt-8 not-first:pt-10 max-md:pt-6 max-md:not-first:pt-8">
      <div className="mb-4 flex items-baseline gap-3">
        <h2 id={id} className="text-title-2 text-ink">{title}</h2>
        <span className="flex-1" />
        {link}
      </div>
      <WorkGrid className="max-md:grid-cols-2">
        {items.slice(0, 5).map((item, index) => (
          <li key={item.id} className={cn('min-w-0', index === 3 && 'md:max-lg:hidden', index === 4 && 'max-xl:hidden')}>
            <CommunityWorkCard work={item} />
          </li>
        ))}
      </WorkGrid>
    </section>
  );
}

/**
 * 作品详情（原型 detail.js，design.md §5.2）：面包屑与标题行 → 左查看器 / 右吸顶制作卡 → 讨论 → 相似作品、作者的更多作品；
 * < 1024 单栏，主操作放进吸底栏。未登录（D53 / D67）只有服务端豆粒大图，色号清单模糊，操作先登录。
 */
export function DetailView({ work, loggedIn, related, byAuthor }: DetailViewProps) {
  const router = useRouter();
  const toast = useToast();
  const login = useLoginDialog();
  const requireLogin = useRequireLogin();
  const exportConfig = usePublicConfig().exportPng;
  const like = useDetailLike(work.id, work.liked, work.likes);
  const reuse = useReuseWork(work.id);
  const [view, setView] = useState<ViewSettings>(DEFAULT_VIEW);
  const [full, setFull] = useState(false);
  const [making, setMaking] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [downloading, setDownloading] = useState(false);
  const pendingDownload = useRef(false);
  const share = shareWorkOf(work);

  useEffect(() => { track({ name: 'community_detail_viewed', properties: {} }); }, []);

  const source = useMemo<ViewerSource>(() => (work.pattern
    ? { kind: 'pattern', pattern: work.pattern }
    : { kind: 'image', src: work.largeImageUrl, imageCell: work.imageCell }), [work.pattern, work.largeImageUrl, work.imageCell]);

  /** 需要登录的操作：未登录先登录，成功后刷新页面（服务端按登录态重渲染）再继续。 */
  const withLogin = (action: () => void) => {
    void ensureAuthStatus().then((before) => {
      requireLogin(() => {
        if (before.kind !== 'user') router.refresh();
        action();
      });
    });
  };
  const openLogin = () => login?.open({ onSuccess: () => router.refresh() });
  const lockedCodes = () => toast(t.viewer.codesLocked, { icon: <Lock {...iconProps} />, action: { label: t.viewer.login, onClick: openLogin } });

  const download = async (pattern: Pattern) => {
    setDownloading(true);
    try {
      const { savePatternPng } = await import('./work-files');
      const result = await savePatternPng(pattern, work.title, { ...exportConfig, boardSize: work.boardCols });
      toast(result === 'ok' ? t.downloadStarted : result === 'too-large' ? t.downloadTooLarge : t.downloadFailed);
      if (result === 'ok') track({ name: 'design_exported', properties: { format: 'png', source: 'community' } });
    } finally {
      setDownloading(false);
    }
  };
  const onDownload = () => {
    if (work.pattern) { void download(work.pattern); return; }
    // 未登录：登录并刷新后图纸才到手，等新数据到了再下载。
    withLogin(() => { pendingDownload.current = true; });
  };
  useEffect(() => {
    if (!work.pattern || !pendingDownload.current) return;
    pendingDownload.current = false;
    void download(work.pattern);
    // download 依赖本次渲染的配置；只在图纸到手时触发一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [work.pattern]);

  const onMake = () => withLogin(() => { reuse.reset(); setMaking(true); });
  const makeLabel = loggedIn ? t.make : t.loginToMake;

  const tag = work.tags[0];
  const verified = work.author.authorType === 'official';
  const others = byAuthor.filter((item) => item.id !== work.id && !related.some((entry) => entry.id === item.id));

  return (
    <div data-ui="" className="page-container pt-6 max-md:pt-0 max-lg:pb-[calc(var(--spacing-control-lg)+56px+env(safe-area-inset-bottom,0px))]">
      <div className="mx-auto grid max-w-prose grid-cols-1 gap-y-6 max-md:max-w-none max-md:gap-y-0 lg:max-w-none lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-x-8 xl:gap-x-12">
        <header className="min-w-0 max-md:pt-4 lg:col-span-2">
          <nav aria-label={t.crumbs} className="mb-2 flex items-center gap-2 text-body-sm text-ink-3 max-md:hidden">
            <Link href="/" className="rounded-sm transition-colors duration-state hover:text-ink">{t.discover}</Link>
            {tag ? (
              <>
                <span aria-hidden="true" className="text-ink-4">/</span>
                <Link href={tagHref(tag.name)} className="rounded-sm transition-colors duration-state hover:text-ink">{tag.name}</Link>
              </>
            ) : null}
          </nav>
          <div className="flex items-start gap-4">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 max-md:grid">
              <h1 id="work-title" className="min-w-0 text-title-1 text-ink">{work.title}</h1>
              {work.featured || work.tags.length ? (
                <div className="flex flex-wrap items-center gap-2 max-md:order-2 max-md:mt-1">
                  {work.featured ? <Badge tone="featured"><Star aria-hidden="true" fill="currentColor" strokeWidth={1.75} />{zhCN.discover.featured}</Badge> : null}
                  {work.tags.map((item) => <Link key={item.id} href={tagHref(item.name)} className={chipVariants()}>{item.name}</Link>)}
                </div>
              ) : null}
              <p className="flex min-w-0 basis-full items-center gap-2 text-body-sm whitespace-nowrap text-ink-3 max-md:order-1">
                <Link href={authorHref(work.author.publicAuthorId)} className="inline-flex min-w-0 items-center gap-2 rounded-full font-medium text-ink hover:[&>span]:underline hover:[&>span]:underline-offset-3">
                  <Avatar id={work.author.publicAuthorId} name={work.author.displayName} color={verified ? AVATAR_BEAD_COLORS[0] : undefined} size="sm" />
                  <span className="truncate">{work.author.displayName}</span>
                </Link>
                {verified ? <BadgeCheck role="img" aria-label={t.officialAccount} strokeWidth={1.75} className="-ml-1 size-4 shrink-0 text-ink" /> : null}
                <span aria-hidden="true">·</span>
                <time dateTime={work.publishedAt} title={work.publishedTitle}>{t.published(work.publishedLabel)}</time>
              </p>
            </div>
            <div className="-mt-1 flex shrink-0 items-center gap-1 max-md:hidden">
              <LikePill liked={like.liked} count={like.count} onToggle={like.toggle} />
              <ShareMenu work={share} />
              <MoreMenu work={share} />
            </div>
          </div>
        </header>
        <div className="min-w-0 max-md:order-first max-md:-mx-gutter lg:col-start-1 lg:row-start-2">
          <PatternViewer
            key={source.kind}
            source={source}
            width={work.width}
            height={work.height}
            boardCols={work.boardCols}
            boardRows={work.boardRows}
            title={work.title}
            colorCount={work.colorCount}
            view={view}
            onViewChange={setView}
            onFull={() => setFull(true)}
            onLocked={lockedCodes}
            onSingleBoard={() => toast(t.viewer.singleBoard)}
          />
        </div>
        <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-2">
          <MakeCard
            width={work.width}
            height={work.height}
            colorCount={work.colorCount}
            beadCount={work.beadCount}
            beadSize={work.beadSize}
            boards={work.boards}
            boardCols={work.boardCols}
            boardRows={work.boardRows}
            paletteLabel={work.paletteLabel}
            colorUsage={work.colorUsage}
            colorBand={work.colorBand}
            loggedIn={loggedIn}
            downloading={downloading}
            onMake={onMake}
            onDownload={onDownload}
            onLogin={openLogin}
          />
        </div>
        <div className="min-w-0 lg:col-start-1 lg:row-start-3">
          <Discussion
            key={loggedIn ? 'user' : 'guest'}
            workId={work.id}
            loggedIn={loggedIn}
            commentsLocked={work.commentsLocked}
            initialCount={work.comments}
            onLogin={openLogin}
            onReport={(commentId) => withLogin(() => setReportTarget({ targetType: 'comment', targetId: commentId }))}
          />
        </div>
      </div>

      {related.length || others.length ? (
        <div className="mt-12 border-t border-line max-md:mt-8">
          {related.length ? (
            <Rail id="detail-related" title={t.related} items={related} link={tag ? <Link href={tagHref(tag.name)} className="shrink-0 text-body-sm text-accent hover:underline">{t.moreInTag(tag.name)}</Link> : null} />
          ) : null}
          {others.length ? (
            <Rail id="detail-by-author" title={t.byAuthor(work.author.displayName)} items={others} link={<Link href={authorHref(work.author.publicAuthorId)} className="shrink-0 text-body-sm text-accent hover:underline">{t.authorHome}</Link>} />
          ) : null}
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-45 flex items-center gap-3 border-t border-line bg-bg/96 px-4 pt-2 pb-[calc(8px+env(safe-area-inset-bottom,0px))] backdrop-blur-md md:justify-end md:px-gutter md:pt-3 md:pb-[calc(12px+env(safe-area-inset-bottom,0px))] lg:hidden">
        <LikePill liked={like.liked} count={like.count} onToggle={like.toggle} size="lg" />
        <Button variant="primary" size="lg" onClick={onMake} className="min-w-0 flex-1 md:max-w-90">{makeLabel}</Button>
      </div>

      <Dialog open={full} onOpenChange={setFull}>
        <DialogContent size="full" aria-label={t.viewer.fullTitle(work.title)} className="h-full max-h-none">
          <DialogHeader><DialogTitle>{work.title}</DialogTitle></DialogHeader>
          <div className="flex min-h-0 flex-1 overflow-hidden px-4 pb-4">
            {full ? (
              <PatternViewer
                source={source}
                width={work.width}
                height={work.height}
                boardCols={work.boardCols}
                boardRows={work.boardRows}
                title={work.title}
                colorCount={work.colorCount}
                view={view}
                onViewChange={setView}
                full
                onExit={() => setFull(false)}
                onLocked={lockedCodes}
                onSingleBoard={() => toast(t.viewer.singleBoard)}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={making} onOpenChange={(open) => { if (!reuse.pending) setMaking(open); }}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>{t.makeTitle}</DialogTitle></DialogHeader>
          <DialogBody className="grid gap-4">
            <div className="flex min-w-0 items-center gap-3 rounded-lg bg-bg-subtle p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- 服务端豆粒缩略图，长期缓存 */}
              <img src={work.thumbnailUrl} alt="" width={56} height={56} className="size-14 shrink-0 rounded-md bg-bg object-contain" />
              <div className="min-w-0 flex-1">
                <b className="block truncate text-title-3 text-ink">{work.title}</b>
                <span className="text-body-sm text-ink-3 tabular-nums">{t.makeMeta(work.width, work.height, work.colorCount, work.beadCount)}</span>
              </div>
            </div>
            <p className="text-body text-ink-2">{t.makeBody}</p>
            <FormAlert>{reuse.error}</FormAlert>
          </DialogBody>
          <DialogFooter>
            <DialogClose render={<Button variant="secondary" disabled={reuse.pending} />}>{t.cancel}</DialogClose>
            <Button variant="primary" autoFocus loading={reuse.pending} onClick={() => void reuse.reuse()}>{reuse.error === t.copyKept ? t.makeRetry : t.makeStart}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} />
    </div>
  );
}
