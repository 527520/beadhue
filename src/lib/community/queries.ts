import {
  and,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { z } from 'zod';
import { signCursor, verifyCursor } from '@/lib/security/cursor';
import type { AnyDatabase } from '@/../db/client';
import {
  communityLikes,
  communityRevisions,
  communityTags,
  communityWorks,
  communityWorkTags,
  users,
} from '@/../db/schema';
import { BOARD_PROFILE_IDS, getBoardProfile } from '@/lib/boardProfiles';
import { countExpression, pageMeta, pageOffset, pageQueryFields, readCount } from '@/lib/admin/pagination';
import { config } from '@/lib/config';
import { pushSpan } from '@/lib/observability/context';
import { ANONYMIZED_DISPLAY_NAME } from '@/lib/identity/publicAuthor';
import { AppError } from '@/lib/errors';
import { listBuiltinPalettes } from '@/lib/palettes';
import { describeColorName } from '@/lib/palettes/colorNames';
import type { Pattern } from '@/lib/types';
import { communityPreviewSchema, parseCommunitySnapshot, type CommunityPreviewV1 } from './snapshot';
import { normalizeTagName } from './tagNames';
import { communityThumbnailUrl } from './thumbnailUrl';

export const COMMUNITY_PAGE_SIZE = 24;
/** 官方作者的公开 ID（官方修订冻结的 public_author_id 也是它）。 */
export const OFFICIAL_PUBLIC_AUTHOR_ID = 'beadhue-official';

/**
 * 排序：rec（精选优先，再按热度 = 喜欢 + 评论 + 引用）/ new / likes / reuses（R15 发现页）；
 * latest / featured / popular 是旧豆社页的写法，保留到旧页面下线。
 */
export const COMMUNITY_SORTS = ['rec', 'new', 'likes', 'reuses', 'latest', 'featured', 'popular'] as const;
export type CommunitySort = (typeof COMMUNITY_SORTS)[number];

const querySchema = z.object({
  q: z.string().trim().max(80).optional(),
  /** 公开作者 ID 精确匹配；其他文本按展示名模糊匹配（旧豆社页的作者输入框）。 */
  author: z.string().trim().max(80).optional(),
  tag: z.string().trim().max(80).optional(),
  /** 类目条：featured（精选）、all（不筛）或标签名。 */
  cat: z.string().trim().max(80).optional(),
  boardProfile: z.enum(BOARD_PROFILE_IDS).optional(),
  /** 制作规格：5mm / 2.6mm（按豆径），也接受具体的制作规格 ID。 */
  spec: z.enum(['5mm', '2.6mm', ...BOARD_PROFILE_IDS]).optional(),
  /** 色板：品牌名（MARD、COCO…，含该品牌全部系列）、具体内置色板 ID，或 custom。 */
  palette: z.string().trim().max(200).optional(),
  /** 尺寸（最长边）：s < 30 格，m 30–40 格，l > 40 格。 */
  size: z.enum(['s', 'm', 'l']).optional(),
  /** 颜色数：few ≤ 6，mid 7–10，many > 10。 */
  colors: z.enum(['few', 'mid', 'many']).optional(),
  /** 最近 N 天内发布。 */
  since: z.coerce.number().int().min(1).max(3650).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  sort: z.enum(COMMUNITY_SORTS).default('rec'),
  cursor: z.string().max(500).optional(),
}).strict();
export type CommunityListQuery = z.infer<typeof querySchema>;
const LIST_QUERY_KEYS = ['q', 'author', 'tag', 'cat', 'boardProfile', 'spec', 'palette', 'size', 'colors', 'since', 'from', 'to', 'sort', 'cursor'] as const;

/** 后台审核队列分页参数（admin-round-3 06）。 */
export const reviewQueueQuerySchema = z.object({ ...pageQueryFields }).strict();

const cursorSchema = z.object({
  sort: z.enum(COMMUNITY_SORTS),
  primary: z.number(),
  publishedAt: z.string().datetime(),
  id: z.string().uuid(),
}).strict();
type CommunityCursor = z.infer<typeof cursorSchema>;

export function parseCommunityListUrl(url: string): CommunityListQuery {
  const search = new URL(url).searchParams;
  const values: Record<string, string> = {};
  for (const key of LIST_QUERY_KEYS) {
    const value = search.get(key);
    if (value !== null && value !== '') values[key] = value;
  }
  return querySchema.parse(values);
}

function encodeCursor(cursor: CommunityCursor): string {
  return signCursor(cursor);
}

/** 游标必须由服务端签发（ADR-0021）；篡改、损坏或排序不一致都视为无效。 */
function decodeCursor(value: string | undefined, sort: CommunityListQuery['sort']): CommunityCursor | null {
  const payload = verifyCursor(value);
  if (payload === null) return null;
  const parsed = cursorSchema.safeParse(payload);
  return parsed.success && parsed.data.sort === sort ? parsed.data : null;
}

export interface PublicAuthorDto {
  authorType: 'user' | 'official';
  publicAuthorId: string;
  displayName: string;
}

export function publicAuthor(row: {
  authorType: 'user' | 'official';
  publicAuthorId: string;
  frozenDisplayName: string;
  accountStatus: 'active' | 'suspended' | 'anonymized' | null;
}): PublicAuthorDto {
  if (row.authorType === 'official') {
    return { authorType: 'official', publicAuthorId: OFFICIAL_PUBLIC_AUTHOR_ID, displayName: '豆色绘官方' };
  }
  return {
    authorType: 'user',
    publicAuthorId: row.publicAuthorId,
    displayName: row.accountStatus === 'anonymized' ? ANONYMIZED_DISPLAY_NAME : row.frozenDisplayName,
  };
}

export const publicSelection = {
  id: communityWorks.id,
  revisionId: communityRevisions.id,
  title: communityRevisions.title,
  authorType: communityRevisions.authorType,
  publicAuthorId: communityRevisions.publicAuthorId,
  frozenDisplayName: communityRevisions.frozenDisplayName,
  accountStatus: users.accountStatus,
  boardProfile: communityRevisions.boardProfile,
  paletteKind: communityRevisions.paletteKind,
  paletteId: communityRevisions.paletteId,
  width: communityRevisions.width,
  height: communityRevisions.height,
  colorCount: communityRevisions.colorCount,
  preview: communityRevisions.preview,
  publishedAt: communityRevisions.publishedAt,
  featuredAt: communityWorks.featuredAt,
  likeCount: communityWorks.likeCount,
  commentCount: communityWorks.commentCount,
  reuseCount: communityWorks.reuseCount,
  commentsLocked: communityWorks.commentsLocked,
} as const;

export function publicBaseConditions(): SQL[] {
  return [
    eq(communityWorks.lifecycleStatus, 'active'),
    eq(communityRevisions.status, 'published'),
    eq(communityWorks.currentPublishedRevisionId, communityRevisions.id),
  ];
}

export interface CommunityTagDto { id: string; name: string; slug: string }

export async function tagsByWork(db: AnyDatabase, workIds: string[]) {
  const result = new Map<string, CommunityTagDto[]>();
  if (workIds.length === 0) return result;
  const rows = await db.select({
    workId: communityWorkTags.workId,
    id: communityTags.id,
    name: communityTags.name,
    slug: communityTags.slug,
  }).from(communityWorkTags).innerJoin(communityTags, eq(communityTags.id, communityWorkTags.tagId))
    .where(and(inArray(communityWorkTags.workId, workIds), eq(communityTags.active, true)))
    .orderBy(communityTags.sortOrder, communityTags.name);
  for (const row of rows) result.set(row.workId, [...(result.get(row.workId) ?? []), { id: row.id, name: row.name, slug: row.slug }]);
  return result;
}

/**
 * 按名称解析筛选标签（大小写不敏感、沿合并链走到终点）。
 * 也接受旧链接里的 slug，方便历史分享链接继续可用。
 * 种子只认「启用中的标签」与「已合并的别名」：停用且未合并的标签不再能筛出作品，
 * 而历史分享链接里的旧别名（往往同时被停用并合并）仍沿合并链落到当前的正式标签。
 */
function tagFilterCondition(tag: string): SQL {
  const lowered = normalizeTagName(tag).toLocaleLowerCase('zh-CN');
  return sql`exists (
    with recursive resolved_tags as (
      select id, merged_into_tag_id from ${communityTags}
        where (active = true or merged_into_tag_id is not null)
          and (lower(name) = ${lowered} or slug = ${tag})
      union
      select t.id, t.merged_into_tag_id from ${communityTags} t
        join resolved_tags r on t.id = r.merged_into_tag_id
    )
    select 1 from ${communityWorkTags} cwt join resolved_tags r on r.id = cwt.tag_id
    where cwt.work_id = ${communityWorks.id} and r.merged_into_tag_id is null
  )`;
}

/** 公开标签计数表达式：热门标签与筛选控件共用同一个表达式，保证两处数字一致。 */
const publicTagCount = sql<number>`count(*)::int`;

/** 豆社顶部的热门标签：按当前公开作品数排序。 */
export async function listPopularCommunityTags(db: AnyDatabase, limit = 12): Promise<Array<CommunityTagDto & { count: number }>> {
  const rows = await db.select({
    id: communityTags.id,
    name: communityTags.name,
    slug: communityTags.slug,
    count: publicTagCount,
  }).from(communityWorkTags)
    .innerJoin(communityTags, eq(communityTags.id, communityWorkTags.tagId))
    .innerJoin(communityWorks, eq(communityWorks.id, communityWorkTags.workId))
    .where(and(eq(communityTags.active, true), eq(communityWorks.lifecycleStatus, 'active'), sql`${communityWorks.currentPublishedRevisionId} is not null`))
    .groupBy(communityTags.id, communityTags.name, communityTags.slug, communityTags.sortOrder)
    .orderBy(desc(publicTagCount), communityTags.sortOrder, communityTags.name)
    .limit(limit);
  return rows.map((row) => ({ id: row.id, name: row.name, slug: row.slug, count: Number(row.count) }));
}

/**
 * 全部公开标签及公开作品数（admin-round-3 09）：标签筛选控件的候选项。
 * 谓词与公开列表一致——标签启用且没被合并、作品正常且已有当前公开版本——所以这里的数字
 * 就是「按这个标签筛选能筛出的作品数」；一次聚合查询取完，页面不再逐个标签查。
 */
export async function listAllCommunityTagsWithCounts(db: AnyDatabase, limit = 500): Promise<Array<CommunityTagDto & { count: number }>> {
  const rows = await db.select({
    id: communityTags.id,
    name: communityTags.name,
    slug: communityTags.slug,
    count: publicTagCount,
  }).from(communityWorkTags)
    .innerJoin(communityTags, eq(communityTags.id, communityWorkTags.tagId))
    .innerJoin(communityWorks, eq(communityWorks.id, communityWorkTags.workId))
    .where(and(
      eq(communityTags.active, true),
      isNull(communityTags.mergedIntoTagId),
      eq(communityWorks.lifecycleStatus, 'active'),
      sql`${communityWorks.currentPublishedRevisionId} is not null`,
    ))
    .groupBy(communityTags.id, communityTags.name, communityTags.slug, communityTags.sortOrder)
    .orderBy(desc(publicTagCount), communityTags.sortOrder, communityTags.name)
    .limit(limit);
  return rows.map((row) => ({ id: row.id, name: row.name, slug: row.slug, count: Number(row.count) }));
}

/** 展示名的 SQL 表达式：与 DTO 的 publicAuthor() 同一口径，注销账号只能按「已注销用户」找到。 */
export const publicDisplayNameExpression = sql<string>`case
  when ${communityRevisions.authorType} = 'official' then '豆色绘官方'
  when ${users.accountStatus} = 'anonymized' then ${ANONYMIZED_DISPLAY_NAME}
  else ${communityRevisions.frozenDisplayName}
end`;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** 色板筛选：品牌名展开为该品牌的全部内置系列，custom 匹配自定义色板，其余按色板 ID 精确匹配。 */
function paletteCondition(value: string): SQL {
  if (value === 'custom') return eq(communityRevisions.paletteKind, 'custom');
  const ids = listBuiltinPalettes().filter((palette) => palette.brand === value).map((palette) => String(palette.id));
  return ids.length > 0 ? inArray(communityRevisions.paletteId, ids) : eq(communityRevisions.paletteId, value);
}

function specCondition(value: NonNullable<CommunityListQuery['spec']>): SQL {
  if (value === '5mm' || value === '2.6mm') {
    const diameter = value === '5mm' ? 5 : 2.6;
    return inArray(communityRevisions.boardProfile, BOARD_PROFILE_IDS.filter((id) => getBoardProfile(id).beadDiameterMm === diameter));
  }
  return eq(communityRevisions.boardProfile, value);
}

/** 列表与计数共用的筛选条件（不含游标）；两处因此永远一致。 */
function listFilterConditions(query: CommunityListQuery, now: Date): SQL[] {
  const conditions = publicBaseConditions();
  if (query.q) {
    // 搜索同时命中标题、已打标签名与作者展示名。
    conditions.push(or(
      ilike(communityRevisions.title, `%${query.q}%`),
      sql`exists (select 1 from ${communityWorkTags} cwt join ${communityTags} ct on ct.id = cwt.tag_id
        where cwt.work_id = ${communityWorks.id} and ct.active = true and ct.name ilike ${`%${query.q}%`})`,
      ilike(publicDisplayNameExpression, `%${query.q}%`),
    )!);
  }
  if (query.author) {
    conditions.push(query.author === OFFICIAL_PUBLIC_AUTHOR_ID || UUID_PATTERN.test(query.author)
      ? eq(communityRevisions.publicAuthorId, query.author)
      : ilike(publicDisplayNameExpression, `%${query.author}%`));
  }
  // UNION 去重也使损坏的环路有限终止；历史入口沿任意长度的合并链抵达终点。
  if (query.tag) conditions.push(tagFilterCondition(query.tag));
  if (query.cat === 'featured') conditions.push(sql`${communityWorks.featuredAt} is not null`);
  else if (query.cat && query.cat !== 'all') conditions.push(tagFilterCondition(query.cat));
  if (query.boardProfile) conditions.push(eq(communityRevisions.boardProfile, query.boardProfile));
  if (query.spec) conditions.push(specCondition(query.spec));
  if (query.palette) conditions.push(paletteCondition(query.palette));
  const longest = sql<number>`greatest(${communityRevisions.width}, ${communityRevisions.height})`;
  if (query.size === 's') conditions.push(lt(longest, 30));
  if (query.size === 'm') conditions.push(and(gte(longest, 30), lte(longest, 40))!);
  if (query.size === 'l') conditions.push(gt(longest, 40));
  if (query.colors === 'few') conditions.push(lte(communityRevisions.colorCount, 6));
  if (query.colors === 'mid') conditions.push(and(gte(communityRevisions.colorCount, 7), lte(communityRevisions.colorCount, 10))!);
  if (query.colors === 'many') conditions.push(gt(communityRevisions.colorCount, 10));
  if (query.since) conditions.push(gte(communityRevisions.publishedAt, new Date(now.getTime() - query.since * 24 * 60 * 60 * 1000)));
  if (query.from) conditions.push(gte(communityRevisions.publishedAt, new Date(`${query.from}T00:00:00+08:00`)));
  if (query.to) conditions.push(lt(communityRevisions.publishedAt, new Date(new Date(`${query.to}T00:00:00+08:00`).getTime() + 24 * 60 * 60 * 1000)));
  return conditions;
}

function sortPrimary(sort: CommunitySort): SQL<number> {
  const heat = sql<number>`(${communityWorks.likeCount} + ${communityWorks.commentCount} + ${communityWorks.reuseCount})`;
  switch (sort) {
    // 精选标记占高位：精选作品整体排在前面，组内再按热度。
    case 'rec': return sql<number>`((case when ${communityWorks.featuredAt} is not null then 1000000000000 else 0 end) + ${heat})::float8`;
    case 'popular': return heat;
    case 'likes': return sql<number>`${communityWorks.likeCount}`;
    case 'reuses': return sql<number>`${communityWorks.reuseCount}`;
    case 'featured': return sql<number>`coalesce(extract(epoch from ${communityWorks.featuredAt}), 0)`;
    default: return sql<number>`extract(epoch from ${communityRevisions.publishedAt})`;
  }
}

type PublicRow = {
  id: string; revisionId: string; title: string;
  authorType: 'user' | 'official'; publicAuthorId: string; frozenDisplayName: string;
  accountStatus: 'active' | 'suspended' | 'anonymized' | null;
  boardProfile: string; paletteKind: string; paletteId: string | null;
  width: number; height: number; colorCount: number; preview: unknown;
  publishedAt: Date | null; featuredAt: Date | null;
  likeCount: number; commentCount: number; reuseCount: number;
};

export interface CommunityListItem {
  id: string;
  revisionId: string;
  title: string;
  author: PublicAuthorDto;
  boardProfile: string;
  palette: { kind: string; id: string | null };
  width: number;
  height: number;
  colorCount: number;
  preview: CommunityPreviewV1;
  thumbnailUrl: string;
  tags: CommunityTagDto[];
  counts: { likes: number; comments: number; reuses: number };
  featured: boolean;
  /** 当前登录者是否喜欢；匿名访客恒为 false。 */
  liked: boolean;
  publishedAt: string;
}

/** 公开行 → 列表 DTO；预览损坏或缺发布时间的行直接跳过。 */
export function toCommunityListItem(row: PublicRow, tags: CommunityTagDto[], liked: boolean): CommunityListItem | null {
  const preview = communityPreviewSchema.safeParse(row.preview);
  if (!preview.success || !row.publishedAt) return null;
  return {
    id: row.id,
    revisionId: row.revisionId,
    title: row.title,
    author: publicAuthor(row),
    boardProfile: row.boardProfile,
    palette: { kind: row.paletteKind, id: row.paletteId },
    width: row.width,
    height: row.height,
    colorCount: row.colorCount,
    preview: preview.data,
    thumbnailUrl: communityThumbnailUrl(row.revisionId),
    tags,
    counts: { likes: row.likeCount, comments: row.commentCount, reuses: row.reuseCount },
    featured: row.featuredAt !== null,
    liked,
    publishedAt: row.publishedAt.toISOString(),
  };
}

/** 登录者在给定作品里喜欢了哪些（一次查询）。 */
export async function likedWorkIds(db: AnyDatabase, userId: string | undefined, workIds: string[]): Promise<Set<string>> {
  if (!userId || workIds.length === 0) return new Set();
  const rows = await db.select({ workId: communityLikes.workId }).from(communityLikes)
    .where(and(eq(communityLikes.userId, userId), inArray(communityLikes.workId, workIds)));
  return new Set(rows.map((row) => row.workId));
}

/**
 * 公开作品列表。`includeTags=false` 时跳过逐作品标签查询（列表页已不展示标签，
 * 省掉 SSR 热路径上的一次往返）；`viewerUserId` 给出时补一次查询标出登录者喜欢的作品。
 * 总数另由 countPublicCommunityWorks 计算（带缓存），列表本身不做 count。
 */
export async function listPublicCommunityWorks(
  db: AnyDatabase,
  queryInput: CommunityListQuery,
  options: { includeTags?: boolean; viewerUserId?: string; now?: Date } = {},
) {
  // 慢查询的调用链需要「公开列表」这一环（admin-round-3 13）；打点无副作用，进程外无上下文时自动忽略。
  pushSpan({ kind: 'service', name: 'community.listPublicWorks', detail: queryInput?.sort });
  const includeTags = options.includeTags ?? true;
  const query = querySchema.parse(queryInput);
  const cursor = decodeCursor(query.cursor, query.sort);
  if (query.cursor && !cursor) throw new AppError('VALIDATION', '分页游标无效', 'cursor');
  const conditions = listFilterConditions(query, options.now ?? new Date());
  const primary = sortPrimary(query.sort);
  if (cursor) {
    const publishedAt = new Date(cursor.publishedAt);
    conditions.push(or(
      lt(primary, cursor.primary),
      and(eq(primary, cursor.primary), lt(communityRevisions.publishedAt, publishedAt)),
      and(eq(primary, cursor.primary), eq(communityRevisions.publishedAt, publishedAt), lt(communityWorks.id, cursor.id)),
    )!);
  }
  const rows = await db.select({ ...publicSelection, primary }).from(communityWorks)
    .innerJoin(communityRevisions, eq(communityRevisions.workId, communityWorks.id))
    .leftJoin(users, eq(users.id, communityWorks.authorUserId))
    .where(and(...conditions))
    .orderBy(desc(primary), desc(communityRevisions.publishedAt), desc(communityWorks.id))
    .limit(COMMUNITY_PAGE_SIZE + 1);
  const visible = rows.slice(0, COMMUNITY_PAGE_SIZE);
  const ids = visible.map((row) => row.id);
  const tags = includeTags ? await tagsByWork(db, ids) : null;
  const liked = await likedWorkIds(db, options.viewerUserId, ids);
  const items = visible.flatMap((row) => {
    const item = toCommunityListItem(row, tags?.get(row.id) ?? [], liked.has(row.id));
    return item ? [item] : [];
  });
  const last = visible.at(-1);
  return {
    items,
    nextCursor: rows.length > COMMUNITY_PAGE_SIZE && last?.publishedAt ? encodeCursor({
      sort: query.sort,
      primary: Number(last.primary),
      publishedAt: last.publishedAt.toISOString(),
      id: last.id,
    }) : null,
  };
}

// ---- 列表总数：按筛选条件缓存（ADR-0021 下的成本护栏） ----
// 挂在 globalThis：SSR 页面与 API 路由是独立打包的模块副本，模块级变量不共享。
const COUNT_CACHE_KEY = '__beadhue_community_count_cache__';
const COUNT_CACHE_MAX_ENTRIES = 256;

function countCache(): Map<string, number> {
  const store = globalThis as Record<string, unknown>;
  let cache = store[COUNT_CACHE_KEY] as Map<string, number> | undefined;
  if (!cache) {
    cache = new Map();
    store[COUNT_CACHE_KEY] = cache;
  }
  return cache;
}

/** 测试与维护用：清空列表总数缓存。 */
export function resetCommunityCountCache(): void {
  countCache().clear();
}

/**
 * 符合筛选条件的公开作品总数。排序与游标不影响总数，不进缓存键；
 * 缓存按 TTL 分桶（同桶复用、跨桶自然失效），条数有界。
 */
export async function countPublicCommunityWorks(db: AnyDatabase, queryInput: CommunityListQuery, now: Date = new Date()): Promise<number> {
  const { sort: _sort, cursor: _cursor, ...filters } = querySchema.parse(queryInput);
  const load = async () => {
    const [row] = await db.select({ count: countExpression }).from(communityWorks)
      .innerJoin(communityRevisions, eq(communityRevisions.workId, communityWorks.id))
      .leftJoin(users, eq(users.id, communityWorks.authorUserId))
      .where(and(...listFilterConditions({ ...filters, sort: 'rec' }, now)));
    return Number(row?.count ?? 0);
  };
  const ttlMs = config.security.communityCountCacheSeconds * 1000;
  if (ttlMs <= 0) return load();
  const cache = countCache();
  const key = `${JSON.stringify(Object.entries(filters).sort(([left], [right]) => left.localeCompare(right)))}@${Math.floor(now.getTime() / ttlMs)}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const value = await load();
  cache.set(key, value);
  if (cache.size > COUNT_CACHE_MAX_ENTRIES) {
    for (const oldest of [...cache.keys()].slice(0, Math.ceil(cache.size / 2))) cache.delete(oldest);
  }
  return value;
}

export interface ColorUsageItem { code: string; name: string; hex: string; count: number }

/** 可拼格计数与色号清单（按颗数降序，同数按色号）；名称按 HEX 推导色系名。 */
export function summarizePatternColors(pattern: Pattern): { beadCount: number; colorUsage: ColorUsageItem[] } {
  const counts = new Map<string, ColorUsageItem>();
  let beadCount = 0;
  for (const cell of pattern.cells) {
    if (cell.transparent || cell.external || !cell.hex) continue;
    beadCount += 1;
    const code = cell.code ?? '';
    const key = `${code}\u0000${cell.hex.toUpperCase()}`;
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { code, name: describeColorName(cell.hex), hex: cell.hex.toUpperCase(), count: 1 });
  }
  const colorUsage = [...counts.values()].sort((left, right) => right.count - left.count || left.code.localeCompare(right.code, 'en', { numeric: true }));
  return { beadCount, colorUsage };
}

/**
 * 公开作品详情。`includeSnapshot=false`（匿名访客）时不返回完整图纸网格、色板 JSON 与色号清单——
 * 匿名只看服务端渲染的大图与统计（颜色数、总颗数）；色号网格、交互查看器和「用这张制作」需要登录（ADR-0021）。
 */
export async function getPublicCommunityWork(db: AnyDatabase, id: string, options: { includeSnapshot?: boolean } = {}) {
  pushSpan({ kind: 'service', name: 'community.getPublicWork' });
  const includeSnapshot = options.includeSnapshot ?? true;
  const [row] = await db.select({ ...publicSelection, engineVersion: communityRevisions.engineVersion, snapshot: communityRevisions.snapshot })
    .from(communityWorks)
    .innerJoin(communityRevisions, eq(communityRevisions.workId, communityWorks.id))
    .leftJoin(users, eq(users.id, communityWorks.authorUserId))
    .where(and(eq(communityWorks.id, id), ...publicBaseConditions()));
  if (!row || !row.publishedAt) return null;
  const snapshot = parseCommunitySnapshot(row.snapshot);
  const preview = communityPreviewSchema.safeParse(row.preview);
  if (!snapshot || !preview.success) return null;
  const tags = await tagsByWork(db, [row.id]);
  const colors = summarizePatternColors(snapshot.pattern);
  return {
    id: row.id,
    revisionId: row.revisionId,
    title: row.title,
    author: publicAuthor(row),
    boardProfile: row.boardProfile,
    palette: { kind: row.paletteKind, id: row.paletteId },
    width: row.width,
    height: row.height,
    colorCount: row.colorCount,
    beadCount: colors.beadCount,
    colorUsage: includeSnapshot ? colors.colorUsage : null,
    preview: preview.data,
    thumbnailUrl: communityThumbnailUrl(row.revisionId),
    largeImageUrl: communityThumbnailUrl(row.revisionId, 'large'),
    engineVersion: row.engineVersion,
    snapshot: includeSnapshot ? snapshot : null,
    tags: tags.get(row.id) ?? [],
    counts: { likes: row.likeCount, comments: row.commentCount, reuses: row.reuseCount },
    featured: row.featuredAt !== null,
    publishedAt: row.publishedAt.toISOString(),
    commentsLocked: row.commentsLocked,
  };
}

export async function listOwnCommunityWorks(db: AnyDatabase, userId: string) {
  const works = await db.select({
    id: communityWorks.id,
    lifecycleStatus: communityWorks.lifecycleStatus,
    version: communityWorks.version,
    currentPublishedRevisionId: communityWorks.currentPublishedRevisionId,
    likeCount: communityWorks.likeCount,
    commentCount: communityWorks.commentCount,
    reuseCount: communityWorks.reuseCount,
    createdAt: communityWorks.createdAt,
    updatedAt: communityWorks.updatedAt,
  }).from(communityWorks).where(eq(communityWorks.authorUserId, userId))
    .orderBy(desc(communityWorks.updatedAt), desc(communityWorks.id));
  if (works.length === 0) return [];
  const revisions = await db.select({
    id: communityRevisions.id,
    workId: communityRevisions.workId,
    revisionNumber: communityRevisions.revisionNumber,
    title: communityRevisions.title,
    sourceDesignId: communityRevisions.sourceDesignId,
    frozenDisplayName: communityRevisions.frozenDisplayName,
    status: communityRevisions.status,
    version: communityRevisions.version,
    preview: communityRevisions.preview,
    suggestedTags: communityRevisions.suggestedTags,
    submittedAt: communityRevisions.submittedAt,
    reviewedAt: communityRevisions.reviewedAt,
    reviewReason: communityRevisions.reviewReason,
    createdAt: communityRevisions.createdAt,
  }).from(communityRevisions).where(inArray(communityRevisions.workId, works.map((work) => work.id)))
    .orderBy(desc(communityRevisions.revisionNumber));
  const byWork = new Map<string, typeof revisions>();
  for (const revision of revisions) byWork.set(revision.workId, [...(byWork.get(revision.workId) ?? []), revision]);
  return works.map((work) => ({
    ...work,
    createdAt: work.createdAt.toISOString(),
    updatedAt: work.updatedAt.toISOString(),
    revisions: (byWork.get(work.id) ?? []).flatMap((revision) => {
      const preview = communityPreviewSchema.safeParse(revision.preview);
      return preview.success ? [{
        ...revision,
        preview: preview.data,
        submittedAt: revision.submittedAt?.toISOString() ?? null,
        reviewedAt: revision.reviewedAt?.toISOString() ?? null,
        createdAt: revision.createdAt.toISOString(),
      }] : [];
    }),
  }));
}

export async function listCommunityReviewQueue(db: AnyDatabase, input: unknown = {}) {
  const query = reviewQueueQuerySchema.parse(input);
  const where = and(eq(communityRevisions.status, 'pending_review'), eq(communityWorks.lifecycleStatus, 'active'));
  const [rows, totalRows] = await Promise.all([
    db.select({
      revisionId: communityRevisions.id,
      workId: communityRevisions.workId,
      revisionNumber: communityRevisions.revisionNumber,
      title: communityRevisions.title,
      version: communityRevisions.version,
      publicAuthorId: communityRevisions.publicAuthorId,
      frozenDisplayName: communityRevisions.frozenDisplayName,
      authorType: communityRevisions.authorType,
      preview: communityRevisions.preview,
      width: communityRevisions.width,
      height: communityRevisions.height,
      colorCount: communityRevisions.colorCount,
      boardProfile: communityRevisions.boardProfile,
      suggestedTags: communityRevisions.suggestedTags,
      submittedAt: communityRevisions.submittedAt,
      accountStatus: users.accountStatus,
    }).from(communityRevisions).innerJoin(communityWorks, eq(communityWorks.id, communityRevisions.workId))
      .leftJoin(users, eq(users.id, communityWorks.authorUserId))
      .where(where)
      .orderBy(communityRevisions.submittedAt, communityRevisions.id)
      .limit(query.size).offset(pageOffset(query.page, query.size)),
    db.select({ count: countExpression }).from(communityRevisions).innerJoin(communityWorks, eq(communityWorks.id, communityRevisions.workId)).where(where),
  ]);
  const items = rows.flatMap((row) => {
    const preview = communityPreviewSchema.safeParse(row.preview);
    const { publicAuthorId, frozenDisplayName, authorType, accountStatus, ...safeRow } = row;
    return preview.success ? [{
      ...safeRow,
      author: authorType === 'official'
        ? { authorType: 'official' as const, publicAuthorId: 'beadhue-official', displayName: '豆色绘官方' }
        : { authorType: 'user' as const, publicAuthorId, displayName: accountStatus === 'anonymized' ? ANONYMIZED_DISPLAY_NAME : frozenDisplayName },
      preview: preview.data,
      submittedAt: row.submittedAt?.toISOString() ?? null,
    }] : [];
  });
  return { items, ...pageMeta(readCount(totalRows), query.page, query.size) };
}

/** 所选审核材料才读取完整快照；不返回内部作者或来源设计身份。 */
export async function inspectCommunityRevision(db: AnyDatabase, revisionId: string) {
  const [row] = await db.select({
    id: communityRevisions.id, workId: communityRevisions.workId, title: communityRevisions.title,
    version: communityRevisions.version, revisionNumber: communityRevisions.revisionNumber, status: communityRevisions.status,
    snapshot: communityRevisions.snapshot, licenseVersion: communityRevisions.licenseVersion,
    suggestedTags: communityRevisions.suggestedTags,
    licenseConfirmedAt: communityRevisions.licenseConfirmedAt, currentPublishedRevisionId: communityWorks.currentPublishedRevisionId,
    lifecycleStatus: communityWorks.lifecycleStatus,
  }).from(communityRevisions).innerJoin(communityWorks, eq(communityWorks.id, communityRevisions.workId))
    .where(eq(communityRevisions.id, revisionId));
  if (!row) throw new AppError('NOT_FOUND', '审核版本不存在');
  const snapshot = parseCommunitySnapshot(row.snapshot);
  if (!snapshot) throw new AppError('STATE_CONFLICT', '审核快照不可读取');
  const [old] = row.currentPublishedRevisionId && row.currentPublishedRevisionId !== row.id
    ? await db.select({ title: communityRevisions.title, revisionNumber: communityRevisions.revisionNumber, snapshot: communityRevisions.snapshot })
      .from(communityRevisions).where(eq(communityRevisions.id, row.currentPublishedRevisionId)) : [];
  const previousSnapshot = parseCommunitySnapshot(old?.snapshot);
  // 作品当前正式标签（含停用的，便于审核员看出哪些建议已被采纳）。
  const workTags = await db.select({ id: communityTags.id, name: communityTags.name }).from(communityWorkTags)
    .innerJoin(communityTags, eq(communityTags.id, communityWorkTags.tagId))
    .where(eq(communityWorkTags.workId, row.workId)).orderBy(communityTags.sortOrder, communityTags.name);
  const { currentPublishedRevisionId: _privatePointer, ...safe } = row;
  return { ...safe, snapshot, workTags, licenseConfirmedAt: row.licenseConfirmedAt.toISOString(), previous: old && previousSnapshot ? { ...old, snapshot: previousSnapshot } : null };
}

export type CommunityRevisionInspection = Awaited<ReturnType<typeof inspectCommunityRevision>>;

/**
 * 缩略图渲染所需的最小材料及其可见性事实。
 * 公开条件与列表/详情一致：作品正常、修订已发布且是当前公开版本。
 */
export async function loadRevisionForThumbnail(db: AnyDatabase, revisionId: string) {
  const [row] = await db.select({
    id: communityRevisions.id,
    workId: communityRevisions.workId,
    status: communityRevisions.status,
    boardProfile: communityRevisions.boardProfile,
    snapshot: communityRevisions.snapshot,
    authorUserId: communityWorks.authorUserId,
    lifecycleStatus: communityWorks.lifecycleStatus,
    currentPublishedRevisionId: communityWorks.currentPublishedRevisionId,
  }).from(communityRevisions).innerJoin(communityWorks, eq(communityWorks.id, communityRevisions.workId))
    .where(eq(communityRevisions.id, revisionId));
  if (!row) return null;
  const snapshot = parseCommunitySnapshot(row.snapshot);
  if (!snapshot) return null;
  return {
    id: row.id,
    workId: row.workId,
    boardProfile: snapshot.boardProfile,
    pattern: snapshot.pattern,
    authorUserId: row.authorUserId,
    isPublic: row.lifecycleStatus === 'active' && row.status === 'published' && row.currentPublishedRevisionId === row.id,
  };
}
