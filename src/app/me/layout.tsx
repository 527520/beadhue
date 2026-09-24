import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getDb } from '@/lib/auth/db';
import { getSessionActor } from '@/lib/auth/session';
import { getMyProfile, profileDisplayName } from '@/lib/me/profile';
import { getMyStats } from '@/lib/me/stats';
import { zhCN } from '@/messages/zh-CN';
import type { MeViewer } from '@/components/me/me-context';
import { MeShell } from './me-shell';

export const metadata: Metadata = { title: { default: zhCN.shell.mePages.title, template: `%s - ${zhCN.app.name}` }, robots: { index: false, follow: false } };

/** 服务端读出登录者与页头统计，首屏就是完整头部（切换页签时布局不重渲染，统计由客户端按需刷新）。 */
export default async function MeLayout({ children }: { children: ReactNode }) {
  const actor = await getSessionActor();
  const db = getDb();
  const profile = actor ? await getMyProfile(db, actor.userId) : null;
  const viewer: MeViewer | null = actor && profile
    ? {
        name: profileDisplayName(profile),
        email: profile.email,
        username: profile.username,
        avatarId: profile.publicAuthorId ?? profile.email,
        avatarColor: profile.avatarColor,
        publicAuthorId: profile.publicAuthorId,
        verified: actor.emailVerified,
        passwordChangedAt: profile.passwordChangedAt?.toISOString() ?? null,
      }
    : null;
  const stats = actor && viewer?.verified ? await getMyStats(db, actor.userId) : null;
  return <MeShell viewer={viewer} stats={stats}>{children}</MeShell>;
}
