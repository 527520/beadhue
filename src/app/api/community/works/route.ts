import { z } from 'zod';
import { getDb } from '@/lib/auth/db';
import { requireApiActor } from '@/lib/auth/dal';
import { enforceMutatingGuard } from '@/lib/auth/guard';
import { okJson, readJson, withApiErrors } from '@/lib/auth/http';
import { getSessionActor } from '@/lib/auth/session';
import { createCommunityWork } from '@/lib/community/service';
import { countPublicCommunityWorks, listPublicCommunityWorks, parseCommunityListUrl } from '@/lib/community/queries';
import { executeIdempotently } from '@/lib/idempotency';
import type { AnyDatabase } from '@/../db/client';
import { enforceAccountRequestQuota, enforceAccountWorkQuota } from '@/lib/security/accountReadQuota';
import { enforceCommunityWriteLimit, enforcePublicReadLimit } from '@/lib/security/publicRateLimit';

const createSchema = z.object({
  designId: z.string().uuid(),
  expectedDesignRevision: z.number().int().positive(),
  title: z.string(),
  licenseVersion: z.string(),
}).strict();

async function get(request: Request) {
  await enforcePublicReadLimit(getDb(), request, 'works');
  // 登录后的公开读同样要计账号配额（IP 桶可被换 IP 绕过）：总量在读库前拦，读库后补记本次返回的作品。
  const actor = await getSessionActor();
  if (actor) {
    await enforceAccountRequestQuota(getDb(), { userId: actor.userId, accountCreatedAt: actor.accountCreatedAt });
  }
  const query = parseCommunityListUrl(request.url);
  const [page, total] = await Promise.all([
    listPublicCommunityWorks(getDb(), query, { viewerUserId: actor?.userId }),
    countPublicCommunityWorks(getDb(), query),
  ]);
  if (actor) {
    enforceAccountWorkQuota({ userId: actor.userId, accountCreatedAt: actor.accountCreatedAt, workIds: page.items.map((item) => item.id) });
  }
  // 登录后每项带「我是否喜欢」，响应因人而异，不进共享缓存。
  return okJson({ ...page, total }, {
    headers: {
      'Cache-Control': actor ? 'private, no-store' : 'public, s-maxage=60, stale-while-revalidate=300',
      Vary: 'Cookie',
    },
  });
}

async function post(request: Request) {
  const guard = enforceMutatingGuard(request);
  if (guard) return guard;
  const actor = await requireApiActor('community:interact');
  await enforceCommunityWriteLimit(getDb(), { userId: actor.userId, request });
  const body = await readJson(request, 32 * 1024);
  if (!body.ok) return body.response;
  const input = createSchema.parse(body.data);
  const create = async (db: AnyDatabase) => {
    const result = await createCommunityWork(db, { actor, ...input });
    return { workId: result.work.id, revisionId: result.revision.id, status: result.revision.status, version: result.revision.version };
  };
  const key = request.headers.get('idempotency-key');
  const result = key === null ? await create(getDb()) : (await executeIdempotently(getDb(), {
    actorUserId: actor.userId, scope: 'community:create', key, request: input, capability: 'community:interact',
  }, create)).value;
  return okJson(result, { status: 201 });
}

export const GET = withApiErrors(get);
export const POST = withApiErrors(post);
