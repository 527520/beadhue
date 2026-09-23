import { z } from 'zod';
import { getDb } from '@/lib/auth/db';
import { authorize } from '@/lib/auth/authorization';
import { withApiErrors } from '@/lib/auth/http';
import { getSessionActor } from '@/lib/auth/session';
import { getBoardProfile } from '@/lib/boardProfiles';
import { loadRevisionForThumbnail } from '@/lib/community/queries';
import { AppError } from '@/lib/errors';
import { renderPatternThumbnail } from '@/lib/render/thumbnail';
import { getThumbnailCache } from '@/lib/render/thumbnailCache';
import { enforcePublicReadLimit } from '@/lib/security/publicRateLimit';

const cache = getThumbnailCache();

/**
 * 修订不可变（ADR-0015），同一修订的缩略图永不改变：
 * 公开修订允许长期缓存；作者本人和审核员可看到未公开修订，但不进入共享缓存。
 *
 * 命中顺序（admin-round-3 12）：先查进程缓存，未命中才读库。
 * 一次列表视图 24 张图此前每张都要读整行 snapshot 并做 zod 解析（约 24 次全量解析），
 * 现在命中即返回；缓存里只放**当前公开**修订的 PNG，所以命中本身就是公开的证据，
 * 不需要再读库鉴权。未公开修订每次都要读库鉴权、每次重新渲染（不进公开槽位）。
 */
function pngResponse(png: Buffer, isPublic: boolean): Response {
  return new Response(new Uint8Array(png), {
    status: 200,
    headers: {
      'content-type': 'image/png',
      'content-length': String(png.length),
      'cache-control': isPublic ? 'public, max-age=31536000, immutable' : 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

async function get(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const revisionId = z.uuid().parse((await params).id);
  const size = new URL(request.url).searchParams.get('size') === 'large' ? 'large' : 'default';
  // 每次请求都计限流（含命中进程缓存）：命中只省渲染，不省带宽与入口成本。
  await enforcePublicReadLimit(getDb(), request, 'thumbnail');
  const cacheKey = `${revisionId}:${size}`;
  const cached = cache.getPublic(cacheKey);
  if (cached) return pngResponse(cached, true);
  const revision = await loadRevisionForThumbnail(getDb(), revisionId);
  if (!revision) throw new AppError('NOT_FOUND', '图纸不存在');
  let visible = revision.isPublic;
  if (!visible) {
    const actor = await getSessionActor();
    visible = Boolean(actor && (authorize(actor, 'community:moderate') || (revision.authorUserId !== null && actor.userId === revision.authorUserId)));
  }
  if (!visible) throw new AppError('NOT_FOUND', '图纸不存在');
  const png = renderPatternThumbnail(revision.pattern, { boardSize: getBoardProfile(revision.boardProfile).boardCols, size });
  if (revision.isPublic) cache.setPublic(cacheKey, png);
  return pngResponse(png, revision.isPublic);
}

export const GET = withApiErrors(get);
