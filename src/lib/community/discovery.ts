/**
 * 发现页的补充查询（R15-02）：我喜欢的、相似作品、作者主页、搜索建议。
 * 公开可见性、作者展示名与列表 DTO 全部复用 queries.ts 的同一口径。
 */
import { and, desc, eq, gt, ilike, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { AnyDatabase } from '@/../db/client';
import { communityLikes, communityRevisions, communityTags, communityWorks, communityWorkTags, users } from '@/../db/schema';
import { countExpression, readCount } from '@/lib/admin/pagination';
import { AppError } from '@/lib/errors';
import { ANONYMIZED_DISPLAY_NAME, resolvePublicDisplayName } from '@/lib/identity/publicAuthor';
import { pushSpan } from '@/lib/observability/context';
import { signCursor, verifyCursor } from '@/lib/security/cursor';
import {
  COMMUNITY_PAGE_SIZE,
  OFFICIAL_PUBLIC_AUTHOR_ID,
  likedWorkIds,
  publicBaseConditions,
  publicDisplayNameExpression,
  publicSelection,
  tagsByWork,
  toCommunityListItem,
  type CommunityListItem,
} from './queries';
import { communityThumbnailUrl } from './thumbnailUrl';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const heat = sql<number>`(${communityWorks.likeCount} + ${communityWorks.commentCount} + ${communityWorks.reuseCount})`;

function publicWorksFrom(db: AnyDatabase) {
  return db.select(publicSelection).from(communityWorks)
    .innerJoin(communityRevisions, eq(communityRevisions.workId, communityWorks.id))
    .leftJoin(users, eq(users.id, communityWorks.authorUserId));
}

async function toItems(db: AnyDatabase, rows: Awaited<ReturnType<ReturnType<typeof publicWorksFrom>['where']>>, viewerUserId?: string) {
  const ids = rows.map((row) => row.id);
  const [tags, liked] = await Promise.all([tagsByWork(db, ids), likedWorkIds(db, viewerUserId, ids)]);
  return rows.flatMap((row) => {
    const item = toCommunityListItem(row, tags.get(row.id) ?? [], liked.has(row.id));
    return item ? [item] : [];
  });
}

// ---- 我喜欢的 ----

const likedCursorSchema = z.object({ likedAt: z.string().datetime(), id: z.uuid() }).strict();

/** 登录者喜欢过、且当前仍公开的作品，按喜欢时间倒序，签名游标分页（每页 24）。 */
export async function listLikedCommunityWorks(db: AnyDatabase, userId: string, page: { cursor?: string | null } = {}) {
  pushSpan({ kind: 'service', name: 'community.listLikedWorks' });
  const cursor = page.cursor ? likedCursorSchema.safeParse(verifyCursor(page.cursor)) : null;
  if (page.cursor && !cursor?.success) throw new AppError('VALIDATION', '分页游标无效', 'cursor');
  const base = [eq(communityLikes.userId, userId), ...publicBaseConditions()];
  const after: SQL | undefined = cursor?.success ? or(
    sql`${communityLikes.createdAt} < ${new Date(cursor.data.likedAt)}`,
    and(eq(communityLikes.createdAt, new Date(cursor.data.likedAt)), sql`${communityLikes.id} < ${cursor.data.id}::uuid`),
  ) : undefined;
  const [rows, totalRows] = await Promise.all([
    db.select({ ...publicSelection, likeId: communityLikes.id, likedAt: communityLikes.createdAt }).from(communityLikes)
      .innerJoin(communityWorks, eq(communityWorks.id, communityLikes.workId))
      .innerJoin(communityRevisions, eq(communityRevisions.workId, communityWorks.id))
      .leftJoin(users, eq(users.id, communityWorks.authorUserId))
      .where(and(...base, after))
      .orderBy(desc(communityLikes.createdAt), desc(communityLikes.id))
      .limit(COMMUNITY_PAGE_SIZE + 1),
    db.select({ count: countExpression }).from(communityLikes)
      .innerJoin(communityWorks, eq(communityWorks.id, communityLikes.workId))
      .innerJoin(communityRevisions, eq(communityRevisions.workId, communityWorks.id))
      .where(and(...base)),
  ]);
  const visible = rows.slice(0, COMMUNITY_PAGE_SIZE);
  const tags = await tagsByWork(db, visible.map((row) => row.id));
  const items = visible.flatMap((row) => {
    const item = toCommunityListItem(row, tags.get(row.id) ?? [], true);
    return item ? [{ ...item, likedAt: row.likedAt.toISOString() }] : [];
  });
  const last = visible.at(-1);
  return {
    items,
    total: readCount(totalRows),
    nextCursor: rows.length > COMMUNITY_PAGE_SIZE && last ? signCursor({ likedAt: last.likedAt.toISOString(), id: last.likeId }) : null,
  };
}

// ---- 相似作品 ----

export const RELATED_DEFAULT_LIMIT = 8;
export const RELATED_MAX_LIMIT = 24;

/**
 * 相似作品：同标签优先（共享的启用标签越多越靠前），其次同作者、同内置色板，
 * 再按热度与发布时间；至少满足其中一条才算相似。作品不存在或未公开返回 null。
 */
export async function listRelatedCommunityWorks(
  db: AnyDatabase,
  workId: string,
  options: { limit?: number; viewerUserId?: string } = {},
): Promise<CommunityListItem[] | null> {
  pushSpan({ kind: 'service', name: 'community.listRelatedWorks' });
  const limit = Math.min(Math.max(options.limit ?? RELATED_DEFAULT_LIMIT, 1), RELATED_MAX_LIMIT);
  const [base] = await db.select({ publicAuthorId: communityRevisions.publicAuthorId, paletteKind: communityRevisions.paletteKind, paletteId: communityRevisions.paletteId })
    .from(communityWorks).innerJoin(communityRevisions, eq(communityRevisions.workId, communityWorks.id))
    .where(and(eq(communityWorks.id, workId), ...publicBaseConditions()));
  if (!base) return null;
  // 外层列写成带表名的原始引用：drizzle 在子查询里会把它渲染成裸 "id"，被解析成内层表的列（R14 标签件数根因）。
  const sharedTags = sql<number>`(select count(*)::int from ${communityWorkTags} own
    join ${communityWorkTags} other on other.tag_id = own.tag_id
    join ${communityTags} tag on tag.id = own.tag_id
    where own.work_id = ${workId}::uuid and other.work_id = ${sql.raw('"community_works"."id"')}
      and tag.active = true and tag.merged_into_tag_id is null)`;
  const sameAuthor = eq(communityRevisions.publicAuthorId, base.publicAuthorId);
  const samePalette = base.paletteKind === 'builtin' && base.paletteId ? eq(communityRevisions.paletteId, base.paletteId) : sql`false`;
  const rows = await publicWorksFrom(db)
    .where(and(...publicBaseConditions(), ne(communityWorks.id, workId), or(gt(sharedTags, 0), sameAuthor, samePalette)))
    .orderBy(desc(sharedTags), desc(sql`(${sameAuthor})`), desc(sql`(${samePalette})`), desc(heat), desc(communityRevisions.publishedAt), desc(communityWorks.id))
    .limit(limit);
  return toItems(db, rows, options.viewerUserId);
}

// ---- 作者主页 ----

export interface CommunityAuthorDto {
  publicAuthorId: string;
  displayName: string;
  authorType: 'user' | 'official';
  counts: { works: number; likes: number; reuses: number };
}

/** 作者公开信息与公开作品统计；公开 ID 不存在返回 null（官方作者恒存在）。 */
export async function getCommunityAuthor(db: AnyDatabase, publicAuthorId: string): Promise<CommunityAuthorDto | null> {
  pushSpan({ kind: 'service', name: 'community.getAuthor' });
  let identity: Pick<CommunityAuthorDto, 'displayName' | 'authorType'>;
  if (publicAuthorId === OFFICIAL_PUBLIC_AUTHOR_ID) {
    identity = { displayName: '豆色绘官方', authorType: 'official' };
  } else {
    if (!UUID_PATTERN.test(publicAuthorId)) return null;
    const [account] = await db.select({ username: users.username, email: users.email, accountStatus: users.accountStatus })
      .from(users).where(eq(users.publicAuthorId, publicAuthorId));
    if (!account) return null;
    identity = {
      authorType: 'user',
      displayName: account.accountStatus === 'anonymized' || !account.email ? ANONYMIZED_DISPLAY_NAME : resolvePublicDisplayName(account.username, account.email),
    };
  }
  const [stats] = await db.select({
    works: countExpression,
    likes: sql<number>`coalesce(sum(${communityWorks.likeCount}), 0)::int`,
    reuses: sql<number>`coalesce(sum(${communityWorks.reuseCount}), 0)::int`,
  }).from(communityWorks).innerJoin(communityRevisions, eq(communityRevisions.workId, communityWorks.id))
    .where(and(...publicBaseConditions(), eq(communityRevisions.publicAuthorId, publicAuthorId)));
  return {
    publicAuthorId,
    ...identity,
    counts: { works: Number(stats?.works ?? 0), likes: Number(stats?.likes ?? 0), reuses: Number(stats?.reuses ?? 0) },
  };
}

// ---- 搜索建议 ----

export const SUGGEST_LIMIT = 5;
export const SUGGEST_POPULAR_LIMIT = 8;
export const suggestQuerySchema = z.string().trim().max(40);

/**
 * 搜索建议：标签、作品、作者各最多 5 条（均只含当前公开的内容）。
 * 空关键词时返回「大家在搜」：公开作品最多的 8 个标签，作品与作者为空。
 */
export async function suggestCommunitySearch(db: AnyDatabase, rawQuery: string) {
  pushSpan({ kind: 'service', name: 'community.suggest' });
  const q = suggestQuerySchema.parse(rawQuery);
  const pattern = `%${q}%`;
  const tagCount = sql<number>`count(*)::int`;
  const tagRows = await db.select({ id: communityTags.id, name: communityTags.name, count: tagCount }).from(communityWorkTags)
    .innerJoin(communityTags, eq(communityTags.id, communityWorkTags.tagId))
    .innerJoin(communityWorks, eq(communityWorks.id, communityWorkTags.workId))
    .where(and(
      eq(communityTags.active, true), isNull(communityTags.mergedIntoTagId),
      eq(communityWorks.lifecycleStatus, 'active'), sql`${communityWorks.currentPublishedRevisionId} is not null`,
      q ? ilike(communityTags.name, pattern) : undefined,
    ))
    .groupBy(communityTags.id, communityTags.name, communityTags.sortOrder)
    .orderBy(desc(tagCount), communityTags.sortOrder, communityTags.name)
    .limit(q ? SUGGEST_LIMIT : SUGGEST_POPULAR_LIMIT);
  const tags = tagRows.map((row) => ({ id: row.id, name: row.name, count: Number(row.count) }));
  if (!q) return { q, tags, works: [], authors: [] };
  const [workRows, authorRows] = await Promise.all([
    db.select({ id: communityWorks.id, revisionId: communityRevisions.id, title: communityRevisions.title, width: communityRevisions.width, height: communityRevisions.height })
      .from(communityWorks).innerJoin(communityRevisions, eq(communityRevisions.workId, communityWorks.id))
      .where(and(...publicBaseConditions(), ilike(communityRevisions.title, pattern)))
      .orderBy(desc(heat), desc(communityRevisions.publishedAt), desc(communityWorks.id))
      .limit(SUGGEST_LIMIT),
    db.select({
      publicAuthorId: communityRevisions.publicAuthorId,
      authorType: communityRevisions.authorType,
      displayName: sql<string>`max(${publicDisplayNameExpression})`,
      workCount: countExpression,
    }).from(communityWorks).innerJoin(communityRevisions, eq(communityRevisions.workId, communityWorks.id))
      .leftJoin(users, eq(users.id, communityWorks.authorUserId))
      // 注销账号不进作者建议：它们都叫「已注销用户」，没有可浏览的主页意义。
      .where(and(...publicBaseConditions(), ilike(publicDisplayNameExpression, pattern), or(isNull(users.accountStatus), ne(users.accountStatus, 'anonymized'), eq(communityRevisions.authorType, 'official'))))
      .groupBy(communityRevisions.publicAuthorId, communityRevisions.authorType)
      .orderBy(desc(countExpression), communityRevisions.publicAuthorId)
      .limit(SUGGEST_LIMIT),
  ]);
  return {
    q,
    tags,
    works: workRows.map((row) => ({ ...row, thumbnailUrl: communityThumbnailUrl(row.revisionId) })),
    authors: authorRows.map((row) => ({
      publicAuthorId: row.authorType === 'official' ? OFFICIAL_PUBLIC_AUTHOR_ID : row.publicAuthorId,
      authorType: row.authorType,
      displayName: row.displayName,
      workCount: Number(row.workCount),
    })),
  };
}
