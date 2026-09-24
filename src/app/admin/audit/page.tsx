import { forbidden } from 'next/navigation';
import { authorize } from '@/lib/auth/authorization';
import { getSessionActor } from '@/lib/auth/session';
import { AdminPageHead } from '@/components/admin-ui/page-head';
import { AuditConsole } from '@/components/admin-ui/records';

export default async function AdminAuditPage() {
  if (!authorize(await getSessionActor(), 'audit:read')) forbidden();
  return <><AdminPageHead section="audit" /><AuditConsole /></>;
}
