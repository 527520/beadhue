import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { originalAssets } from '@/../db/schema';
import { getDb } from '@/lib/auth/db';
import { getVerifiedSessionUserId } from '@/lib/auth/session';
import { withApiErrors, okJson } from '@/lib/auth/http';
import { AppError } from '@/lib/errors';

/** Metadata-only deduplication works across devices without uploading bytes. */
export const GET = withApiErrors(async (request: Request) => {
  const userId = await getVerifiedSessionUserId();
  if (!userId) throw new AppError('UNAUTHORIZED', '请登录已验证的账号');
  const sha256 = z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(new URL(request.url).searchParams.get('sha256'));
  const [asset] = await getDb()
    .select({
      assetId: originalAssets.id,
      sha256: originalAssets.sha256,
      width: originalAssets.width,
      height: originalAssets.height,
      byteSize: originalAssets.byteSize,
    })
    .from(originalAssets)
    .where(
      and(
        eq(originalAssets.userId, userId),
        eq(originalAssets.sha256, sha256),
        isNull(originalAssets.deletedAt),
      ),
    );
  return okJson({ asset: asset ?? null }, { headers: { 'cache-control': 'private, no-store' } });
});
