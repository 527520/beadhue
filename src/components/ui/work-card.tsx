import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * 作品卡 / 设计卡外框：图纸即卡片——正方形图区、圆角 16、静置无阴影；整卡是一个链接，
 * 图区叠在链接之上但不接收点击，只有角上的按钮可点。元信息按卡片自身宽度（容器查询）取舍。
 */
export interface WorkCardProps {
  href: string;
  /** 整卡链接的可访问名称，如「查看「橘猫团子」」。 */
  linkLabel: string;
  title: string;
  /** 图区内容（服务端缩略图 <img> 或 <BeadImage>）。 */
  media: ReactNode;
  /** 左上角徽标。 */
  badges?: ReactNode;
  /** 右上角按钮（点赞 / 更多）；hoverOnly 时桌面悬停才出现。 */
  action?: ReactNode;
  actionHoverOnly?: boolean;
  meta: ReactNode;
  className?: string;
}

export function WorkCard({ href, linkLabel, title, media, badges, action, actionHoverOnly, meta, className }: WorkCardProps) {
  return (
    <article data-slot="work-card" className={cn('group/card @container relative flex min-w-0 flex-col gap-2 rounded-lg sm:gap-2.5', className)}>
      <div className="pointer-events-none relative z-1 isolate aspect-square overflow-hidden rounded-lg bg-bg-subtle after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:inset-ring-1 after:inset-ring-ink/5 after:content-['']">
        <div className="size-full transition-transform duration-400 ease-standard motion-safe:group-hover/card:scale-103 [&>*]:size-full [&>img]:object-contain">{media}</div>
        {badges ? <div className="absolute top-2.5 left-2.5 z-1 flex gap-1.5">{badges}</div> : null}
        {action ? (
          <div
            className={cn(
              'pointer-events-auto absolute top-2 right-2 z-1',
              actionHoverOnly && 'opacity-0 transition-opacity duration-state group-focus-within/card:opacity-100 group-hover/card:opacity-100 pointer-coarse:opacity-100',
            )}
          >
            {action}
          </div>
        ) : null}
      </div>
      <div className="grid gap-0.5 px-0.5">
        <h3 className="truncate text-body leading-5.5 font-semibold text-ink @max-card-sm:text-body-sm @max-card-sm:leading-5">{title}</h3>
        <div className="flex min-w-0 items-center gap-1.5 text-footnote leading-5 text-ink-3 @max-card-sm:text-caption @max-card-sm:leading-4.5 @max-card-sm:font-normal">{meta}</div>
      </div>
      <Link href={href} aria-label={linkLabel} className="absolute inset-0 z-0 rounded-lg focus-visible:focus-ring" />
    </article>
  );
}

/** 作品卡元信息里的「·」分隔。wide 为 true 时卡片窄于 270px 隐藏（尺寸这类次要信息）。 */
export function MetaSep({ wide }: { wide?: boolean }) {
  return (
    <span aria-hidden="true" className={cn('shrink-0', wide && '@max-card-md:hidden')}>
      ·
    </span>
  );
}

export function MetaItem({ children, wide, grow }: { children: ReactNode; wide?: boolean; grow?: boolean }) {
  return <span className={cn(grow ? 'min-w-0 truncate' : 'shrink-0 whitespace-nowrap tabular-nums', wide && '@max-card-md:hidden')}>{children}</span>;
}

/** 作品卡上的用色小圆豆（最多 6 颗，卡片变窄时减少）。 */
export function BeadDots({ colors, className }: { colors: readonly string[]; className?: string }) {
  return (
    <span aria-hidden="true" className={cn('ml-auto inline-flex shrink-0 gap-0.5', className)}>
      {colors.slice(0, 6).map((hex, index) => (
        <i
          key={`${hex}-${index}`}
          className={cn('size-2 rounded-full inset-ring-1 inset-ring-ink/8 @max-card-sm:size-1.75', index >= 4 && '@max-card-md:hidden', index >= 3 && '@max-card-sm:hidden')}
          style={{ backgroundColor: hex }}
        />
      ))}
    </span>
  );
}
