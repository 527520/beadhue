import { config } from '@/lib/config';
import { ThumbnailCache } from './thumbnail';

/**
 * 缩略图进程内缓存（admin-round-3 10/12）。
 *
 * 公开路由与管理端路由是两个独立打包的模块，模块级变量不共享，
 * 所以缓存挂在 globalThis 上（与 PGlite 回退库同样的理由）：两个入口复用同一个
 * 缓存实例与同一份字节预算，而不是各建一份。
 *
 * 注意「共享实例」不等于「共享条目」：公开路径只读写下文 ThumbnailCache 的公开槽位，
 * 管理端槽位可能装着草稿修订的图。公开槽位命中即代表该修订公开（见公开缩略图路由），
 * 因此两个槽位绝不能串用；代价是后台看过的公开图前台需要各渲染一次，
 * 由字节 + 条数双预算兜底。
 *
 * 预算来自 config（条数 + 字节双上限，见 THUMBNAIL_CACHE_ENTRIES / THUMBNAIL_CACHE_BYTES）。
 */
const CACHE_KEY = '__beadhue_thumbnail_cache__';

export function getThumbnailCache(): ThumbnailCache {
  const store = globalThis as Record<string, unknown>;
  let cache = store[CACHE_KEY] as ThumbnailCache | undefined;
  if (!cache) {
    cache = new ThumbnailCache(config.security.thumbnailCacheBytes, config.security.thumbnailCacheEntries);
    store[CACHE_KEY] = cache;
  }
  return cache;
}
