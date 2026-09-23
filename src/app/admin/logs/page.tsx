import { forbidden } from 'next/navigation';
import { authorize } from '@/lib/auth/authorization';
import { getSessionActor } from '@/lib/auth/session';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { zhCN } from '@/messages/zh-CN';
import LogsExplorer from './LogsExplorer';

/**
 * 运行日志（用户第 15 条）。
 * 能力用 audit:read：错误行里带堆栈与调用链，只给管理员看，普通审核员进不来。
 */
export default async function AdminLogsPage() {
  if (!authorize(await getSessionActor(), 'audit:read')) forbidden();
  const t = zhCN.communityAdmin.pages.logs;
  return <main id="main" className="admin-page">
    <AdminPageHeader eyebrow={t.eyebrow} title={t.title} description={t.description} />
    <LogsExplorer />
  </main>;
}
