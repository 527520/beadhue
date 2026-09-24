import { forbidden } from 'next/navigation';
import { authorize } from '@/lib/auth/authorization';
import { getSessionActor } from '@/lib/auth/session';
import { AdminPageHead } from '@/components/admin-ui/page-head';
import { UsersConsole } from '@/components/admin-ui/users';

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await getSessionActor();
  if (!actor || !authorize(actor, 'users:manage')) forbidden();
  const q = (await searchParams).q;
  return <><AdminPageHead section="users" /><UsersConsole currentUserId={actor.userId} initialQ={typeof q === 'string' ? q.slice(0, 80) : undefined} /></>;
}
