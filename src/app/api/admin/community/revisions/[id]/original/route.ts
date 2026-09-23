import { z } from 'zod';
import { getDb } from '@/lib/auth/db';
import { requireApiActor } from '@/lib/auth/dal';
import { enforceBinaryUploadGuard, enforceMutatingGuard } from '@/lib/auth/guard';
import { checkRateLimit } from '@/lib/auth/rateLimit';
import { okJson, readJson, withApiErrors } from '@/lib/auth/http';
import { assertRevisionOriginalUpload, storeRevisionOriginal } from '@/lib/community/originals';
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

export const PUT = withApiErrors(put);
export const POST = withApiErrors(post);
