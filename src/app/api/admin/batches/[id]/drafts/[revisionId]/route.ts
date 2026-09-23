import { z } from 'zod';
import { getDb } from '@/lib/auth/db';
import { requireApiActor } from '@/lib/auth/dal';
import { enforceMutatingGuard } from '@/lib/auth/guard';
import { okJson, readJson, withApiErrors } from '@/lib/auth/http';
import { reviseOfficialDraft } from '@/lib/community/officialBatch';
import { communitySnapshotSchema } from '@/lib/community/snapshot';
import { executeIdempotently } from '@/lib/idempotency';

// 修订可以带整张图纸快照（格子数组最大 200×200），因此与保存草稿同为 6 MiB。
const MAX_BODY_BYTES = 6 * 1024 * 1024;
const schema = z.object({
  expectedVersion: z.number().int().positive(),
  title: z.string().trim().min(1).max(80).optional(),
  snapshot: communitySnapshotSchema.optional(),
  reason: z.string().trim().min(3).max(500),
}).strict().refine((body) => body.title !== undefined || body.snapshot !== undefined, { message: '请提供要修订的标题或图纸' });
async function patch(request: Request, { params }: { params: Promise<{ id: string; revisionId: string }> }) {
  const guard = enforceMutatingGuard(request); if (guard) return guard;
  const actor = await requireApiActor('official:manage'); const { id, revisionId } = await params;
  const batchId = z.string().uuid().parse(id); const targetRevisionId = z.string().uuid().parse(revisionId);
  const body = await readJson(request, MAX_BODY_BYTES); if (!body.ok) return body.response; const input = schema.parse(body.data);
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const result = await executeIdempotently(getDb(), { actorUserId: actor.userId, capability: 'official:manage', scope: `admin.official-batch.draft:${batchId}:${targetRevisionId}`, key: request.headers.get('idempotency-key') ?? '', request: input },
    (tx) => reviseOfficialDraft(tx, { actor, batchId, revisionId: targetRevisionId, requestId, ...input }));
  return okJson(result.value);
}
export const PATCH = withApiErrors(patch);
