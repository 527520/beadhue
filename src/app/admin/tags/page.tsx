import { forbidden } from 'next/navigation';
import { authorize } from '@/lib/auth/authorization';
import { getSessionActor } from '@/lib/auth/session';
import { TagsConsole } from '@/components/admin-ui/tags';

export default async function AdminTagsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!authorize(await getSessionActor(), 'community:moderate')) forbidden();
  const q = (await searchParams).q;
  return <TagsConsole initialQ={typeof q === 'string' ? q.slice(0, 60) : undefined} />;
}
