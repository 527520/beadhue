import type { Metadata } from 'next';
import { forbidden, redirect } from 'next/navigation';
import { getSessionActor } from '@/lib/auth/session';
import SessionRefresh from '@/components/admin/SessionRefresh';
import { AdminShell } from '@/components/admin-ui/admin-shell';
import { zhCN } from '@/messages/zh-CN';

export const metadata: Metadata = { title: { default: zhCN.communityAdmin.adminTitle, template: zhCN.communityAdmin.adminTitleTemplate }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await getSessionActor();
  if (!actor) redirect('/login?next=/admin');
  if (!actor.emailVerified || actor.accountStatus !== 'active' || actor.role === 'user') forbidden();
  return <><SessionRefresh /><AdminShell role={actor.role}>{children}</AdminShell></>;
}
