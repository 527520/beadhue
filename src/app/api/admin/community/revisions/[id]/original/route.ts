import { z } from 'zod';
import { LIMITS } from '@/lib/appInfo';
import { getDb } from '@/lib/auth/db';
import { requireApiActor } from '@/lib/auth/dal';
import { enforceBinaryUploadGuard } from '@/lib/auth/guard';
import { checkRateLimit } from '@/lib/auth/rateLimit';
import { okJson, withApiErrors } from '@/lib/auth/http';
import { storeRevisionOriginal } from '@/lib/community/originals';
import { getOriginalStore } from '@/lib/community/originalStore';
import { config } from '@/lib/config';
import { AppError } from '@/lib/errors';

/**
 * 管理端原图上传（admin-round-3 10）。
 *
 * 官方批次此前走 `/api/community/revisions/:id/original`：那是豆社公开写接口，
 * 每账号每小时 120 次，一个 50 张的批次就吃掉一半额度。
 * 这里给管理员一条专用路径，按账号单独计量；权限仍由 `storeRevisionOriginal` 的
 * 「官方修订 + official:manage」判定把关，公开阈值完全不动。
 */
async function put(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = enforceBinaryUploadGuard(request);
  if (guard) return guard;
  const actor = await requireApiActor('official:manage');
  const db = getDb();
  const allowed = await checkRateLimit(db, `admin:original:${actor.userId}`, config.security.adminOriginalRateLimit);
  if (!allowed) throw new AppError('RATE_LIMITED', '上传过于频繁，请稍后再试');
  const revisionId = z.uuid().parse((await params).id);
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > LIMITS.maxFileBytes) throw new AppError('PAYLOAD_TOO_LARGE', '原图超过 20 MB 上限');
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0) throw new AppError('VALIDATION', '原图为空', 'original');
  if (bytes.byteLength > LIMITS.maxFileBytes) throw new AppError('PAYLOAD_TOO_LARGE', '原图超过 20 MB 上限');
  const summary = await storeRevisionOriginal(db, getOriginalStore(), { actor, revisionId, bytes });
  return okJson(summary, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
}

export const PUT = withApiErrors(put);
