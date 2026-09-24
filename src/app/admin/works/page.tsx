import { forbidden } from 'next/navigation';
import { z } from 'zod';
import { authorize } from '@/lib/auth/authorization';
import { getSessionActor } from '@/lib/auth/session';
import { AdminPageHead } from '@/components/admin-ui/page-head';
import { WorksConsole } from '@/components/admin-ui/works';

type Search = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function AdminWorksPage({ searchParams }: { searchParams: Search }) {
  if (!authorize(await getSessionActor(), 'community:moderate')) forbidden();
  const params = await searchParams;
  const id = z.uuid().safeParse(first(params.id) ?? first(params.work));
  const q = first(params.q)?.slice(0, 80);
  return <><AdminPageHead section="works" /><WorksConsole key={`${q ?? ''}|${id.success ? id.data : ''}`} initialQ={q} initialOpenId={id.success ? id.data : undefined} /></>;
}
