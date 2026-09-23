import type { Metadata } from 'next';
import { getDb } from '@/lib/auth/db';
import { getSessionActor } from '@/lib/auth/session';
import { listLikedCommunityWorks } from '@/lib/community/discovery';
import { zhCN } from '@/messages/zh-CN';
import { EmptyState } from '@/components/ui/empty-state';
import { SimpleWorkGrid } from '@/components/works/simple-work-grid';
import { GoDiscoverLink, LoginButton } from './login-button';

const t = zhCN.shell.mePages;

export const metadata: Metadata = { title: t.likesTitle };

/** 我的 · 喜欢（骨架：第一页喜欢的图纸；分页与卡片交互由票 06 补齐）。 */
export default async function MeLikesPage() {
  const actor = await getSessionActor();
  const liked = actor ? await listLikedCommunityWorks(getDb(), actor.userId) : null;
  return (
    <section data-ui="" aria-label={t.likesTitle} className="page-container py-6">
      {!liked ? (
        <EmptyState kind="likes" title={t.likesLogin} description={t.likesLoginHint} actions={<LoginButton />} />
      ) : liked.items.length === 0 ? (
        <EmptyState kind="likes" title={t.likesEmpty} description={t.likesEmptyHint} actions={<GoDiscoverLink />} />
      ) : (
        <SimpleWorkGrid items={liked.items} />
      )}
    </section>
  );
}
