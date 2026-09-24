import { getDb } from '@/lib/auth/db';
import { requireApiActor } from '@/lib/auth/dal';
import { okJson, withApiErrors } from '@/lib/auth/http';
import { listAuditActors } from '@/lib/admin/queries';

/** 审计记录「操作人」筛选的候选。 */
async function get() {
  await requireApiActor('audit:read');
  return okJson({ items: await listAuditActors(getDb()) }, { headers: { 'Cache-Control': 'private, no-store' } });
}
export const GET = withApiErrors(get);
