import { zhCN } from '@/messages/zh-CN';
import { EmptyState } from '@/components/ui/empty-state';
import { StateLink } from '@/components/pages/state-page';
import { AdminCard } from '@/components/admin-ui/parts';

/** 后台内的 403：审核员打开仅管理员可用的模块时留在后台外壳里，回后台总览。 */
export default function AdminForbidden() {
  const t = zhCN.communityAdmin.forbidden;
  return (
    <AdminCard className="grid place-items-center">
      <EmptyState page kind="broken" title={t.adminTitle} description={t.adminBody} actions={<StateLink href="/admin" primary>{t.backOverview}</StateLink>} />
    </AdminCard>
  );
}
