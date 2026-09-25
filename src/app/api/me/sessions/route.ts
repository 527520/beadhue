import { and, desc, eq, gt } from 'drizzle-orm';
import { sessions } from '@/../db/schema';
import { getDb } from '@/lib/auth/db';
import { requireApiActor } from '@/lib/auth/dal';
import { okJson, withApiErrors } from '@/lib/auth/http';
import { currentSessionTokenHash } from '@/lib/me/sessions';
import { enforceMeRateLimit } from '@/lib/security/meRateLimit';

/**
 * 登录设备：本人未过期的会话——登录时间、是否当前设备，以及登录时归纳的「系统 · 浏览器」。
 * 会话表不存完整浏览器标识、网络地址与位置；迁移前创建的会话没有设备名，界面写「这台设备 / 其他设备」。
 */
async function get() {
  const actor = await requireApiActor('community:interact');
  const db = getDb();
  await enforceMeRateLimit(db, actor.userId, 'read');
  const current = await currentSessionTokenHash();
  const now = new Date();
  const rows = await db
    .select({ tokenHash: sessions.tokenHash, createdAt: sessions.createdAt, deviceLabel: sessions.deviceLabel })
    .from(sessions)
    .where(and(eq(sessions.userId, actor.userId), gt(sessions.expiresAt, now), gt(sessions.absoluteExpiresAt, now)))
    .orderBy(desc(sessions.createdAt));
  const items = rows
    .map((row) => ({ current: row.tokenHash === current, createdAt: row.createdAt.toISOString(), label: row.deviceLabel }))
    .sort((a, b) => Number(b.current) - Number(a.current));
  return okJson({ items, count: items.length }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export const GET = withApiErrors(get);
