import { forbidden } from 'next/navigation';
import { getDb } from '@/lib/auth/db';
import { authorize } from '@/lib/auth/authorization';
import { getSessionActor } from '@/lib/auth/session';
import { getAdminOverview } from '@/lib/admin/overview';
import { getAdminTrends } from '@/lib/admin/trends';
import { getServiceStatus } from '@/lib/admin/serviceStatus';
import { listCommunityReviewQueue } from '@/lib/community/queries';
import { listGovernanceComments, listGovernanceReports } from '@/lib/community/interactions';
import { summarizeModerationToday } from '@/lib/moderation/commentModeration';
import { AdminPageHead } from '@/components/admin-ui/page-head';
import { OverviewView, type TodoItem } from '@/components/admin-ui/overview';

/** 后台总览（原型 admin/overview.js）：四张指标卡、跨队列待办前 5、近 7 天趋势、服务状态。 */
export default async function AdminOverviewPage() {
  const actor = await getSessionActor();
  if (!authorize(actor, 'community:moderate')) forbidden();
  const includeSystem = authorize(actor, 'system:read');
  const db = getDb();
  const [overview, trends, reviews, comments, reports, services, moderation] = await Promise.all([
    getAdminOverview(db, { includeSystem }),
    getAdminTrends(db, { days: 7 }),
    listCommunityReviewQueue(db, { size: 10 }),
    listGovernanceComments(db, { size: 10 }),
    listGovernanceReports(db, { size: 10 }),
    includeSystem ? getServiceStatus(db) : Promise.resolve(null),
    includeSystem ? summarizeModerationToday(db) : Promise.resolve(null),
  ]);
  const todo: TodoItem[] = [
    ...reviews.items.map((item) => ({
      kind: 'review' as const, id: item.revisionId, at: item.submittedAt, title: item.title, revisionId: item.revisionId,
      revisionNumber: item.revisionNumber, who: item.author.displayName, href: `/admin/reviews?id=${item.revisionId}`,
    })),
    ...comments.items.map((item) => ({
      kind: 'comment' as const, id: item.id, at: item.createdAt.toISOString(), title: item.body, status: item.status,
      who: item.authorName, href: `/admin/comments?id=${item.id}`,
    })),
    ...reports.items.map((item) => ({
      kind: 'report' as const, id: item.id, at: item.createdAt.toISOString(), title: item.category, target: item.targetType,
      href: `/admin/reports?id=${item.id}`,
    })),
  ].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
  return (
    <>
      <AdminPageHead section="overview" />
      <OverviewView
        counts={overview}
        trends={trends.items}
        todo={todo.slice(0, 5)}
        todoTotal={overview.pendingRevisions + overview.pendingComments + overview.openReports}
        services={services}
        moderation={moderation ? { calls: moderation.calls, budget: moderation.budget } : null}
        updatedAt={new Date().toISOString()}
      />
    </>
  );
}
