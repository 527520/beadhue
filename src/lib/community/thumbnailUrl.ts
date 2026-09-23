import { THUMBNAIL_RENDER_VERSION } from '@/lib/render/thumbnailSize';

/** 缩略图地址（浏览器与服务端共用，不依赖数据库模块）；`v` 是渲染版本，改样式即换地址。 */
function thumbnailQuery(size: 'default' | 'large', extra: Record<string, string> = {}): string {
  const query = new URLSearchParams({ ...extra, v: String(THUMBNAIL_RENDER_VERSION) });
  if (size === 'large') query.set('size', 'large');
  return query.toString();
}

export function communityThumbnailUrl(revisionId: string, size: 'default' | 'large' = 'default'): string {
  return `/api/community/revisions/${revisionId}/thumbnail?${thumbnailQuery(size)}`;
}

/**
 * 后台专用缩略图地址（admin-round-3 10）。
 * 后台此前直接拿公开缩略图地址：50 张草稿卡片 + 每次重渲染都在消耗「每 IP 每小时」的公开读配额，
 * 于是官方批次会被豆社公开接口限流。管理端路径按管理员会话独立计量，公开阈值不受影响。
 */
export function adminThumbnailUrl(revisionId: string, size: 'default' | 'large' = 'default'): string {
  return `/api/admin/community/revisions/${revisionId}/thumbnail?${thumbnailQuery(size)}`;
}

/** 按调用方作用域选择地址；后台组件统一传 scope="admin"。 */
export function thumbnailUrlFor(scope: 'public' | 'admin', revisionId: string): string {
  return scope === 'admin' ? adminThumbnailUrl(revisionId) : communityThumbnailUrl(revisionId);
}

/** 私人设计缩略图（仅本人可读）：修订号进地址，设计一改地址就变，旧图按修订长期缓存。 */
export function designThumbnailUrl(designId: string, revision: number): string {
  return `/api/designs/${designId}/thumbnail?${thumbnailQuery('default', { rev: String(revision) })}`;
}
