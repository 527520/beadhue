'use client';

import { Compass } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { CommunityListItem } from '@/lib/community/queries';
import { zhCN } from '@/messages/zh-CN';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FormAlert } from '@/components/ui/field';
import { CommunityWorkCard, WorkGrid } from '@/components/works/community-work-card';
import { useLoginDialog } from '@/components/shell/login-dialog';

const l = zhCN.me.likes;

export interface LikedPage {
  items: CommunityListItem[];
  total: number;
  nextCursor: string | null;
}

/** 我的 · 喜欢：与发现页同一张作品卡（可直接取消喜欢），按喜欢时间倒序，每页 24 张。 */
export function LikesPanel({ initial }: { initial: LikedPage | null }) {
  const login = useLoginDialog();
  const router = useRouter();
  const [pages, setPages] = useState<LikedPage | null>(initial);
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setPages(initial);
  }
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!pages) {
    return <EmptyState kind="likes" title={l.loginTitle} description={l.loginText} actions={<Button onClick={() => login?.open({ onSuccess: () => router.refresh() })}>{zhCN.me.login}</Button>} />;
  }
  if (!pages.items.length) {
    return <EmptyState kind="likes" title={l.emptyTitle} description={l.emptyText} actions={<Link href="/" className={buttonVariants({ variant: 'secondary' })}><Compass aria-hidden="true" strokeWidth={1.75} />{l.goDiscover}</Link>} />;
  }
  const more = async () => {
    if (!pages.nextCursor || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/community/works/liked?cursor=${encodeURIComponent(pages.nextCursor)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      const next = (await response.json()) as LikedPage;
      setPages((current) => current && { items: [...current.items, ...next.items.filter((item) => !current.items.some((old) => old.id === item.id))], total: next.total, nextCursor: next.nextCursor });
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };
  return (
    <section aria-label={l.region}>
      <p className="mb-4 text-body-sm text-ink-3"><b className="font-semibold text-ink tabular-nums">{pages.total}</b> {l.countUnit}</p>
      <WorkGrid>
        {pages.items.map((work) => (
          <li key={work.id} className="min-w-0">
            <CommunityWorkCard work={work} />
          </li>
        ))}
      </WorkGrid>
      {pages.nextCursor ? (
        <div className="mt-8 grid justify-items-center gap-2">
          <Button loading={loading} onClick={() => void more()}>{l.loadMore}</Button>
          <FormAlert>{failed ? l.loadFailed : null}</FormAlert>
        </div>
      ) : null}
    </section>
  );
}
