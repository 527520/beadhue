import { getDb } from '@/lib/auth/db';
import { okJson, withApiErrors } from '@/lib/auth/http';
import { suggestCommunitySearch } from '@/lib/community/discovery';
import { config } from '@/lib/config';
import { AppError } from '@/lib/errors';
import { enforcePublicIpLimit } from '@/lib/security/publicRateLimit';

/** 搜索建议：标签、作品、作者各 ≤5；空关键词给「大家在搜」。按 IP 独立节流。 */
async function get(request: Request) {
  const q = new URL(request.url).searchParams.get('q') ?? '';
  if (q.trim().length > 40) throw new AppError('VALIDATION', '搜索词最多 40 个字符', 'q');
  await enforcePublicIpLimit(getDb(), request, 'suggest', config.security.searchSuggestRateLimit);
  return okJson(await suggestCommunitySearch(getDb(), q), { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } });
}

export const GET = withApiErrors(get);
