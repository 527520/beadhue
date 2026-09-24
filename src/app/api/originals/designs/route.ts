import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { designs, originalAssets } from '@/../db/schema';
import { getDb } from '@/lib/auth/db';
import { getVerifiedSessionUserId } from '@/lib/auth/session';
import { okJson, withApiErrors } from '@/lib/auth/http';
import { AppError } from '@/lib/errors';
import { enforceMeRateLimit } from '@/lib/security/meRateLimit';

/**
 * 管理原图（R15-06 账号设置）：本人每份仍绑定云端原图的设计与原图大小，按大小降序。
 * 删除沿用 DELETE /api/designs/:id/original（带 baseRevision，只解绑原图，不动图纸）。
 */
export const GET = withApiErrors(async () => {
  const userId = await getVerifiedSessionUserId();
  if (!userId) throw new AppError('UNAUTHORIZED', '请登录已验证的账号');
  const db = getDb();
  await enforceMeRateLimit(db, userId, 'read');
  const rows = await db
    .select({ designId: designs.id, name: designs.name, revision: designs.revision, byteSize: originalAssets.byteSize, width: originalAssets.width, height: originalAssets.height })
    .from(designs)
    .innerJoin(originalAssets, sql`${designs.project}->'original'->>'assetId' = ${originalAssets.id}::text`)
    .where(and(eq(designs.userId, userId), isNull(designs.deletedAt), eq(originalAssets.userId, userId), isNull(originalAssets.deletedAt)))
    .orderBy(desc(originalAssets.byteSize), desc(designs.updatedAt));
  return okJson({ items: rows }, { headers: { 'cache-control': 'private, no-store' } });
});
