import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { AnyDatabase } from '@/../db/client';
import { communityRevisions, communityWorks } from '@/../db/schema';
import { config } from '@/lib/config';

/**
 * sitemap 里的作品条目（ADR-0021）：只列最近 N 天更新的公开作品，并按固定页大小分页。
 * 此前一页无上限地列出全部作品编号，等于给爬虫一份全站清单。
 *
 * admin-round-3 12：计数改 `count(*)`（此前把全部匹配行取回内存再取 `.length`），
 * 并给计数与分页结果加短 TTL 的进程内缓存 —— 爬虫反复抓 robots/sitemap 时不再每次都打库。
 * Next 的元数据路由固定发 `Cache-Control: public, max-age=0, must-revalidate`，
 * 无法从用户代码覆盖成 s-maxage，所以「缓存输出」落在进程内这一层。
 */
export function sitemapWindow(now: Date = new Date()): { since: Date; pageSize: number } {
  return { since: new Date(now.getTime() - config.security.sitemapRecentDays * 24 * 60 * 60 * 1000), pageSize: config.security.sitemapPageSize };
}

function publishedWorkConditions(since: Date) {
  return and(eq(communityWorks.lifecycleStatus, 'active'), eq(communityRevisions.status, 'published'), gte(communityWorks.updatedAt, since));
}

/** 近期公开作品总数：`count(*)` 由数据库聚合，不再把行搬进内存。 */
async function countSitemapWorksUncached(db: AnyDatabase, now: Date): Promise<number> {
  const { since } = sitemapWindow(now);
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(communityWorks)
    .innerJoin(communityRevisions, eq(communityRevisions.id, communityWorks.currentPublishedRevisionId))
    .where(publishedWorkConditions(since));
  return Number(row?.count ?? 0);
}

async function listSitemapWorksUncached(db: AnyDatabase, page: number, now: Date): Promise<Array<{ id: string; updatedAt: Date }>> {
  const { since, pageSize } = sitemapWindow(now);
  return db.select({ id: communityWorks.id, updatedAt: communityWorks.updatedAt }).from(communityWorks)
    .innerJoin(communityRevisions, eq(communityRevisions.id, communityWorks.currentPublishedRevisionId))
    .where(publishedWorkConditions(since))
    .orderBy(desc(communityWorks.updatedAt), communityWorks.id)
    .limit(pageSize).offset(Math.max(0, page) * pageSize);
}

export function sitemapPageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

// ---- 进程内输出缓存 ----
// 键挂在 globalThis：robots 与 sitemap 是两个独立打包的入口，模块级变量不共享缓存。
const CACHE_KEY = '__doupu_sitemap_cache__';
/** 缓存值按窗口对齐存放，TTL 内直接复用；爬虫的重复抓取因此不再是数据库负载。 */
const CACHE_MAX_ENTRIES = 64;

interface SitemapCacheStore {
  entries: Map<string, unknown>;
}

function cacheStore(): SitemapCacheStore {
  const store = globalThis as Record<string, unknown>;
  let cache = store[CACHE_KEY] as SitemapCacheStore | undefined;
  if (!cache) {
    cache = { entries: new Map() };
    store[CACHE_KEY] = cache;
  }
  return cache;
}

/** 测试与维护用：清空 sitemap 输出缓存。 */
export function resetSitemapCache(): void {
  cacheStore().entries.clear();
}

/**
 * 按 TTL 分桶的进程内缓存：键里带 `now` 所属的 TTL 桶号，
 * 同一桶内复用、跨桶自然失效（不需要额外过期判断），不同窗口的调用不会互相串味。
 */
async function memoized<T>(key: string, now: Date, load: () => Promise<T>): Promise<T> {
  const ttlMs = config.security.sitemapCacheSeconds * 1000;
  if (ttlMs <= 0) return load();
  const store = cacheStore();
  const cacheKey = `${key}@${Math.floor(now.getTime() / ttlMs)}`;
  if (store.entries.has(cacheKey)) return store.entries.get(cacheKey) as T;
  const value = await load();
  store.entries.delete(cacheKey);
  store.entries.set(cacheKey, value);
  // 条数有界：仍然过多时丢掉最早的一半。
  if (store.entries.size > CACHE_MAX_ENTRIES) {
    for (const oldest of [...store.entries.keys()].slice(0, Math.ceil(store.entries.size / 2))) store.entries.delete(oldest);
  }
  return value;
}

/** 近期公开作品总数（带进程内短缓存）；数据库不可用时由调用方兜底。 */
export async function countSitemapWorks(db: AnyDatabase, now: Date = new Date()): Promise<number> {
  return memoized('count', now, () => countSitemapWorksUncached(db, now));
}

/** 某页的作品条目（带进程内短缓存）。 */
export async function listSitemapWorks(db: AnyDatabase, page: number, now: Date = new Date()): Promise<Array<{ id: string; updatedAt: Date }>> {
  const safePage = Math.max(0, Math.trunc(page));
  return memoized(`page:${safePage}`, now, () => listSitemapWorksUncached(db, safePage, now));
}
