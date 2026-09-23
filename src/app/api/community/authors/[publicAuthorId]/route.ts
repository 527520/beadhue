import { z } from 'zod';
import { getDb } from '@/lib/auth/db';
import { okJson, withApiErrors } from '@/lib/auth/http';
import { getSessionActor } from '@/lib/auth/session';
import { getCommunityAuthor } from '@/lib/community/discovery';
import { AppError } from '@/lib/errors';
import { enforceAccountRequestQuota } from '@/lib/security/accountReadQuota';
import { enforcePublicReadLimit } from '@/lib/security/publicRateLimit';

/** 作者主页（R15-02）：展示名、作者类型与公开作品统计；作品列表用 /api/community/works?author=。 */
async function get(request: Request, { params }: { params: Promise<{ publicAuthorId: string }> }) {
  const publicAuthorId = z.string().trim().max(80).parse((await params).publicAuthorId);
  await enforcePublicReadLimit(getDb(), request, 'author');
  const actor = await getSessionActor();
  if (actor) await enforceAccountRequestQuota(getDb(), { userId: actor.userId, accountCreatedAt: actor.accountCreatedAt });
  const author = await getCommunityAuthor(getDb(), publicAuthorId);
  if (!author) throw new AppError('NOT_FOUND', '作者不存在');
  return okJson(author, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } });
}

export const GET = withApiErrors(get);
