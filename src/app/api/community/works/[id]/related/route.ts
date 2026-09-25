import { z } from 'zod';
import { getDb } from '@/lib/auth/db';
import { okJson, withApiErrors } from '@/lib/auth/http';
import { getSessionActor } from '@/lib/auth/session';
import { listRelatedCommunityWorks, RELATED_DEFAULT_LIMIT, RELATED_MAX_LIMIT } from '@/lib/community/discovery';
import { AppError } from '@/lib/errors';
import { enforceAccountRequestQuota } from '@/lib/security/accountReadQuota';
import { enforcePublicReadLimit } from '@/lib/security/publicRateLimit';

const limitSchema = z.coerce.number().int().min(1).max(RELATED_MAX_LIMIT).default(RELATED_DEFAULT_LIMIT);

/**
 * 相似作品：公开读，按 IP 计小时窗口；登录后另计账号总量（不计「不同作品数」，
 * 否则每看一张详情就吃掉 8 件额度）。登录响应带喜欢标记，不进共享缓存。
 */
async function get(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) throw new AppError('NOT_FOUND', '作品不存在');
  const limit = limitSchema.parse(new URL(request.url).searchParams.get('limit') ?? undefined);
  await enforcePublicReadLimit(getDb(), request, 'related');
  const actor = await getSessionActor();
  if (actor) await enforceAccountRequestQuota(getDb(), { userId: actor.userId, accountCreatedAt: actor.accountCreatedAt });
  const items = await listRelatedCommunityWorks(getDb(), id.data, { limit, viewerUserId: actor?.userId });
  if (!items) throw new AppError('NOT_FOUND', '作品不存在');
  return okJson({ items }, {
    headers: { 'Cache-Control': actor ? 'private, no-store' : 'public, s-maxage=300, stale-while-revalidate=600', Vary: 'Cookie' },
  });
}

export const GET = withApiErrors(get);
