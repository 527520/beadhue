import { and, asc, eq, ilike, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AnyDatabase } from '@/../db/client';
import { communityTags, communityWorks, communityWorkTags } from '@/../db/schema';
import { countExpression, pageMeta, pageOffset, pageQueryFields, readCount } from '@/lib/admin/pagination';

const querySchema = z.object({
  q: z.string().trim().max(60).default(''),
  ...pageQueryFields,
}).strict();

/**
 * 标签管理列表（admin-round-3 08）。
 *
 * 计数此前是一条相关子查询：`(select count(*) from community_work_tags cwt where cwt.tag_id = ${communityTags.id})`。
 * drizzle 在 SELECT 列表里把该列渲染成不带表名的 `"id"`，而 `community_work_tags` 自己也有 `id` 列，
 * Postgres 于是解析成 `cwt.tag_id = cwt.id` —— 恒为 false，所以「N 件作品」永远是 0。
 * 这里改成 join + 聚合，并用 `count(work_id)`（LEFT JOIN 的空行不计）分别给出全部与公开的作品数。
 */
export async function listCommunityTagsAdmin(db: AnyDatabase, input: unknown = {}) {
  const query = querySchema.parse(input);
  const where = and(query.q ? ilike(communityTags.name, `%${query.q}%`) : undefined);
  const workCount = sql<number>`count(${communityWorkTags.workId})::int`;
  const publicWorkCount = sql<number>`count(${communityWorkTags.workId}) filter (where ${communityWorks.lifecycleStatus} = 'active' and ${communityWorks.currentPublishedRevisionId} is not null)::int`;
  const [rows, totalRows] = await Promise.all([
    db.select({
      id: communityTags.id, name: communityTags.name, slug: communityTags.slug, sortOrder: communityTags.sortOrder,
      icon: communityTags.icon, featured: communityTags.featured,
      active: communityTags.active, mergedIntoTagId: communityTags.mergedIntoTagId, version: communityTags.version,
      createdAt: communityTags.createdAt, updatedAt: communityTags.updatedAt,
      workCount, publicWorkCount,
    }).from(communityTags)
      .leftJoin(communityWorkTags, eq(communityWorkTags.tagId, communityTags.id))
      .leftJoin(communityWorks, eq(communityWorks.id, communityWorkTags.workId))
      .where(where)
      .groupBy(communityTags.id)
      .orderBy(asc(communityTags.sortOrder), asc(communityTags.name))
      .limit(query.size).offset(pageOffset(query.page, query.size)),
    db.select({ count: countExpression }).from(communityTags).where(where),
  ]);
  return {
    items: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
      workCount: Number(row.workCount), publicWorkCount: Number(row.publicWorkCount),
    })),
    ...pageMeta(readCount(totalRows), query.page, query.size),
  };
}
