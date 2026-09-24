import { and, desc, eq, gt } from 'drizzle-orm';
import { sessions } from '@/../db/schema';
import { getDb } from '@/lib/auth/db';
import { requireApiActor } from '@/lib/auth/dal';
import { okJson, withApiErrors } from '@/lib/auth/http';
import { currentSessionTokenHash } from '@/lib/me/sessions';
import { enforceMeRateLimit } from '@/lib/security/meRateLimit';

/**
 * 登录设备（R15-06 账号设置）：本人未过期的会话，只给登录时间与是否当前设备。
 * 会话表不记录设备型号与地点（隐私合同不变），界面只写「这台设备 / 其他设备」。
 */
async function get() {
  const actor = await requireApiActor('community:interact');
  const db = getDb();
  await enforceMeRateLimit(db, actor.userId, 'read');
  const current = await currentSessionTokenHash();
  const now = new Date();
  const rows = await db
    .select({ tokenHash: sessions.tokenHash, createdAt: sessions.createdAt })
    .from(sessions)
    .where(and(eq(sessions.userId, actor.userId), gt(sessions.expiresAt, now), gt(sessions.absoluteExpiresAt, now)))
    .orderBy(desc(sessions.createdAt));
  const items = rows
    .map((row) => ({ current: row.tokenHash === current, createdAt: row.createdAt.toISOString() }))
    .sort((a, b) => Number(b.current) - Number(a.current));
  return okJson({ items, count: items.length }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export const GET = withApiErrors(get);
