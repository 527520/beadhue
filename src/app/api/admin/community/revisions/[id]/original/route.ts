import { z } from 'zod';
import { getDb } from '@/lib/auth/db';
import { requireApiActor } from '@/lib/auth/dal';
import { enforceBinaryUploadGuard, enforceMutatingGuard } from '@/lib/auth/guard';
import { checkRateLimit } from '@/lib/auth/rateLimit';
import { okJson, readJson, withApiErrors } from '@/lib/auth/http';
import { assertRevisionOriginalUpload, readOriginalBody as readStoredOriginal, resolveOriginalAccess, storeRevisionOriginal } from '@/lib/community/originals';
import { getOriginalByteCache } from '@/lib/community/originalCache';
import { entityTag, matchesIfNoneMatch } from '@/lib/security/etag';
import { enforceOriginalReadLimit } from '@/lib/security/publicRateLimit';
import { getOriginalStore } from '@/lib/community/originalStore';
import { config } from '@/lib/config';
import { AppError } from '@/lib/errors';
import { readOriginalBody } from '@/lib/image/readOriginalBody';
import { attachPrivateOriginalToRevision } from '@/lib/originals/server';
import { enforceOriginalUploadLimit } from '@/lib/security/originalUploadLimit';

/**
 * 管理端原图上传（admin-round-3 10）。
 *
 * 官方批次此前走 `/api/community/revisions/:id/original`：那是豆社公开写接口，
 * 一个 50 张的批次就会吃掉公开额度。这里给管理员一条专用路径，按账号单独计量
 * `admin:original`；权限仍由「官方修订 + official:manage」判定把关，公开阈值完全不动。
 * 所有二进制原图入口共用的上传计数（originalUploadLimit）照常生效，不设角色豁免；
 * 鉴权、资源资格与限流都在读取请求体之前完成。
 */
async function put(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = enforceBinaryUploadGuard(request);
  if (guard) return guard;
  const actor = await requireApiActor('official:manage');
  const db = getDb();
  const allowed = await checkRateLimit(db, `admin:original:${actor.userId}`, config.security.adminOriginalRateLimit);
  if (!allowed) throw new AppError('RATE_LIMITED', '上传过于频繁，请稍后再试');
  const revisionId = z.uuid().parse((await params).id);
  await assertRevisionOriginalUpload(db, actor, revisionId);
  await enforceOriginalUploadLimit(db, { userId: actor.userId, request });
  const bytes = await readOriginalBody(request);
  const summary = await storeRevisionOriginal(db, getOriginalStore(), { actor, revisionId, bytes });
  return okJson(summary, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
}

/** 关联本人已上传的原图资产（上传队列按 sha256 复用成功资产）：不传字节，也不占二进制上传额度。 */
async function post(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = enforceMutatingGuard(request);
  if (guard) return guard;
  const actor = await requireApiActor('official:manage');
  const revisionId = z.uuid().parse((await params).id);
  const parsed = await readJson(request, 1024);
  if (!parsed.ok) return parsed.response;
  const { assetId } = z.object({ assetId: z.uuid() }).strict().parse(parsed.data);
  return okJson(await attachPrivateOriginalToRevision(getDb(), { actor, revisionId, assetId }));
}

/**
 * 审核台读取原图（R15-10）：后台页面不再请求豆社公开接口（admin-round-3 10），
 * 这里与公开路径同一套访问判定、ETag 与原图读取限流，只要求审核权限。
 */
async function get(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireApiActor('community:moderate');
  const revisionId = z.uuid().parse((await params).id);
  const db = getDb();
  await enforceOriginalReadLimit(db, { userId: actor.userId, request });
  const resolved = await resolveOriginalAccess(db, actor, revisionId);
  if (!resolved) throw new AppError('NOT_FOUND', '原图不存在或无权访问');
  const etag = entityTag(resolved.row.sha256);
  const headers = { 'cache-control': 'private, max-age=300, must-revalidate', etag, 'x-content-type-options': 'nosniff' };
  if (matchesIfNoneMatch(request.headers.get('if-none-match'), etag)) return new Response(null, { status: 304, headers });
  const original = await readStoredOriginal(getOriginalStore(), resolved.row, getOriginalByteCache());
  return new Response(new Uint8Array(original.body), {
    status: 200,
    headers: { ...headers, 'content-type': original.contentType, 'content-length': String(original.body.length), 'content-disposition': 'inline' },
  });
}

export const GET = withApiErrors(get);
export const PUT = withApiErrors(put);
export const POST = withApiErrors(post);
