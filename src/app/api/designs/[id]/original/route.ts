import { and, eq } from 'drizzle-orm';
import { designs } from '@/../db/schema';
import { measureJsonBytes } from '@/lib/sync/revision';
import { lockDesignStorage } from '@/lib/sync/designQuota';
import { enforceMutatingGuard } from '@/lib/auth/guard';
import { readJson } from '@/lib/auth/http';
import { releasePrivateOriginal } from '@/lib/originals/server';
import type { ProjectFile } from '@/lib/types';
import { z } from 'zod';
import { getDb } from '@/lib/auth/db';
import { getVerifiedSessionUserId } from '@/lib/auth/session';
import { enforceBinaryUploadGuard } from '@/lib/auth/guard';
import { withApiErrors, okJson } from '@/lib/auth/http';
import { enforceOriginalUploadLimit } from '@/lib/security/originalUploadLimit';
import { readOriginalBody } from '@/lib/image/readOriginalBody';
import { getOriginalStore } from '@/lib/community/originalStore';
import { readPrivateOriginal, requireOwnedDesign, storePrivateOriginal } from '@/lib/originals/server';
import { AppError } from '@/lib/errors';

type Context = { params: Promise<{ id: string }> };
async function actor() {
  const userId = await getVerifiedSessionUserId();
  if (!userId) throw new AppError('UNAUTHORIZED', '请登录已验证的账号');
  return userId;
}
export const PUT = withApiErrors(async (request: Request, { params }: Context) => {
  const guard = enforceBinaryUploadGuard(request);
  if (guard) return guard;
  const userId = await actor();
  const id = z.uuid().parse((await params).id);
  const revision = z.coerce.number().int().positive().parse(request.headers.get('if-match'));
  await requireOwnedDesign(getDb(), userId, id, revision);
  await enforceOriginalUploadLimit(getDb(), { userId, request });
  const bytes = await readOriginalBody(request);
  const asset = await storePrivateOriginal(getDb(), getOriginalStore(), {
    userId,
    designId: id,
    revision,
    bytes,
  });
  return okJson(
    {
      assetId: asset.id,
      sha256: asset.sha256,
      byteSize: asset.byteSize,
      width: asset.width,
      height: asset.height,
    },
    { status: 201, headers: { 'cache-control': 'private, no-store' } },
  );
});
export const GET = withApiErrors(async (_request: Request, { params }: Context) => {
  const userId = await actor();
  const id = z.uuid().parse((await params).id);
  const { asset, body } = await readPrivateOriginal(getDb(), getOriginalStore(), userId, id);
  return new Response(new Uint8Array(body), {
    headers: {
      'content-type': asset.mimeType,
      'content-length': String(body.length),
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
});

export const DELETE = withApiErrors(async (request: Request, { params }: Context) => {
  const guard = enforceMutatingGuard(request);
  if (guard) return guard;
  const userId = await actor();
  const id = z.uuid().parse((await params).id);
  const parsed = await readJson(request, 1024);
  if (!parsed.ok) return parsed.response;
  const { baseRevision } = z
    .object({ baseRevision: z.number().int().positive() })
    .strict()
    .parse(parsed.data);
  return getDb().transaction(async (tx) => {
    await lockDesignStorage(tx, userId);
    const row = await requireOwnedDesign(tx, userId, id, baseRevision);
    const project = row.project as ProjectFile;
    const assetId = project.original?.assetId;
    const next = {
      ...project,
      original: project.original ? { ...project.original, assetId: undefined } : undefined,
    };
    const updatedAt = new Date();
    const revision = baseRevision + 1;
    await tx
      .update(designs)
      .set({ project: next, payloadBytes: measureJsonBytes(next), revision, updatedAt })
      .where(and(eq(designs.id, id), eq(designs.userId, userId)));
    if (assetId) await releasePrivateOriginal(tx, userId, assetId);
    return okJson({ revision, updatedAt: updatedAt.toISOString() });
  });
});
