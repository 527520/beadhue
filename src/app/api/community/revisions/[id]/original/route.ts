import { z } from 'zod';
import { LIMITS } from '@/lib/appInfo';
import { getDb } from '@/lib/auth/db';
import { requireApiActor } from '@/lib/auth/dal';
import { enforceBinaryUploadGuard } from '@/lib/auth/guard';
import { okJson, withApiErrors } from '@/lib/auth/http';
import { getSessionActor } from '@/lib/auth/session';
import { readOriginalBody, resolveOriginalAccess, storeRevisionOriginal } from '@/lib/community/originals';
import { getOriginalByteCache } from '@/lib/community/originalCache';
import { getOriginalStore } from '@/lib/community/originalStore';
import { AppError } from '@/lib/errors';
import { entityTag, matchesIfNoneMatch } from '@/lib/security/etag';
import { enforceCommunityWriteLimit, enforceOriginalReadLimit } from '@/lib/security/publicRateLimit';

const idSchema = z.uuid();

/**
 * 上传草稿修订的原图（D49）。请求体是图片字节本身；类型由服务端按魔数嗅探，
 * 不信任 Content-Type。上传与下载都经服务端代理：凭证只在服务端、CSP 不需放行第三方域名。
 */
async function put(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = enforceBinaryUploadGuard(request);
  if (guard) return guard;
  const actor = await requireApiActor('community:interact');
  await enforceCommunityWriteLimit(getDb(), { userId: actor.userId, request });
  const revisionId = idSchema.parse((await params).id);
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > LIMITS.maxFileBytes) throw new AppError('PAYLOAD_TOO_LARGE', '原图超过 20 MB 上限');
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0) throw new AppError('VALIDATION', '原图为空', 'original');
  if (bytes.byteLength > LIMITS.maxFileBytes) throw new AppError('PAYLOAD_TOO_LARGE', '原图超过 20 MB 上限');
  const summary = await storeRevisionOriginal(getDb(), getOriginalStore(), { actor, revisionId, bytes });
  return okJson(summary, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
}

/**
 * 取回原图：仅作者、审核员/管理员、已成功引用者。
 * 内容按 cosKey（含 sha256）不可变：带 ETag + If-None-Match 命中即 304（空体、不取字节），
 * 其余响应 `private, max-age=300, must-revalidate`（不再是 no-store：同一浏览器内可复用 5 分钟）。
 * 限流按账号 + IP 双计（admin-round-3 12），字节命中进程 LRU 时不再打 COS。
 */
async function get(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const revisionId = idSchema.parse((await params).id);
  const db = getDb();
  const actor = await getSessionActor();
  await enforceOriginalReadLimit(db, { userId: actor?.userId ?? null, request });
  const resolved = await resolveOriginalAccess(db, actor, revisionId);
  if (!resolved) throw new AppError('NOT_FOUND', '原图不存在或无权访问');
  const etag = entityTag(resolved.row.sha256);
  const headers = {
    'content-type': resolved.row.mimeType,
    'cache-control': 'private, max-age=300, must-revalidate',
    etag,
    'x-content-type-options': 'nosniff',
    'x-original-access': resolved.access,
  };
  if (matchesIfNoneMatch(request.headers.get('if-none-match'), etag)) {
    return new Response(null, { status: 304, headers });
  }
  const original = await readOriginalBody(getOriginalStore(), resolved.row, getOriginalByteCache());
  return new Response(new Uint8Array(original.body), {
    status: 200,
    headers: {
      ...headers,
      'content-type': original.contentType,
      'content-length': String(original.body.length),
      'content-disposition': 'inline',
    },
  });
}

/** 是否可取回（不传字节）：工作台据此决定是否显示「从豆社取回原图」。 */
async function head(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const revisionId = idSchema.parse((await params).id);
  const actor = await getSessionActor();
  const resolved = await resolveOriginalAccess(getDb(), actor, revisionId);
  if (!resolved) return new Response(null, { status: 404, headers: { 'cache-control': 'private, no-store' } });
  return new Response(null, {
    status: 200,
    headers: {
      'content-type': resolved.row.mimeType,
      'content-length': String(resolved.row.byteSize),
      'cache-control': 'private, no-store',
      'x-original-access': resolved.access,
    },
  });
}

export const PUT = withApiErrors(put);
export const GET = withApiErrors(get);
export const HEAD = withApiErrors(head);
