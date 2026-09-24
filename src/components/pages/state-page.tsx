'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { EmptyArtKind } from '@/lib/render/beads';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

/** 空状态里的链接按钮（服务端页面不能直接调用 buttonVariants）。 */
export function StateLink({ href, primary = false, children }: { href: string; primary?: boolean; children: ReactNode }) {
  return <Link href={href} className={buttonVariants({ variant: primary ? 'primary' : 'secondary' })}>{children}</Link>;
}

/**
 * 整页空状态（404、错误边界、失效的分享链接）：豆粒插画 + 标题（页面 h1）+ 一句说明 + 最多一个主按钮，
 * 在站点外壳 <main> 的首屏里居中。
 */
export function StatePage({ kind, title, description, actions, footnote }: { kind: EmptyArtKind; title: string; description: string; actions: ReactNode; footnote?: ReactNode }) {
  return (
    <div data-ui="" className="page-container grid min-h-page place-items-center py-8">
      <div className="grid justify-items-center">
        <EmptyState page kind={kind} title={title} description={description} actions={actions} />
        {footnote ? <p className="-mt-8 pb-12 text-caption text-ink-3 tabular-nums">{footnote}</p> : null}
      </div>
    </div>
  );
}
