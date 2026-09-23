/**
 * 豆社路由测试夹具（仅测试使用；应用代码不引用本文件）。
 *
 * 发布一件公开作品的流程与 `works/[id]/like/route.test.ts` 一致：
 * 建号 → 建设计 → 创建投稿 → 挂原图 → 提交审核 → 审核通过。
 * admin-round-3 12 新增的多个路由用例（缩略图 / 原图 / 账号读配额）都要用到，
 * 抽到一处避免三份几乎相同的种子代码各自漂移。
 */
import { createMemoryOriginalStore, type OriginalObjectStore } from '@/lib/community/originalStore';
import { createCommunityWork, reviewCommunityRevision, submitCommunityRevision } from '@/lib/community/service';
import { COMMUNITY_LICENSE_VERSION } from '@/lib/community/snapshot';
import { attachTestOriginal } from '@/../db/testOriginals';
import { designs, users } from '@/../db/schema';
import { DEFAULT_GENERATION_PARAMS } from '@/lib/types';
import type { TestDatabase } from '@/../db/testClient';
import type { Actor, UserRole } from '@/lib/auth/authorization';

export interface PublishedWorkFixture {
  workId: string;
  revisionId: string;
  userId: string;
  actor: Actor;
  store: OriginalObjectStore & { objects: Map<string, { body: Buffer; contentType: string | null }> };
}

/** 存档用户行（role 默认 admin，便于同一账号完成发布审核）。 */
export async function createTestUser(db: TestDatabase, input: { email: string; role?: UserRole; createdAt?: Date }) {
  const [user] = await db.insert(users).values({
    email: input.email,
    role: (input.role ?? 'admin'),
    emailVerifiedAt: new Date(),
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  }).returning();
  return user;
}

export function actorFor(user: { id: string; role: string }, createdAt?: Date): Actor {
  return {
    userId: user.id,
    role: user.role as UserRole,
    emailVerified: true,
    accountStatus: 'active',
    accountCreatedAt: createdAt ?? undefined,
  };
}

/** 发布一件公开作品并返回夹具；原图落在内存对象存储里（调用方需 setOriginalStore(store)）。 */
export async function publishWorkFixture(
  db: TestDatabase,
  input: { title: string; email: string; createdAt?: Date; mode?: 'published' | 'draft' },
): Promise<PublishedWorkFixture> {
  const user = await createTestUser(db, { email: input.email, createdAt: input.createdAt });
  const actor = actorFor(user, input.createdAt);
  const designId = crypto.randomUUID();
  await db.insert(designs).values({
    id: designId, userId: user.id, name: input.title, payloadBytes: 1, project: {
      format: 'doupu-project', version: 3, engineVersion: 'test', boardProfile: '5mm-29', name: input.title,
      createdAt: '2026-09-05T00:00:00Z', updatedAt: '2026-09-05T00:00:00Z', params: DEFAULT_GENERATION_PARAMS,
      paletteSelection: { palette: { kind: 'builtin', brand: 'MARD' }, kitTier: 0 },
      pattern: { width: 1, height: 1, cells: [{ hex: '#FC3D46', code: 'F02', transparent: false }] },
    },
  });
  const work = await createCommunityWork(db, { actor, designId, expectedDesignRevision: 1, title: input.title, licenseVersion: COMMUNITY_LICENSE_VERSION });
  const store = createMemoryOriginalStore();
  await attachTestOriginal(db, actor, work.revision.id, store);
  if (input.mode === 'draft') {
    return { workId: work.work.id, revisionId: work.revision.id, userId: user.id, actor, store };
  }
  const pending = await submitCommunityRevision(db, { actor, revisionId: work.revision.id, expectedVersion: 1 });
  await reviewCommunityRevision(db, {
    actor, revisionId: pending.id, expectedVersion: pending.version, decision: 'published', reason: '测试公开作品', requestId: 'test',
  });
  return { workId: work.work.id, revisionId: work.revision.id, userId: user.id, actor, store };
}
