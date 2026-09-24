import type { Metadata } from 'next';
import { getDb } from '@/lib/auth/db';
import { authorize } from '@/lib/auth/authorization';
import { getSessionActor } from '@/lib/auth/session';
import { listLikedCommunityWorks } from '@/lib/community/discovery';
import { zhCN } from '@/messages/zh-CN';
import { LikesPanel } from '@/components/me/likes/likes-panel';

export const metadata: Metadata = { title: zhCN.shell.mePages.likesTitle };

/** 我的 · 喜欢：第一页由服务端给出，更多用 /api/community/works/liked?cursor= 接着读。 */
export default async function MeLikesPage() {
  const actor = await getSessionActor();
  const liked = actor && authorize(actor, 'community:interact') ? await listLikedCommunityWorks(getDb(), actor.userId) : null;
  return <LikesPanel initial={liked} />;
}
