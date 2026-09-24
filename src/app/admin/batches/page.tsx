import { forbidden } from 'next/navigation';
import { authorize } from '@/lib/auth/authorization';
import { getSessionActor } from '@/lib/auth/session';
import { BatchesConsole } from '@/components/admin-ui/batches';

export default async function AdminBatchesPage() {
  if (!authorize(await getSessionActor(), 'official:manage')) forbidden();
  return <BatchesConsole />;
}
