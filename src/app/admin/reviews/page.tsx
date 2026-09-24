import { forbidden } from 'next/navigation';
import { z } from 'zod';
import { authorize } from '@/lib/auth/authorization';
import { getSessionActor } from '@/lib/auth/session';
import { AdminPageHead } from '@/components/admin-ui/page-head';
import { ReviewConsole } from '@/components/admin-ui/reviews';

export default async function AdminReviewsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!authorize(await getSessionActor(), 'community:moderate')) forbidden();
  const id = z.uuid().safeParse((await searchParams).id);
  return <><AdminPageHead section="reviews" /><ReviewConsole initialId={id.success ? id.data : undefined} /></>;
}
