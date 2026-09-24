'use client';

import { Compass } from 'lucide-react';
import Link from 'next/link';
import { useState, type MouseEvent } from 'react';
import type { CommunityListItem } from '@/lib/community/queries';
import { zhCN } from '@/messages/zh-CN';
import { useAuthStatus } from '@/components/account/useAuthStatus';
import { Button, buttonVariants } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { CommunityWorkCard, WorkCardSkeleton, WorkGrid } from '@/components/works/community-work-card';

const t = zhCN.detail.author;

/** 作者不存在时回到发现页（次按钮）。 */
export function DiscoverLink() {
  return (
    <Link href="/" className={buttonVariants({ variant: 'secondary' })}>
      <Compass aria-hidden="true" strokeWidth={1.75} />
      {t.goDiscover}
    </Link>
  );
}

/** 本人查看自己的主页时多一个「管理公开作品」。 */
export function ManageLink({ authorId }: { authorId: string }) {
  const auth = useAuthStatus();
  if (auth.kind !== 'user' || auth.publicAuthorId !== authorId) return null;
  return <Link href="/me/public" className={buttonVariants({ variant: 'ghost' })}>{t.manage}</Link>;
}

/** 作品网格 + 加载更多：带游标的普通链接（无脚本也能翻页），有脚本时就地追加。 */
export function AuthorWorks({ authorId, items, nextCursor }: { authorId: string; items: CommunityListItem[]; nextCursor: string | null }) {
  const toast = useToast();
  const [more, setMore] = useState<CommunityListItem[]>([]);
  const [cursor, setCursor] = useState(nextCursor);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const base = `/u/${encodeURIComponent(authorId)}`;
  const load = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!cursor || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    const params = new URLSearchParams({ author: authorId, sort: 'new', cursor });
    void fetch(`/api/community/works?${params}`)
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { items?: CommunityListItem[]; nextCursor?: string | null } | null;
        if (!response.ok || !Array.isArray(body?.items)) throw new Error('load failed');
        const page = body.items;
        setMore((previous) => [...previous, ...page]);
        setCursor(body.nextCursor ?? null);
        setLoaded(true);
      })
      .catch(() => toast(t.loadFailed))
      .finally(() => setLoading(false));
  };
  const seen = new Set(items.map((item) => item.id));
  const works = [...items, ...more.filter((item) => !seen.has(item.id))];
  return (
    <>
      <WorkGrid>
        {works.map((work, index) => (
          <li key={work.id} className="min-w-0">
            <CommunityWorkCard work={work} eager={index < 6} />
          </li>
        ))}
        {loading ? Array.from({ length: 5 }, (_, index) => <WorkCardSkeleton key={`skeleton-${index}`} />) : null}
      </WorkGrid>
      {cursor || loaded ? (
        <div className="flex justify-center pt-10 pb-2">
          {loading ? <Button variant="secondary" loading>{t.loadMore}</Button>
            : cursor ? <Link href={`${base}?cursor=${encodeURIComponent(cursor)}`} onClick={load} className={buttonVariants({ variant: 'secondary' })}>{t.loadMore}</Link>
              : <Button variant="secondary" disabled>{t.end}</Button>}
        </div>
      ) : null}
    </>
  );
}
