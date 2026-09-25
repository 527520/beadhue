import { getDb } from '@/lib/auth/db';
import { requireApiActor } from '@/lib/auth/dal';
import { okJson, withApiErrors } from '@/lib/auth/http';
import { getMyStats } from '@/lib/me/stats';
import { enforceMeRateLimit } from '@/lib/security/meRateLimit';

/** 我的统计：设计数、公开作品数、获赞总数。 */
async function get() {
  const actor = await requireApiActor('community:interact');
  await enforceMeRateLimit(getDb(), actor.userId, 'read');
  return okJson(await getMyStats(getDb(), actor.userId), { headers: { 'Cache-Control': 'private, no-store' } });
}

export const GET = withApiErrors(get);
