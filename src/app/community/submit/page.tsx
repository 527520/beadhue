import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { SiteShell } from '@/components/shell/site-shell';
import { StateLink } from '@/components/pages/state-page';
import { EmptyState } from '@/components/ui/empty-state';
import { getSessionActor } from '@/lib/auth/session';
import { getDb } from '@/lib/auth/db';
import { users } from '@/../db/schema';
import { listOwnCommunityWorks } from '@/lib/community/queries';
import { zhCN } from '@/messages/zh-CN';

export const metadata: Metadata = { title: zhCN.communityAdmin.submitTitle, robots: { index: false, follow: false } };

export default async function CommunitySubmitPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams ?? {};
  const initialDesignId = typeof query.designId === 'string' ? query.designId.slice(0, 100) : '';
  const workId = typeof query.workId === 'string' ? query.workId.slice(0, 100) : undefined;
  const next = new URLSearchParams();
  if (initialDesignId) next.set('designId', initialDesignId);
  if (workId) next.set('workId', workId);
  const actor = await getSessionActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(`/community/submit${next.size ? `?${next}` : ''}`)}`);
  const [account] = await getDb().select({ email: users.email }).from(users)
    .where(and(eq(users.id, actor.userId), eq(users.accountStatus, 'active')));
  if (!account?.email) notFound();
  const work = workId ? (await listOwnCommunityWorks(getDb(), actor.userId)).find((item) => item.id === workId) : null;
  if (workId && (!z.string().uuid().safeParse(workId).success || !work)) notFound();
  const unavailable = work && (work.lifecycleStatus !== 'active' || work.revisions.some((item) => item.status === 'draft' || item.status === 'pending_review'));
  const t = zhCN.communityAdmin.submission;
  if (actor.emailVerified && !unavailable) {
    // D72：投稿只剩深链入口——打开这张设计的编辑器并弹出「公开到豆社」（带 workId 为修改后重投）。
    if (!initialDesignId) redirect('/me');
    const target = new URLSearchParams({ id: initialDesignId, publish: '1' });
    if (workId) target.set('workId', workId);
    redirect(`/app?${target}`);
  }
  return (
    <SiteShell nav="me" topbarCta="secondary" tabbar={false}>
      <div data-ui="" className="page-container py-8 md:py-10"><div className="mx-auto max-w-prose">
        <header className="mb-6 grid gap-1">
          <h1 className="text-title-1 text-ink">{workId ? t.editTitle : t.pageTitle}</h1>
          <p className="text-body-sm text-ink-3">{t.pageSubtitle}</p>
        </header>
        {!actor.emailVerified
          ? <EmptyState compact title={t.verifyTitle} description={t.verifyHelp} actions={<StateLink href="/me/settings" primary>{t.verifyAction}</StateLink>} />
          : <EmptyState compact title={t.unavailableTitle} description={t.unavailableHelp} actions={<StateLink href="/me/public" primary>{t.mine}</StateLink>} />}
      </div></div>
    </SiteShell>
  );
}
