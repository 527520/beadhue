import { and, desc, eq, ilike, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AnyDatabase } from '@/../db/client';
import { communityRevisions, communityTags, communityWorks, communityWorkTags, users } from '@/../db/schema';
import { countExpression, ordered, pageMeta, pageOffset, pageQueryFields, readCount, sortQueryFields } from '@/lib/admin/pagination';
import { ANONYMIZED_DISPLAY_NAME } from '@/lib/identity/publicAuthor';
import { OFFICIAL_PERSON, type AdminPerson } from '@/lib/admin/lookups';
import { AppError } from '@/lib/errors';
import { communityPreviewSchema, parseCommunitySnapshot } from './snapshot';

const querySchema = z.object({
  q: z.string().trim().max(80).default(''),
  status: z.enum(['all', 'active', 'withdrawn', 'removed']).default('all'),
  /** 公开状态：与 DTO 的 isPublic 派生口径完全一致（正常 + 有当前公开修订）。 */
  public: z.enum(['all', 'public', 'hidden']).default('all'),
  /** 按标签过滤（标签管理里的批量打标候选列表）：missing = 还没打这个标签。 */
  tagId: z.uuid().optional(),
  tagState: z.enum(['all', 'missing', 'has']).default('all'),
  ...sortQueryFields(['likes', 'updated']),
  ...pageQueryFields,
}).strict();

/** 公开状态的 SQL 谓词：只此一处，列表筛选与 DTO 派生都从这里来。 */
function publicConditions(scope: 'public' | 'hidden') {
  const visible = and(eq(communityWorks.lifecycleStatus, 'active'), isNotNull(communityWorks.currentPublishedRevisionId));
  return scope === 'public' ? visible : or(ne(communityWorks.lifecycleStatus, 'active'), isNull(communityWorks.currentPublishedRevisionId));
}

/**
 * 标签管理的批量打标候选（admin-round-3 08）：`missing` 只给还没打该标签的作品，
 * 避免管理员对着已经打好的作品重复勾选；`has` 用于反向核对。
 */
function tagStateCondition(tagId: string, state: 'missing' | 'has') {
  const exists = sql`exists (select 1 from ${communityWorkTags} cwt where cwt.work_id = ${communityWorks.id} and cwt.tag_id = ${tagId})`;
  return state === 'has' ? exists : sql`not ${exists}`;
}

export async function listManagedCommunityWorks(db: AnyDatabase, input: unknown) {
  const query = querySchema.parse(input);
  // Lists only read the small preview. A selected work fetches its frozen material separately.
  const displayRevision = sql`coalesce(${communityWorks.currentPublishedRevisionId},
    (select r.id from community_revisions r where r.work_id = ${communityWorks.id} order by r.revision_number desc limit 1))`;
  const conditions = [
    query.status === 'all' ? undefined : eq(communityWorks.lifecycleStatus, query.status),
    query.public === 'all' ? undefined : publicConditions(query.public),
    query.tagId && query.tagState !== 'all' ? tagStateCondition(query.tagId, query.tagState) : undefined,
    query.q ? or(ilike(communityRevisions.title, `%${query.q}%`), ilike(sql`case
      when ${communityRevisions.authorType} = 'official' then '豆色绘官方'
      when ${users.accountStatus} = 'anonymized' then ${ANONYMIZED_DISPLAY_NAME}
      else ${communityRevisions.frozenDisplayName} end`, `%${query.q}%`), sql`${communityWorks.id}::text = ${query.q}`) : undefined,
  ];
  const where = and(...conditions);
  const size = query.size;
  // 先数总数再把页码夹回范围内，避免「请求第 9 页（只剩 3 页）」时先返回空页让客户端闪一下。
  const total = readCount(await db.select({ count: countExpression }).from(communityWorks).leftJoin(communityRevisions, eq(communityRevisions.id, displayRevision))
    .leftJoin(users, eq(users.id, communityWorks.authorUserId)).where(where));
  const meta = pageMeta(total, query.page, size);
  const rows = await db.select({
    id: communityWorks.id, version: communityWorks.version, lifecycleStatus: communityWorks.lifecycleStatus,
    commentsLocked: communityWorks.commentsLocked, featuredAt: communityWorks.featuredAt,
    currentPublishedRevisionId: communityWorks.currentPublishedRevisionId,
    createdAt: communityWorks.createdAt, updatedAt: communityWorks.updatedAt, likeCount: communityWorks.likeCount,
    commentCount: communityWorks.commentCount, title: communityRevisions.title, preview: communityRevisions.preview,
    displayRevisionId: communityRevisions.id, width: communityRevisions.width, height: communityRevisions.height,
    authorType: communityRevisions.authorType, displayName: communityRevisions.frozenDisplayName,
    publicAuthorId: communityRevisions.publicAuthorId, avatarColor: users.avatarColor,
    accountStatus: users.accountStatus, revisionNumber: communityRevisions.revisionNumber,
  }).from(communityWorks).leftJoin(communityRevisions, eq(communityRevisions.id, displayRevision))
    .leftJoin(users, eq(users.id, communityWorks.authorUserId))
    .where(where).orderBy(...(query.sort === 'likes' ? [ordered(communityWorks.likeCount, query.order ?? 'desc')]
      : query.sort === 'updated' ? [ordered(communityWorks.updatedAt, query.order ?? 'desc')] : []), desc(communityWorks.createdAt), desc(communityWorks.id))
    .limit(size).offset(pageOffset(meta.page, size));
  // 后台表格的「标签」列（R15-10）：一页一次查询，按标签排序。
  const tagRows = rows.length === 0 ? [] : await db.select({ workId: communityWorkTags.workId, name: communityTags.name })
    .from(communityWorkTags).innerJoin(communityTags, eq(communityTags.id, communityWorkTags.tagId))
    .where(inArray(communityWorkTags.workId, rows.map((row) => row.id))).orderBy(communityTags.sortOrder, communityTags.name);
  const tagsOf = (workId: string) => tagRows.filter((tag) => tag.workId === workId).map((tag) => tag.name);
  const items = rows.map((row) => {
    const preview = communityPreviewSchema.safeParse(row.preview);
    const anonymized = row.accountStatus === 'anonymized';
    const author: AdminPerson = row.authorType === 'official' ? OFFICIAL_PERSON
      : { id: row.publicAuthorId ?? row.id, name: anonymized ? ANONYMIZED_DISPLAY_NAME : row.displayName ?? ANONYMIZED_DISPLAY_NAME, color: anonymized ? null : row.avatarColor };
    return {
      author,
      likeCount: row.likeCount, commentCount: row.commentCount, updatedAt: row.updatedAt.toISOString(), tags: tagsOf(row.id),
      id: row.id, version: row.version, lifecycleStatus: row.lifecycleStatus, commentsLocked: row.commentsLocked,
      isPublic: row.lifecycleStatus === 'active' && row.currentPublishedRevisionId !== null,
      featured: row.featuredAt !== null, title: row.title, revisionNumber: row.revisionNumber,
      displayName: row.authorType === 'official' ? '豆色绘官方' : row.accountStatus === 'anonymized' ? ANONYMIZED_DISPLAY_NAME : row.displayName,
      preview: preview.success ? preview.data : null,
      thumbnail: row.displayRevisionId && row.width && row.height ? { revisionId: row.displayRevisionId, width: row.width, height: row.height } : null,
    };
  });
  return { items, ...meta };
}

export async function inspectManagedCommunityWork(db: AnyDatabase, workId: string) {
  const [work] = await db.select({
    id: communityWorks.id, version: communityWorks.version, lifecycleStatus: communityWorks.lifecycleStatus,
    currentPublishedRevisionId: communityWorks.currentPublishedRevisionId, commentsLocked: communityWorks.commentsLocked,
    featuredAt: communityWorks.featuredAt, removedReason: communityWorks.removedReason,
    likeCount: communityWorks.likeCount, commentCount: communityWorks.commentCount, reuseCount: communityWorks.reuseCount,
  }).from(communityWorks).where(eq(communityWorks.id, workId));
  if (!work) throw new AppError('NOT_FOUND', '作品不存在');
  const [approved] = await db.select({ id: communityRevisions.id }).from(communityRevisions)
    .where(and(eq(communityRevisions.workId, workId), inArray(communityRevisions.status, ['published', 'superseded'])))
    .orderBy(desc(communityRevisions.revisionNumber)).limit(1);
  const [latest] = await db.select({
    id: communityRevisions.id, revisionNumber: communityRevisions.revisionNumber, status: communityRevisions.status,
  }).from(communityRevisions).where(eq(communityRevisions.workId, workId)).orderBy(desc(communityRevisions.revisionNumber)).limit(1);
  const materialId = work.currentPublishedRevisionId ?? approved?.id ?? latest?.id;
  const [revision] = materialId ? await db.select({
    id: communityRevisions.id, title: communityRevisions.title, revisionNumber: communityRevisions.revisionNumber,
    status: communityRevisions.status, snapshot: communityRevisions.snapshot,
  }).from(communityRevisions).where(and(eq(communityRevisions.id, materialId), eq(communityRevisions.workId, workId))) : [];
  const snapshot = parseCommunitySnapshot(revision?.snapshot);
  if (revision && !snapshot) throw new AppError('STATE_CONFLICT', '作品快照不可读取');
  const tags = await db.select({ id: communityTags.id, name: communityTags.name })
    .from(communityWorkTags).innerJoin(communityTags, eq(communityTags.id, communityWorkTags.tagId))
    .where(eq(communityWorkTags.workId, workId)).orderBy(communityTags.sortOrder, communityTags.name);
  return {
    id: work.id, version: work.version, lifecycleStatus: work.lifecycleStatus, commentsLocked: work.commentsLocked,
    featured: work.featuredAt !== null, isPublic: work.lifecycleStatus === 'active' && work.currentPublishedRevisionId !== null,
    canRestore: Boolean(approved), removedReason: work.removedReason,
    counts: { likes: work.likeCount, comments: work.commentCount, reuses: work.reuseCount },
    tags,
    latestRevision: latest ?? null, material: revision && snapshot ? { ...revision, snapshot } : null,
  };
}

export type ManagedCommunityWork = Awaited<ReturnType<typeof listManagedCommunityWorks>>['items'][number];
export type ManagedWorkInspection = Awaited<ReturnType<typeof inspectManagedCommunityWork>>;
