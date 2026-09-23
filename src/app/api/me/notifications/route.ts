import { getDb } from '@/lib/auth/db';
import { requireApiActor } from '@/lib/auth/dal';
import { okJson, withApiErrors } from '@/lib/auth/http';
import { listNotifications } from '@/lib/notifications/service';
import { enforceMeRateLimit } from '@/lib/security/meRateLimit';

/** 我的通知（D70）：按时间倒序游标分页，附未读总数。 */
async function get(request: Request) {
  const actor = await requireApiActor('community:interact');
  await enforceMeRateLimit(getDb(), actor.userId, 'read');
  const search = new URL(request.url).searchParams;
  const input = Object.fromEntries(['cursor', 'limit'].flatMap((key) => search.get(key) ? [[key, search.get(key)]] : []));
  return okJson(await listNotifications(getDb(), actor.userId, input), { headers: { 'Cache-Control': 'private, no-store' } });
}

export const GET = withApiErrors(get);
