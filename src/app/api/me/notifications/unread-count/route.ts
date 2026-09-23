import { getDb } from '@/lib/auth/db';
import { requireApiActor } from '@/lib/auth/dal';
import { okJson, withApiErrors } from '@/lib/auth/http';
import { countUnreadNotifications } from '@/lib/notifications/service';
import { enforceMeRateLimit } from '@/lib/security/meRateLimit';

/** 未读通知数（D70）：顶栏铃铛在页面聚焦与导航时轮询，只走未读部分索引。 */
async function get() {
  const actor = await requireApiActor('community:interact');
  await enforceMeRateLimit(getDb(), actor.userId, 'read');
  return okJson({ unreadCount: await countUnreadNotifications(getDb(), actor.userId) }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export const GET = withApiErrors(get);
