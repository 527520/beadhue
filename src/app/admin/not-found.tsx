import { zhCN } from '@/messages/zh-CN';
import { EmptyState } from '@/components/ui/empty-state';
import { StateLink } from '@/components/pages/state-page';
import { AdminCard } from '@/components/admin-ui/parts';

/** 后台内的 404：留在后台外壳里，回后台总览。 */
export default function AdminNotFound() {
  const t = zhCN.communityAdmin.adminNotFound;
  return (
    <AdminCard className="grid place-items-center">
      <EmptyState page kind="lost" title={t.title} description={t.body} actions={<StateLink href="/admin" primary>{t.back}</StateLink>} />
    </AdminCard>
  );
}
