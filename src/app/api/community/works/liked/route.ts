import { getDb } from '@/lib/auth/db';
import { requireApiActor } from '@/lib/auth/dal';
import { okJson, withApiErrors } from '@/lib/auth/http';
import { listLikedCommunityWorks } from '@/lib/community/discovery';
import { enforceAccountRequestQuota } from '@/lib/security/accountReadQuota';

/** 我喜欢的：只含当前仍公开的作品；读取计入账号的公开读总量。 */
async function get(request: Request) {
  const actor = await requireApiActor('community:interact');
  await enforceAccountRequestQuota(getDb(), { userId: actor.userId, accountCreatedAt: actor.accountCreatedAt });
  const cursor = new URL(request.url).searchParams.get('cursor');
  return okJson(await listLikedCommunityWorks(getDb(), actor.userId, { cursor }), { headers: { 'Cache-Control': 'private, no-store' } });
}

export const GET = withApiErrors(get);
