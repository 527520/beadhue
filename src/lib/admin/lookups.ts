import { desc, inArray } from 'drizzle-orm';
import type { AnyDatabase } from '@/../db/client';
import { communityComments, communityReports, communityRevisions, communityTags, communityWorks, officialBatches, users } from '@/../db/schema';
import { OFFICIAL_PUBLIC_AUTHOR_ID } from '@/lib/community/queries';
import { ANONYMIZED_DISPLAY_NAME, resolvePublicDisplayName } from '@/lib/identity/publicAuthor';
import { AVATAR_BEAD_COLORS } from '@/lib/render/beadTokens';

/**
 * 后台列表里的一个人：头像按 id 取色（与前台一致，用公开作者编号），color 是账号自己选的头像色，
 * null 时由头像组件按 id 取色。id 不用内部账号编号：队列接口不外露账号编号。
 */
export interface AdminPerson { id: string; name: string; color: string | null }

export const OFFICIAL_PERSON: AdminPerson = { id: OFFICIAL_PUBLIC_AUTHOR_ID, name: '豆色绘官方', color: AVATAR_BEAD_COLORS[0] };

interface PersonRow { username: string | null; email: string | null; publicAuthorId: string | null; avatarColor: string | null; accountStatus: string }

export function personOf(row: PersonRow): AdminPerson {
  const anonymized = row.accountStatus === 'anonymized' || !row.email;
  const name = anonymized ? ANONYMIZED_DISPLAY_NAME : resolvePublicDisplayName(row.username, row.email!);
  // 从没公开过作品的账号没有公开作者编号，按名字取色。
  return { id: row.publicAuthorId ?? `name:${name}`, name, color: anonymized ? null : row.avatarColor };
}

const ids = (values: Iterable<string | null | undefined>) => [...new Set([...values].filter((value): value is string => Boolean(value)))];

export async function loadPeople(db: AnyDatabase, userIds: Iterable<string | null | undefined>): Promise<Map<string, AdminPerson>> {
  const list = ids(userIds);
  if (!list.length) return new Map();
  const rows = await db.select({
    id: users.id, username: users.username, email: users.email, publicAuthorId: users.publicAuthorId,
    avatarColor: users.avatarColor, accountStatus: users.accountStatus,
  }).from(users).where(inArray(users.id, list));
  return new Map(rows.map((row) => [row.id, personOf(row)]));
}

export interface WorkLabel { title: string | null; revisionId: string }

/** 作品在后台显示的那一版：当前公开版，没有就取最新一版（与作品管理列表同一口径）。 */
export async function loadWorkLabels(db: AnyDatabase, workIds: Iterable<string | null | undefined>): Promise<Map<string, WorkLabel>> {
  const list = ids(workIds);
  if (!list.length) return new Map();
  const [works, revisions] = await Promise.all([
    db.select({ id: communityWorks.id, current: communityWorks.currentPublishedRevisionId }).from(communityWorks).where(inArray(communityWorks.id, list)),
    db.select({ id: communityRevisions.id, workId: communityRevisions.workId, title: communityRevisions.title })
      .from(communityRevisions).where(inArray(communityRevisions.workId, list)).orderBy(desc(communityRevisions.revisionNumber)),
  ]);
  const labels = new Map<string, WorkLabel>();
  for (const work of works) {
    const revision = revisions.find((item) => item.id === work.current) ?? revisions.find((item) => item.workId === work.id);
    if (revision) labels.set(work.id, { title: revision.title, revisionId: revision.id });
  }
  return labels;
}

export interface RevisionLabel { title: string | null; revisionNumber: number; workId: string }

export async function loadRevisionLabels(db: AnyDatabase, revisionIds: Iterable<string | null | undefined>): Promise<Map<string, RevisionLabel>> {
  const list = ids(revisionIds);
  if (!list.length) return new Map();
  const rows = await db.select({ id: communityRevisions.id, title: communityRevisions.title, revisionNumber: communityRevisions.revisionNumber, workId: communityRevisions.workId })
    .from(communityRevisions).where(inArray(communityRevisions.id, list));
  return new Map(rows.map(({ id, ...label }) => [id, label]));
}

export interface CommentLabel { body: string; authorName: string; workId: string }

export async function loadCommentLabels(db: AnyDatabase, commentIds: Iterable<string | null | undefined>): Promise<Map<string, CommentLabel>> {
  const list = ids(commentIds);
  if (!list.length) return new Map();
  const rows = await db.select({ id: communityComments.id, body: communityComments.body, authorName: communityComments.frozenDisplayName, workId: communityComments.workId })
    .from(communityComments).where(inArray(communityComments.id, list));
  return new Map(rows.map(({ id, ...label }) => [id, label]));
}

export async function loadTagNames(db: AnyDatabase, tagIds: Iterable<string | null | undefined>): Promise<Map<string, string>> {
  const list = ids(tagIds);
  if (!list.length) return new Map();
  const rows = await db.select({ id: communityTags.id, name: communityTags.name }).from(communityTags).where(inArray(communityTags.id, list));
  return new Map(rows.map((row) => [row.id, row.name]));
}

export async function loadBatchLabels(db: AnyDatabase, batchIds: Iterable<string | null | undefined>): Promise<Map<string, { name: string | null; createdAt: string }>> {
  const list = ids(batchIds);
  if (!list.length) return new Map();
  const rows = await db.select({ id: officialBatches.id, name: officialBatches.name, createdAt: officialBatches.createdAt }).from(officialBatches).where(inArray(officialBatches.id, list));
  return new Map(rows.map((row) => [row.id, { name: row.name, createdAt: row.createdAt.toISOString() }]));
}

export async function loadReportTargets(db: AnyDatabase, reportIds: Iterable<string | null | undefined>): Promise<Map<string, { targetType: 'work' | 'comment'; targetId: string }>> {
  const list = ids(reportIds);
  if (!list.length) return new Map();
  const rows = await db.select({ id: communityReports.id, targetType: communityReports.targetType, targetId: communityReports.targetId })
    .from(communityReports).where(inArray(communityReports.id, list));
  return new Map(rows.map(({ id, ...target }) => [id, target]));
}

/** 评论等长文本在列表里只放开头一段。 */
export function excerpt(text: string, length = 40): string {
  const chars = Array.from(text.replace(/\s+/gu, ' ').trim());
  return chars.length > length ? `${chars.slice(0, length).join('')}…` : chars.join('');
}

const escapeLike = (q: string) => q.replace(/[\\%_]/gu, (char) => `\\${char}`);

/** ILIKE 模式：转义通配符，搜「100%」不会变成匹配一切。 */
export function containsPattern(q: string): string {
  return `%${escapeLike(q)}%`;
}

/** 编号开头匹配（列表只显示编号前 8 位，管理员照着搜）。 */
export function startsWithPattern(q: string): string {
  return `${escapeLike(q)}%`;
}
