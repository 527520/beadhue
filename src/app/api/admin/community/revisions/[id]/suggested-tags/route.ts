import { z } from 'zod';
import { getDb } from '@/lib/auth/db';
import { requireApiActor } from '@/lib/auth/dal';
import { enforceMutatingGuard } from '@/lib/auth/guard';
import { okJson, readJson, withApiErrors } from '@/lib/auth/http';
import { adoptSuggestedTags } from '@/lib/community/adminService';
import { SUGGESTED_TAG_LIMIT } from '@/lib/community/tagNames';
import { executeIdempotently } from '@/lib/idempotency';

const schema = z.object({ tags: z.array(z.string().max(60)).min(1).max(SUGGESTED_TAG_LIMIT).optional() }).strict();

/** 采纳作者建议标签（D68）：审核员在审核台一键把建议标签加进作品正式标签。 */
async function post(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = enforceMutatingGuard(request);
  if (guard) return guard;
  const actor = await requireApiActor('community:moderate');
  const revisionId = z.uuid().parse((await params).id);
  const body = await readJson(request, 8 * 1024);
  if (!body.ok) return body.response;
  const input = schema.parse(body.data);
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const result = await executeIdempotently(getDb(), {
    actorUserId: actor.userId, capability: 'community:moderate', scope: `admin.community.revision.suggested-tags:${revisionId}`,
    key: request.headers.get('idempotency-key') ?? '', request: input,
  }, (tx) => adoptSuggestedTags(tx, { actor, revisionId, requestId, ...input }));
  return okJson(result.value);
}

export const POST = withApiErrors(post);
