import { z } from 'zod';
import { getDb } from '@/lib/auth/db';
import { requireApiActor } from '@/lib/auth/dal';
import { enforceMutatingGuard } from '@/lib/auth/guard';
import { okJson, readJson, withApiErrors } from '@/lib/auth/http';
import { listCommunityTagsAdmin } from '@/lib/community/tagQueries';
import { createCommunityTag } from '@/lib/community/adminService';
import { executeIdempotently } from '@/lib/idempotency';

/** 新建标签：理由可选（admin-round-3 08）。用户明确要求新增标签不必填操作理由，缺省写固定审计理由。 */
const schema = z.object({ name: z.string(), slug: z.string().optional(), sortOrder: z.number().int().optional(), reason: z.string().optional(), expectedVersion: z.literal(0) }).strict();

async function get(request: Request) {
  await requireApiActor('community:moderate');
  const search = new URL(request.url).searchParams;
  const input = Object.fromEntries(['q', 'page', 'size'].flatMap((key) => search.get(key) ? [[key, search.get(key)]] : []));
  return okJson(await listCommunityTagsAdmin(getDb(), input), { headers: { 'Cache-Control': 'private, no-store' } });
}

async function post(request: Request) {
  const guard = enforceMutatingGuard(request);
  if (guard) return guard;
  const actor = await requireApiActor('community:moderate');
  const body = await readJson(request, 8 * 1024);
  if (!body.ok) return body.response;
  const input = schema.parse(body.data);
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const result = await executeIdempotently(getDb(), {
    actorUserId: actor.userId, capability: 'community:moderate', scope: 'admin.community.tag.create',
    key: request.headers.get('idempotency-key') ?? '', request: input,
  }, (tx) => createCommunityTag(tx, { actor, requestId, ...input }));
  return okJson(result.value, { status: result.replayed ? 200 : 201 });
}

export const GET = withApiErrors(get);
export const POST = withApiErrors(post);
