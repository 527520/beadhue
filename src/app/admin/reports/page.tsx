import { forbidden } from 'next/navigation';
import { z } from 'zod';
import { authorize } from '@/lib/auth/authorization';
import { getSessionActor } from '@/lib/auth/session';
import { AdminPageHead } from '@/components/admin-ui/page-head';
import { ReportsConsole } from '@/components/admin-ui/governance';

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!authorize(await getSessionActor(), 'community:moderate')) forbidden();
  const id = z.uuid().safeParse((await searchParams).id);
  return <><AdminPageHead section="reports" /><ReportsConsole initialOpenId={id.success ? id.data : undefined} /></>;
}
