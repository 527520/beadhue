/**
 * GET /api/designs/:id/thumbnail?rev=：私人设计的豆粒缩略图（D67，仅本人可读）。
 *
 * - 地址里的 `rev` 与设计当前修订一致时按 `private, max-age=31536000, immutable` 长期缓存并给 ETag；
 *   不一致（列表过期、设计刚被改过）照常返回当前图，但 `private, no-store`，避免把新图缓存到旧地址。
 * - 每次请求都计「按账号」的读配额（含 304），鉴权与配额都在读取设计正文之前。
 * - 他人的、已删除的与不存在的设计一律 404，不区分。
 */
import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { designs } from '@/../db/schema';
import { LIMITS } from '@/lib/appInfo';
import { getDb } from '@/lib/auth/db';
import { withApiErrors } from '@/lib/auth/http';
import { checkRateLimit } from '@/lib/auth/rateLimit';
import { getVerifiedSessionUserId } from '@/lib/auth/session';
import { config } from '@/lib/config';
import { AppError } from '@/lib/errors';
import { renderPatternThumbnail } from '@/lib/render/thumbnail';
import { getThumbnailCache } from '@/lib/render/thumbnailCache';
import { THUMBNAIL_RENDER_VERSION } from '@/lib/render/thumbnailSize';
import { entityTag, matchesIfNoneMatch } from '@/lib/security/etag';
import type { Pattern } from '@/lib/types';

const revisionSchema = z.coerce.number().int().positive().max(2_147_483_647);

/** 云端设计在写入时已按项目协议校验；这里只做渲染所需的结构检查，不再全量解析。 */
function readPattern(project: unknown): Pattern | null {
  const pattern = (project as { pattern?: Partial<Pattern> } | null)?.pattern;
  if (!pattern || !Number.isInteger(pattern.width) || !Number.isInteger(pattern.height) || !Array.isArray(pattern.cells)) return null;
  const { width, height, cells } = pattern as Pattern;
  const max = LIMITS.targetWidth.max;
  if (width < 1 || height < 1 || width > max || height > max || cells.length !== width * height) return null;
  return pattern as Pattern;
}

function thumbnailHeaders(designId: string, revision: number, requested: number | null) {
  const digest = createHash('sha256').update(`${designId}:${revision}:v${THUMBNAIL_RENDER_VERSION}`).digest('hex');
  return {
    etag: entityTag(digest),
    'cache-control': requested === revision ? 'private, max-age=31536000, immutable' : 'private, no-store',
  };
}

async function get(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getVerifiedSessionUserId();
  if (!userId) throw new AppError('UNAUTHORIZED', '未登录');
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) throw new AppError('NOT_FOUND', '设计不存在');
  const rawRevision = new URL(request.url).searchParams.get('rev');
  const parsedRevision = rawRevision === null ? null : revisionSchema.safeParse(rawRevision);
  if (parsedRevision && !parsedRevision.success) throw new AppError('VALIDATION', '修订号无效', 'rev');
  const requested = parsedRevision?.data ?? null;
  const db = getDb();
  if (!(await checkRateLimit(db, `design:thumbnail:${userId}`, config.security.designThumbnailRateLimit))) {
    throw new AppError('RATE_LIMITED', '读取过于频繁，请稍后再试');
  }
  const owned = and(eq(designs.id, id.data), eq(designs.userId, userId), isNull(designs.deletedAt));
  const [current] = await db.select({ revision: designs.revision }).from(designs).where(owned);
  if (!current) throw new AppError('NOT_FOUND', '设计不存在');
  const headers = thumbnailHeaders(id.data, current.revision, requested);
  if (matchesIfNoneMatch(request.headers.get('if-none-match'), headers.etag)) {
    return new Response(null, { status: 304, headers });
  }
  const cache = getThumbnailCache();
  const cacheKey = (revision: number) => `design:${id.data}:${revision}:v${THUMBNAIL_RENDER_VERSION}`;
  let png = cache.get(cacheKey(current.revision));
  let revision = current.revision;
  if (!png) {
    // 修订号与正文同一条查询取出：两次读之间设计被改时，缓存键与 ETag 跟着新修订走。
    const [design] = await db.select({ revision: designs.revision, project: designs.project }).from(designs).where(owned);
    const pattern = readPattern(design?.project);
    if (!design || !pattern) throw new AppError('NOT_FOUND', '设计不存在');
    revision = design.revision;
    png = renderPatternThumbnail(pattern);
    cache.set(cacheKey(revision), png);
  }
  return new Response(new Uint8Array(png), {
    status: 200,
    headers: {
      ...thumbnailHeaders(id.data, revision, requested),
      'content-type': 'image/png',
      'content-length': String(png.length),
      'x-content-type-options': 'nosniff',
    },
  });
}

export const GET = withApiErrors(get);
