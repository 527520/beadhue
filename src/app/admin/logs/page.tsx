import { forbidden } from 'next/navigation';
import { authorize } from '@/lib/auth/authorization';
import { getSessionActor } from '@/lib/auth/session';
import { AdminPageHead } from '@/components/admin-ui/page-head';
import { LogsConsole } from '@/components/admin-ui/records';

/** 运行日志：错误行里带堆栈与调用链，能力用 audit:read，只给管理员看。 */
export default async function AdminLogsPage() {
  if (!authorize(await getSessionActor(), 'audit:read')) forbidden();
  return <><AdminPageHead section="logs" /><LogsConsole /></>;
}
