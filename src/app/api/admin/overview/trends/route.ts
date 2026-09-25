import { getDb } from '@/lib/auth/db';
import { requireApiActor } from '@/lib/auth/dal';
import { okJson, withApiErrors } from '@/lib/auth/http';
import { getAdminTrends } from '@/lib/admin/trends';

/** 后台总览趋势：与总览页同一受众（审核员与管理员）。 */
async function get(request: Request) {
  await requireApiActor('community:moderate');
  const days = new URL(request.url).searchParams.get('days');
  return okJson(await getAdminTrends(getDb(), days === null ? {} : { days }), { headers: { 'Cache-Control': 'private, no-store' } });
}

export const GET = withApiErrors(get);
