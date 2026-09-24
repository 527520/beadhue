'use client';

import { useMemo, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { emptyArtPattern, type EmptyArtKind } from '@/lib/render/beads';
import { BeadImage } from './bead-image';

export interface EmptyStateProps {
  kind?: EmptyArtKind;
  title: string;
  description?: string;
  /** 最多一个主按钮；页面已有同一主按钮时只放次按钮。 */
  actions?: ReactNode;
  /** 卡片、表格内的紧凑版。 */
  compact?: boolean;
  /** 整页空状态（404、错误页）用 h1 + title-2。 */
  page?: boolean;
  className?: string;
}

/** 空状态：豆粒插画（空钉板上几颗豆）+ 标题 + 一句说明 + 操作。 */
export function EmptyState({ kind = 'empty', title, description, actions, compact = false, page = false, className }: EmptyStateProps) {
  const art = useMemo(() => emptyArtPattern(kind), [kind]);
  const Heading = page ? 'h1' : 'h3';
  return (
    <div data-slot="empty-state" className={cn('grid justify-items-center gap-2 text-center', compact ? 'px-4 py-6' : 'px-6 py-12', className)}>
      <BeadImage pattern={art} lazy={false} pad={0.04} background="transparent" className={cn('mb-2', compact ? 'size-18' : page ? 'size-36' : 'size-30')} />
      <Heading className={cn('text-balance text-ink', page ? 'text-title-2' : 'text-title-3')}>{title}</Heading>
      {description ? <p className="max-w-measure text-body-sm text-ink-3">{description}</p> : null}
      {actions ? <div className="mt-3 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </div>
  );
}
