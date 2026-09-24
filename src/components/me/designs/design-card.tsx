'use client';

import { Check, CloudOff, TriangleAlert } from 'lucide-react';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { designThumbnailUrl } from '@/lib/community/thumbnailUrl';
import { thumbnailPixelSize } from '@/lib/render/thumbnailSize';
import { zhCN } from '@/messages/zh-CN';
import { Badge } from '@/components/ui/badge';
import { BeadImage } from '@/components/ui/bead-image';
import { MetaItem, MetaSep } from '@/components/ui/work-card';
import { relativeTime } from '@/components/create/create-model';
import { ActionMenu, type ActionEntry } from '../action-menu';
import { ProgressRing } from '../progress-ring';
import { designStateText, isStitching, type LibraryDesign } from './design-model';

const t = zhCN.me.designs;

/** 普通左键点击交给 onOpen（先确认本机图纸与跟拼进度再跳转）；中键 / 修饰键照常新开标签。 */
export function openClick(event: MouseEvent<HTMLAnchorElement>, onOpen: () => void): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  onOpen();
}

export const openHref = (design: LibraryDesign) => `/app?id=${encodeURIComponent(design.id)}`;

/**
 * 缩略图：已同步的云端设计用服务端按修订渲染的豆粒图（换设备 / 清缓存后也有）；
 * 本机未同步的用本机图纸在浏览器里渲染；两者都没有时写明读不出来。
 */
export function DesignMedia({ design, cloud, className }: { design: LibraryDesign; cloud: boolean; className?: string }) {
  const [failed, setFailed] = useState(false);
  const server = cloud && design.cloudPresent && design.status === 'synced' && design.revision > 0 && design.width > 0 && !failed;
  if (server) {
    const size = thumbnailPixelSize(design.width, design.height);
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 服务端按修订渲染并长期缓存的豆粒缩略图
      <img src={designThumbnailUrl(design.id, design.revision)} alt="" width={size.width} height={size.height} loading="lazy" decoding="async" onError={() => setFailed(true)} className={cn('object-contain', className)} />
    );
  }
  if (design.pattern) return <BeadImage pattern={design.pattern} className={className} />;
  return <span className={cn('grid place-items-center p-2 text-center text-caption font-normal text-ink-3', className)}>{t.unreadable}</span>;
}

/** 图上角标：只在需要时出现（跟拼进度环 / 已公开 / 仅本机或未同步 / 冲突副本）。 */
export function DesignBadges({ design, cloud }: { design: LibraryDesign; cloud: boolean }) {
  const list: ReactNode[] = [];
  if (isStitching(design)) {
    list.push(
      <Badge key="ring" tone="on-image" className="gap-1 pl-1">
        <ProgressRing percent={design.progress ?? 0} />
        <span className="tabular-nums">{design.progress}%</span>
      </Badge>,
    );
  }
  if (design.published) list.push(<Badge key="pub" tone="success"><Check aria-hidden="true" strokeWidth={2} />{t.badges.published}</Badge>);
  if (cloud && design.status === 'conflict') list.push(<Badge key="conflict" tone="warning"><TriangleAlert aria-hidden="true" strokeWidth={2} />{t.badges.conflict}</Badge>);
  else if (cloud && design.status === 'unsynced') {
    list.push(<Badge key="local" tone="on-image"><CloudOff aria-hidden="true" strokeWidth={2} />{design.cloudPresent ? t.badges.unsynced : t.badges.localOnly}</Badge>);
  }
  return list.length ? <>{list}</> : null;
}

export function designMeta(design: LibraryDesign, now: number): ReactNode {
  if (design.width <= 0) return <MetaItem grow>{t.unreadable}</MetaItem>;
  const when = relativeTime(design.updatedAt, now);
  return (
    <>
      <MetaItem>{design.width}×{design.height}</MetaItem>
      {design.colorCount !== null ? (<><MetaSep /><MetaItem>{t.colors(design.colorCount)}</MetaItem></>) : null}
      {when ? (<><MetaSep /><MetaItem grow>{when}</MetaItem></>) : null}
    </>
  );
}

export interface DesignCardProps {
  design: LibraryDesign;
  cloud: boolean;
  now: number;
  opening: boolean;
  entries: readonly ActionEntry[];
  onOpen: () => void;
}

/** 设计卡（原型 designCard）：整卡打开设计；「…」桌面悬停出现，触屏常驻。 */
export function DesignCard({ design, cloud, now, opening, entries, onOpen }: DesignCardProps) {
  const badges = <DesignBadges design={design} cloud={cloud} />;
  return (
    <article data-slot="design-card" aria-busy={opening || undefined} className="group/card @container relative flex min-w-0 flex-col gap-2 rounded-lg sm:gap-2.5">
      <div className="pointer-events-none relative z-1 isolate aspect-square overflow-hidden rounded-lg bg-bg-subtle after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:inset-ring-1 after:inset-ring-ink/5 after:content-['']">
        <div className="size-full transition-transform duration-400 ease-standard motion-safe:group-hover/card:scale-103 [&>*]:size-full">
          <DesignMedia design={design} cloud={cloud} />
        </div>
        <div aria-hidden="true" className="absolute top-2.5 right-12 left-2.5 z-1 flex flex-wrap gap-1.5">{badges}</div>
        {opening ? (
          <span className="absolute inset-0 z-1 grid place-items-center">
            <span className="grid size-10 place-items-center rounded-full bg-bg shadow-float">
              <span className="size-4 animate-spinner rounded-full border-2 border-ink border-r-transparent" />
            </span>
          </span>
        ) : null}
      </div>
      <div className="grid gap-0.5 px-0.5">
        <h3 className="truncate text-body leading-5.5 font-semibold text-ink @max-card-sm:text-body-sm @max-card-sm:leading-5">{design.name}</h3>
        <p className="flex min-w-0 items-center gap-1.5 text-footnote leading-5 text-ink-3 @max-card-sm:text-caption @max-card-sm:leading-4.5 @max-card-sm:font-normal">{designMeta(design, now)}</p>
      </div>
      <a href={openHref(design)} onClick={(event) => openClick(event, onOpen)} aria-label={t.openLabel(design.name, designStateText(design, cloud))} className="absolute inset-0 z-0 rounded-lg focus-visible:focus-ring" />
      <div className="absolute top-2 right-2 z-2 transition-opacity duration-state pointer-fine:opacity-0 pointer-fine:group-hover/card:opacity-100 pointer-fine:group-focus-within/card:opacity-100 pointer-fine:has-data-popup-open:opacity-100">
        <ActionMenu label={zhCN.me.more(design.name)} title={design.name} entries={entries} />
      </div>
    </article>
  );
}
