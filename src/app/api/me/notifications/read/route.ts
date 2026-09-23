import { z } from 'zod';
import { getDb } from '@/lib/auth/db';
import { requireApiActor } from '@/lib/auth/dal';
import { enforceMutatingGuard } from '@/lib/auth/guard';
import { okJson, readJson, withApiErrors } from '@/lib/auth/http';
import { executeIdempotently } from '@/lib/idempotency';
import { markNotificationsRead } from '@/lib/notifications/service';
import { enforceMeRateLimit } from '@/lib/security/meRateLimit';

const schema = z.object({ ids: z.array(z.uuid()).max(100).optional() }).strict();

/**
 * 标记通知已读（D70）：`{ ids }` 只标这些（仅本人的），缺省全部已读。
 * 本身天然幂等；带 Idempotency-Key 时按现有写接口模式回放首次结果。
 */
async function post(request: Request) {
  const guard = enforceMutatingGuard(request);
  if (guard) return guard;
  const actor = await requireApiActor('community:interact');
  await enforceMeRateLimit(getDb(), actor.userId, 'write');
  const body = await readJson(request, 8 * 1024);
  if (!body.ok) return body.response;
  const input = schema.parse(body.data);
  const key = request.headers.get('idempotency-key');
  const result = key === null
    ? await markNotificationsRead(getDb(), actor.userId, input.ids)
    : (await executeIdempotently(getDb(), {
      actorUserId: actor.userId, scope: 'me.notifications.read', key, request: input, capability: 'community:interact',
    }, (tx) => markNotificationsRead(tx, actor.userId, input.ids))).value;
  return okJson(result, { headers: { 'Cache-Control': 'private, no-store' } });
}

export const POST = withApiErrors(post);
