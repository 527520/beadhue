/** 缩略图地址（浏览器与服务端共用，不依赖数据库模块）。 */
export function communityThumbnailUrl(revisionId: string, size: 'default' | 'large' = 'default'): string {
  return `/api/community/revisions/${revisionId}/thumbnail${size === 'large' ? '?size=large' : ''}`;
}

/**
 * 后台专用缩略图地址（admin-round-3 10）。
 * 后台此前直接拿公开缩略图地址：50 张草稿卡片 + 每次重渲染都在消耗「每 IP 每小时」的公开读配额，
 * 于是官方批次会被豆社公开接口限流。管理端路径按管理员会话独立计量，公开阈值不受影响。
 */
export function adminThumbnailUrl(revisionId: string, size: 'default' | 'large' = 'default'): string {
  return `/api/admin/community/revisions/${revisionId}/thumbnail${size === 'large' ? '?size=large' : ''}`;
}

/** 按调用方作用域选择地址；后台组件统一传 scope="admin"。 */
export function thumbnailUrlFor(scope: 'public' | 'admin', revisionId: string): string {
  return scope === 'admin' ? adminThumbnailUrl(revisionId) : communityThumbnailUrl(revisionId);
}
