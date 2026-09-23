/**
 * 后台列表分页（admin-round-3 06）。
 *
 * 后台列表此前只有游标翻页：只能上一页/下一页，拿不到总数，也没有「每页几条」。
 * 这里给出统一的页码方案——同一份筛选条件同时跑 `select ... limit/offset` 与 `count(*)`，
 * 避免列表与总数因为条件漂移而不一致。豆社公开列表（按热度排序、签名游标）保持游标分页，
 * 不使用本模块。
 */
import { sql } from 'drizzle-orm';
import { z } from 'zod';

/** 每页条数白名单：只允许这四档，避免前端传 100000 把库拖死。 */
export const PAGE_SIZES = [10, 20, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 10;

const isPageSize = (value: number): value is PageSize => (PAGE_SIZES as readonly number[]).includes(value);

/** 拼进各列表 querySchema 的两个字段（配合 `.strict()` 使用）。 */
export const pageQueryFields = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  size: z.coerce.number().int().refine(isPageSize, { message: '每页条数只能是 10 / 20 / 50 / 100' }).default(DEFAULT_PAGE_SIZE),
};

export function pageOffset(page: number, size: number): number {
  return (page - 1) * size;
}

export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size));
}

/** 列表返回值形状：分页组件只依赖这几个字段。 */
export interface PageMeta {
  total: number;
  page: number;
  size: number;
  totalPages: number;
}

export function pageMeta(total: number, page: number, size: number): PageMeta {
  const pages = pageCount(total, size);
  return { total, page: Math.min(page, pages), size, totalPages: pages };
}

/** `count(*)::int` 在 node-postgres 下不带 ::int 会返回字符串，这里统一成 number。 */
export const countExpression = sql<number>`count(*)::int`;

export function readCount(rows: Array<{ count: number }>): number {
  return Number(rows[0]?.count ?? 0);
}
