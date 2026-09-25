import { and, eq, ne } from 'drizzle-orm';
import { sessions } from '@/../db/schema';
import { getDb } from '@/lib/auth/db';
import { requireApiActor } from '@/lib/auth/dal';
import { enforceMutatingGuard } from '@/lib/auth/guard';
import { okJson, withApiErrors } from '@/lib/auth/http';
import { AppError } from '@/lib/errors';
import { currentSessionTokenHash } from '@/lib/me/sessions';
import { enforceMeRateLimit } from '@/lib/security/meRateLimit';

/** 退出其他设备：删除本人除当前会话外的全部会话；天然幂等，返回删掉的数量。 */
async function post(request: Request) {
  const guard = enforceMutatingGuard(request);
  if (guard) return guard;
  const actor = await requireApiActor('community:interact');
  const db = getDb();
  await enforceMeRateLimit(db, actor.userId, 'write');
  const current = await currentSessionTokenHash();
  if (!current) throw new AppError('UNAUTHORIZED', '请先登录');
  const removed = await db.delete(sessions).where(and(eq(sessions.userId, actor.userId), ne(sessions.tokenHash, current))).returning();
  return okJson({ revoked: removed.length }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export const POST = withApiErrors(post);
