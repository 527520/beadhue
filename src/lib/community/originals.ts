import { lockOriginalReferences } from '@/lib/originals/lock';
/**
 * 作品原图（D49）业务规则。
 *
 * - 公开作品必须附带原图：草稿阶段由作者（或官方批量的管理员）上传，提交审核 / 发布前校验存在。
 * - 原图绝不公开：只有作品作者、审核员/管理员、以及成功引用过该修订的用户可以取回。
 * - 生命周期：作者撤回、注销、修订被驳回 → 立即删除；管理员下架 → 先封禁，30 天未恢复再删除；
 *   被新版替代的修订若仍有引用记录则保留（引用者需要它继续调参）。
 * - 对象删除是外部 I/O：事务内只标记 deleted_at，提交后再尽力清除对象；未清除的由维护任务补扫。
 */
import { persistOriginalAsset } from '@/lib/originals/assets';
import { createHash } from 'node:crypto';
import { and, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { AnyDatabase } from '@/../db/client';
import {
  communityOriginals,
  originalAssets,
  originalGarbage,
  communityReuses,
  communityRevisions,
  communityWorks,
} from '@/../db/schema';
import { lockActiveAccount } from '@/lib/auth/writeAccess';
import { authorize, type Actor } from '@/lib/auth/authorization';
import { AppError } from '@/lib/errors';
import { validateImageFile } from '@/lib/image/validation';
import type { ByteLruCache as OriginalByteCache } from './originalCache';
import type { OriginalObjectStore } from './originalStore';

export const ORIGINAL_BLOCK_RETENTION_DAYS = 30;

export interface OriginalSummary {
  revisionId: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  sha256: string;
}

function summarize(row: typeof communityOriginals.$inferSelect): OriginalSummary {
  return { revisionId: row.revisionId, mimeType: row.mimeType, byteSize: row.byteSize, width: row.width, height: row.height, sha256: row.sha256 };
}

async function loadRevisionForUpload(tx: AnyDatabase, revisionId: string) {
  const [row] = await tx.select({
    snapshot: communityRevisions.snapshot, id: communityRevisions.id, workId: communityRevisions.workId, status: communityRevisions.status,
    authorType: communityRevisions.authorType, authorUserId: communityWorks.authorUserId, lifecycleStatus: communityWorks.lifecycleStatus,
  }).from(communityRevisions).innerJoin(communityWorks, eq(communityWorks.id, communityRevisions.workId))
    .where(eq(communityRevisions.id, revisionId)).for('update');
  return row ?? null;
}

/** Resource eligibility must be checked before consuming an upload body, and again at commit. */
export async function assertRevisionOriginalUpload(db: AnyDatabase, actor: Actor, revisionId: string) {
    const account = await lockActiveAccount(db, actor.userId);
    actor = { userId: account.id, role: account.role, accountStatus: account.accountStatus, emailVerified: account.emailVerifiedAt !== null };
    const row = await loadRevisionForUpload(db, revisionId);
    if (!row) throw new AppError('NOT_FOUND', '修订不存在');
    const isAuthor = row.authorType === 'user' && row.authorUserId === actor.userId;
    const isOfficialManager = row.authorType === 'official' && authorize(actor, 'official:manage');
    if (!isAuthor && !isOfficialManager) throw new AppError('FORBIDDEN', '只有作品作者可以上传原图');
    if (row.status !== 'draft' || row.lifecycleStatus !== 'active') throw new AppError('STATE_CONFLICT', '只能为草稿修订上传原图');
    return row;
}

/** 上传（或替换）某草稿修订的原图。校验文件后写对象、再写行；旧对象在无其它引用时清除。 */
export async function storeRevisionOriginal(db: AnyDatabase, store: OriginalObjectStore, input: {
  actor: Actor; revisionId: string; bytes: Uint8Array; now?: Date;
}): Promise<OriginalSummary> {
  const validation = validateImageFile({ bytes: input.bytes, name: 'original' });
  if (!validation.ok) throw new AppError('VALIDATION', `原图不可用：${validation.code}`, 'original');
  const now = input.now ?? new Date();
  const sha256 = createHash('sha256').update(input.bytes).digest('hex');

  // 先校验权限与状态（不占用长事务做上传），再写对象，最后在短事务里落行。
  const revision = await db.transaction(async (tx) => {
    return assertRevisionOriginalUpload(tx, input.actor, input.revisionId);
  });
  const replaced = await db.transaction(async (tx) => {
    const current = await assertRevisionOriginalUpload(tx, input.actor, input.revisionId);
    const expected=(current.snapshot as {original?:{sha256:string}}|null)?.original?.sha256;
    if(expected && expected!==sha256)throw new AppError('VALIDATION','原图与当前公开修订不匹配，请先更新图纸','original');
    await lockOriginalReferences(tx);
    const asset = await persistOriginalAsset(tx,store,input.actor.userId,input.bytes,validation.type);
    const { cosKey,mimeType,width,height } = asset;
    const [existing] = await tx.select().from(communityOriginals).where(eq(communityOriginals.revisionId, revision.id)).for('update');
    const values = {
      workId: revision.workId, cosKey, mimeType, byteSize: input.bytes.byteLength, sha256,
      width, height,
      uploadedByUserId: input.actor.userId, createdAt: now, blockedAt: null, deletedAt: null, purgedAt: null,
    };
    if (existing) {
      if(existing.cosKey !== cosKey) await tx.insert(originalGarbage).values({cosKey:existing.cosKey}).onConflictDoNothing();
      const [updated] = await tx.update(communityOriginals).set(values).where(eq(communityOriginals.id, existing.id)).returning();
      return { row: updated, previousKey: existing.cosKey !== cosKey ? existing.cosKey : null };
    }
    const [created] = await tx.insert(communityOriginals).values({ revisionId: revision.id, ...values }).returning();
    return { row: created, previousKey: null };
  });
  if (replaced.previousKey) { try { await deleteObjectIfUnreferenced(db, store, replaced.previousKey); await db.delete(originalGarbage).where(eq(originalGarbage.cosKey,replaced.previousKey)); } catch { /* Deferred cleanup retains the replaced key. */ } }
  return summarize(replaced.row);
}

/** 新修订沿用上一版原图：复制行、共享对象键。没有可沿用的原图时返回 null。 */
export async function inheritRevisionOriginal(tx: AnyDatabase, input: { fromRevisionId: string; toRevisionId: string; workId: string; actorUserId: string; now?: Date }): Promise<OriginalSummary | null> {
  await lockOriginalReferences(tx);
  const [source] = await tx.select().from(communityOriginals)
    .where(and(eq(communityOriginals.revisionId, input.fromRevisionId), isNull(communityOriginals.deletedAt)));
  if (!source) return null;
  const [target] = await tx.select({ snapshot: communityRevisions.snapshot }).from(communityRevisions).where(eq(communityRevisions.id,input.toRevisionId));
  const expected = (target?.snapshot as { original?: {sha256:string} } | null)?.original?.sha256;
  if (expected && expected !== source.sha256) return null;
  const [created] = await tx.insert(communityOriginals).values({
    revisionId: input.toRevisionId, workId: input.workId, cosKey: source.cosKey, mimeType: source.mimeType,
    byteSize: source.byteSize, sha256: source.sha256, width: source.width, height: source.height,
    uploadedByUserId: input.actorUserId, createdAt: input.now ?? new Date(),
  }).onConflictDoNothing().returning();
  return created ? summarize(created) : null;
}

export async function findRevisionOriginal(db: AnyDatabase, revisionId: string) {
  const [row] = await db.select().from(communityOriginals)
    .where(and(eq(communityOriginals.revisionId, revisionId), isNull(communityOriginals.deletedAt)));
  return row ?? null;
}

/** 提交审核 / 官方发布前的门禁。 */
export async function assertRevisionHasOriginal(tx: AnyDatabase, revisionId: string): Promise<void> {
  const row = await findRevisionOriginal(tx, revisionId);
  if (!row) throw new AppError('ORIGINAL_REQUIRED', '公开作品必须附带原图，请先上传原图');
  const [revision] = await tx.select({ snapshot: communityRevisions.snapshot }).from(communityRevisions).where(eq(communityRevisions.id, revisionId));
  const expected = (revision?.snapshot as {original?:{sha256:string}} | null)?.original?.sha256;
  if (expected && row.sha256 !== expected) throw new AppError('ORIGINAL_REQUIRED', '当前原图与图纸不匹配，请更新原图后再公开');
}

export type OriginalAccess = 'author' | 'moderator' | 'reuser';

/** 判定访问资格；无资格返回 null。封禁中的原图只对审核员开放。 */
export async function resolveOriginalAccess(db: AnyDatabase, actor: Actor | null, revisionId: string): Promise<{ access: OriginalAccess; row: typeof communityOriginals.$inferSelect } | null> {
  if (!actor || actor.accountStatus !== 'active') return null;
  const row = await findRevisionOriginal(db, revisionId);
  if (!row) return null;
  if (authorize(actor, 'community:moderate')) return { access: 'moderator', row };
  if (row.blockedAt) return null;
  const [work] = await db.select({ authorUserId: communityWorks.authorUserId, lifecycleStatus: communityWorks.lifecycleStatus })
    .from(communityWorks).where(eq(communityWorks.id, row.workId));
  if (!work) return null;
  if (work.authorUserId === actor.userId) return { access: 'author', row };
  const [reuse] = await db.select({ id: communityReuses.id }).from(communityReuses)
    .where(and(eq(communityReuses.revisionId, revisionId), eq(communityReuses.userId, actor.userId))).limit(1);
  if (reuse) return { access: 'reuser', row };
  return null;
}

/**
 * 按已判定的访问资格读取字节（命中进程缓存则不再打对象存储）。
 * 管理端原图预览若复用本函数，传同一个缓存实例即可共享字节。
 */
export async function readOriginalBody(store: OriginalObjectStore, row: { cosKey: string; mimeType: string }, cache?: OriginalByteCache | null) {
  const cached = cache?.get(row.cosKey);
  if (cached) return { body: cached, contentType: row.mimeType };
  const object = await store.get(row.cosKey);
  if (!object) throw new AppError('NOT_FOUND', '原图对象已不存在');
  cache?.set(row.cosKey, object.body);
  return { body: object.body, contentType: object.contentType ?? row.mimeType };
}

/**
 * 读取原图字节（鉴权在前，命中进程缓存则不再打 COS）。
 * `cache` 由调用方注入（见 originalCache.ts），未传则每次直读对象存储。
 */
export async function readRevisionOriginal(db: AnyDatabase, store: OriginalObjectStore, actor: Actor | null, revisionId: string, cache?: OriginalByteCache | null) {
  const resolved = await resolveOriginalAccess(db, actor, revisionId);
  if (!resolved) throw new AppError('NOT_FOUND', '原图不存在或无权访问');
  const { body, contentType } = await readOriginalBody(store, resolved.row, cache);
  return { ...resolved, body, contentType };
}

/** 事务内标记删除；返回需要在提交后清除的对象键（已去重）。 */
export async function markOriginalsDeleted(tx: AnyDatabase, where: { workId?: string; revisionIds?: string[] }, now: Date): Promise<string[]> {
  const conditions = [isNull(communityOriginals.deletedAt)];
  if (where.workId) conditions.push(eq(communityOriginals.workId, where.workId));
  if (where.revisionIds) {
    if (where.revisionIds.length === 0) return [];
    conditions.push(inArray(communityOriginals.revisionId, where.revisionIds));
  }
  const rows = await tx.update(communityOriginals).set({ deletedAt: now }).where(and(...conditions)).returning();
  return [...new Set(rows.map((row) => row.cosKey))];
}

/** 被新版替代的修订：没有任何引用记录时删除其原图；有引用者则保留供其继续调参。 */
export async function retireSupersededOriginal(tx: AnyDatabase, revisionId: string, now: Date): Promise<string[]> {
  const [reuse] = await tx.select({ id: communityReuses.id }).from(communityReuses).where(eq(communityReuses.revisionId, revisionId)).limit(1);
  if (reuse) return [];
  return markOriginalsDeleted(tx, { revisionIds: [revisionId] }, now);
}

export async function blockWorkOriginals(tx: AnyDatabase, workId: string, now: Date): Promise<void> {
  await tx.update(communityOriginals).set({ blockedAt: now })
    .where(and(eq(communityOriginals.workId, workId), isNull(communityOriginals.deletedAt), isNull(communityOriginals.blockedAt)));
}

export async function unblockWorkOriginals(tx: AnyDatabase, workId: string): Promise<void> {
  await tx.update(communityOriginals).set({ blockedAt: null })
    .where(and(eq(communityOriginals.workId, workId), isNull(communityOriginals.deletedAt)));
}

/** 仅当没有任何未删除行仍引用该对象键时才真正删除对象。 */
export async function deleteObjectIfUnreferenced(db: AnyDatabase, store: OriginalObjectStore, cosKey: string): Promise<boolean> {
  return db.transaction(async tx => {
    await lockOriginalReferences(tx);
  const [live] = await tx.select({ count: sql<number>`count(*)::int` }).from(communityOriginals)
    .where(and(eq(communityOriginals.cosKey, cosKey), isNull(communityOriginals.deletedAt)));
  if (Number(live?.count ?? 0) > 0) return false;
  const [privateUse] = await tx.select({id: originalAssets.id}).from(originalAssets).where(eq(originalAssets.cosKey, cosKey)).limit(1);
  if (privateUse) return false;
  await store.delete(cosKey);
  return true;
  });
}

/**
 * 清除已标记删除的对象：成功后置 purged_at。被其它未删除行共享的键只标记不删对象。
 * 供事务提交后的尽力清理与维护任务共用；失败留给下次补扫。
 */
export async function purgeDeletedOriginals(db: AnyDatabase, store: OriginalObjectStore, options: { limit?: number; keys?: string[] } = {}): Promise<{ purged: number; failed: number }> {
  const conditions = [sql`${communityOriginals.deletedAt} is not null`, isNull(communityOriginals.purgedAt)];
  if (options.keys) {
    if (options.keys.length === 0) return { purged: 0, failed: 0 };
    conditions.push(inArray(communityOriginals.cosKey, options.keys));
  }
  const rows = await db.select({ id: communityOriginals.id, cosKey: communityOriginals.cosKey }).from(communityOriginals)
    .where(and(...conditions)).limit(options.limit ?? 200);
  let purged = 0; let failed = 0;
  const handledKeys = new Set<string>();
  for (const row of rows) {
    try {
      if (!handledKeys.has(row.cosKey)) {
        await deleteObjectIfUnreferenced(db, store, row.cosKey);
        handledKeys.add(row.cosKey);
      }
      await db.update(communityOriginals).set({ purgedAt: new Date() }).where(eq(communityOriginals.id, row.id));
      purged += 1;
    } catch {
      failed += 1;
    }
  }
  return { purged, failed };
}

/** 事务提交后的尽力清理：失败不影响响应，维护任务会按 deleted_at 补扫。 */
export function purgeOriginalsSoon(db: AnyDatabase, store: OriginalObjectStore, keys: string[] | undefined): void {
  if (!keys || keys.length === 0) return;
  void purgeDeletedOriginals(db, store, { keys }).catch(() => undefined);
}

/** 下架超过保留期仍未恢复的作品原图：标记删除并清除对象。 */
export async function expireBlockedOriginals(db: AnyDatabase, store: OriginalObjectStore, now: Date = new Date()): Promise<{ expired: number; purged: number; failed: number }> {
  const cutoff = new Date(now.getTime() - ORIGINAL_BLOCK_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db.update(communityOriginals).set({ deletedAt: now })
    .where(and(isNull(communityOriginals.deletedAt), lt(communityOriginals.blockedAt, cutoff))).returning();
  const keys = [...new Set(rows.map((row) => row.cosKey))];
  const result = await purgeDeletedOriginals(db, store, { keys });
  return { expired: rows.length, ...result };
}
