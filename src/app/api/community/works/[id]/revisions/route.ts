import { z } from 'zod';
import { getDb } from '@/lib/auth/db';
import { requireApiActor } from '@/lib/auth/dal';
import { enforceMutatingGuard } from '@/lib/auth/guard';
import { okJson, readJson, withApiErrors } from '@/lib/auth/http';
import { createCommunityRevision } from '@/lib/community/service';
import { executeIdempotently } from '@/lib/idempotency';
import type { AnyDatabase } from '@/../db/client';

const bodySchema = z.object({
  designId: z.string().uuid(),
  expectedDesignRevision: z.number().int().positive(),
  title: z.string(),
  licenseVersion: z.string(),
  suggestedTags: z.array(z.string().max(60)).max(20).optional(),
  /** 这次不上传新原图，要求沿用上一版；沿用不了返回 ORIGINAL_REQUIRED 且不建草稿。 */
  inheritOriginal: z.boolean().optional(),
}).strict();

async function post(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = enforceMutatingGuard(request);
  if (guard) return guard;
  const actor = await requireApiActor('community:interact');
  const workId = z.string().uuid().parse((await params).id);
  const body = await readJson(request, 32 * 1024);
  if (!body.ok) return body.response;
  const input = bodySchema.parse(body.data);
  const { inheritOriginal, ...fields } = input;
  const create = async (db: AnyDatabase) => {
    const revision = await createCommunityRevision(db, { actor, workId, ...fields, requireInheritedOriginal: inheritOriginal });
    return { revisionId: revision.id, status: revision.status, version: revision.version, originalInherited: revision.originalInherited };
  };
  const key = request.headers.get('idempotency-key');
  const result = key === null ? await create(getDb()) : (await executeIdempotently(getDb(), {
    actorUserId: actor.userId, scope: `community:revision:${workId}`, key, request: input, capability: 'community:interact',
  }, create)).value;
  return okJson(result, { status: 201 });
}

export const POST = withApiErrors(post);
