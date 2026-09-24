import type { Metadata } from 'next';
import { getDb } from '@/lib/auth/db';
import { authorize } from '@/lib/auth/authorization';
import { getSessionActor } from '@/lib/auth/session';
import { listOwnCommunityWorks } from '@/lib/community/queries';
import { zhCN } from '@/messages/zh-CN';
import { toOwnItems } from '@/components/me/public/own-works-model';
import { PublicWorksPanel } from '@/components/me/public/public-works-panel';

export const metadata: Metadata = { title: zhCN.shell.mePages.publicTitle };

/** 我的 · 公开作品（原 /community/mine）：审核进度、未通过原因与撤回。 */
export default async function MePublicPage() {
  const actor = await getSessionActor();
  const allowed = actor !== null && authorize(actor, 'community:interact');
  const items = allowed ? toOwnItems(await listOwnCommunityWorks(getDb(), actor.userId), Date.now()) : null;
  return <PublicWorksPanel items={items} guest={!allowed} />;
}
