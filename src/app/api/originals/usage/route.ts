import { and, isNull, eq, sum, count } from 'drizzle-orm';
import { originalAssets } from '@/../db/schema';
import { getDb } from '@/lib/auth/db';
import { getVerifiedSessionUserId } from '@/lib/auth/session';
import { withApiErrors, okJson } from '@/lib/auth/http';
import { AppError } from '@/lib/errors';
import { config } from '@/lib/config';
export const GET = withApiErrors(async () => {
  const userId = await getVerifiedSessionUserId();
  if (!userId) throw new AppError('UNAUTHORIZED', '请登录已验证的账号');
  const [usage] = await getDb()
    .select({ bytes: sum(originalAssets.byteSize), images: count() })
    .from(originalAssets)
    .where(and(eq(originalAssets.userId, userId), isNull(originalAssets.deletedAt)));
  return okJson(
    { bytes: Number(usage.bytes ?? 0), images: usage.images, quotaBytes: config.security.originalQuotaBytes },
    { headers: { 'cache-control': 'private, no-store' } },
  );
});
