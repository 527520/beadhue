import { z } from 'zod';
import { getDb } from '@/lib/auth/db';
import { requireApiActor } from '@/lib/auth/dal';
import { checkRateLimit } from '@/lib/auth/rateLimit';
import { withApiErrors } from '@/lib/auth/http';
import { loadRevisionForThumbnail } from '@/lib/community/queries';
import { config } from '@/lib/config';
import { AppError } from '@/lib/errors';
import { renderPatternThumbnail } from '@/lib/render/thumbnail';
import { getThumbnailCache } from '@/lib/render/thumbnailCache';
import { THUMBNAIL_RENDER_VERSION } from '@/lib/render/thumbnailSize';

/**
 * 管理端缩略图（admin-round-3 10）：后台此前直接请求豆社公开缩略图，
 * 50 张草稿卡片会吃满「每 IP 每小时」的公开读配额，于是官方批次被限流。
 * 这里给管理员一条专用路径：按账号单独计量（额度极高但仍有兜底），公开阈值完全不动。
 */
async function get(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireApiActor('community:moderate');
  const revisionId = z.uuid().parse((await params).id);
  const size = new URL(request.url).searchParams.get('size') === 'large' ? 'large' : 'default';
  const db = getDb();
  const allowed = await checkRateLimit(db, `admin:thumbnail:${actor.userId}`, config.security.adminThumbnailRateLimit);
  if (!allowed) throw new AppError('RATE_LIMITED', '读取过于频繁，请稍后再试');
  const revision = await loadRevisionForThumbnail(db, revisionId);
  if (!revision) throw new AppError('NOT_FOUND', '图纸不存在');
  const cache = getThumbnailCache();
  const cacheKey = `${revision.id}:${size}:v${THUMBNAIL_RENDER_VERSION}`;
  let png = cache.get(cacheKey);
  if (!png) {
    png = renderPatternThumbnail(revision.pattern, { size });
    cache.set(cacheKey, png);
  }
  return new Response(new Uint8Array(png), {
    status: 200,
    headers: {
      'content-type': 'image/png',
      'content-length': String(png.length),
      // 修订不可变（ADR-0015）：同一修订、同一渲染版本的缩略图永不改变，私有缓存可长期复用。
      'cache-control': 'private, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
}

export const GET = withApiErrors(get);
