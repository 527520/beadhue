import { asc, eq } from 'drizzle-orm';
import { communityTags } from '@/../db/schema';
import { getDb } from '@/lib/auth/db';
import { okJson, withApiErrors } from '@/lib/auth/http';
import { config } from '@/lib/config';
import { enforcePublicIpLimit } from '@/lib/security/publicRateLimit';

/**
 * 标签列表是公开端点：响应带 s-maxage=300，但每次未命中仍要读库，故补每 IP 小时限流。
 * R15-02 起带类目条字段：icon（格式见 lib/community/tagIcon.ts）、sortOrder、featured。
 */
async function get(request: Request) {
  await enforcePublicIpLimit(getDb(), request, 'tags', config.security.tagsRateLimit);
  const items = await getDb().select({
    id: communityTags.id, name: communityTags.name, slug: communityTags.slug,
    icon: communityTags.icon, sortOrder: communityTags.sortOrder, featured: communityTags.featured,
  })
    .from(communityTags).where(eq(communityTags.active, true))
    .orderBy(asc(communityTags.sortOrder), asc(communityTags.name));
  return okJson({ items }, { headers: { 'Cache-Control': 'public, s-maxage=300' } });
}

export const GET = withApiErrors(get);
