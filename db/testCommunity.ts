/**
 * 豆社发现类查询的测试夹具（仅测试导入）：直接写入公开作品行，字段可逐项指定。
 * 走完整投稿 / 审核流程的夹具见 src/app/api/community/communityRouteFixture.ts。
 */
import { eq } from 'drizzle-orm';
import { communityLikes, communityRevisions, communityTags, communityWorks, communityWorkTags, users } from './schema';
import type { TestDatabase } from './testClient';
import { COMMUNITY_LICENSE_VERSION, deriveCommunityPreview, type CommunitySnapshotV1 } from '@/lib/community/snapshot';
import { DEFAULT_GENERATION_PARAMS, type Pattern } from '@/lib/types';
import type { BoardProfileId } from '@/lib/boardProfiles';

export function solidPattern(width: number, height: number, colors: Array<[hex: string, code: string]> = [['#FC3D46', 'F02']]): Pattern {
  return {
    width,
    height,
    cells: Array.from({ length: width * height }, (_, index) => {
      const [hex, code] = colors[index % colors.length];
      return { hex, code, transparent: false };
    }),
  };
}

export async function seedAuthor(db: TestDatabase, input: { email: string; username?: string; createdAt?: Date }) {
  const [user] = await db.insert(users).values({
    email: input.email, username: input.username ?? null, emailVerifiedAt: new Date(),
    publicAuthorId: crypto.randomUUID(), ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  }).returning();
  return user;
}

export interface SeedWorkInput {
  author: { id: string; publicAuthorId: string | null; username?: string | null };
  title: string;
  official?: boolean;
  width?: number;
  height?: number;
  colorCount?: number;
  pattern?: Pattern;
  boardProfile?: BoardProfileId;
  paletteId?: string | null;
  paletteKind?: 'builtin' | 'custom';
  publishedAt?: Date;
  featured?: boolean;
  likes?: number;
  comments?: number;
  reuses?: number;
  tags?: string[];
  status?: 'published' | 'pending_review';
}

/** 写入一件公开（或待审）作品；标签名不存在就创建。 */
export async function seedWork(db: TestDatabase, input: SeedWorkInput) {
  const width = input.width ?? input.pattern?.width ?? 2;
  const height = input.height ?? input.pattern?.height ?? 2;
  const pattern = input.pattern ?? solidPattern(Math.min(width, 4), Math.min(height, 4));
  const publishedAt = input.publishedAt ?? new Date('2026-09-10T00:00:00Z');
  const snapshot: CommunitySnapshotV1 = {
    version: 1, engineVersion: 'seed', boardProfile: input.boardProfile ?? '5mm-29',
    paletteSelection: { palette: { kind: 'builtin', brand: 'MARD' }, kitTier: 0 },
    params: { ...DEFAULT_GENERATION_PARAMS, backgroundPrototype: null },
    pattern,
  };
  const [work] = await db.insert(communityWorks).values({
    authorUserId: input.author.id, authorType: input.official ? 'official' : 'user',
    likeCount: input.likes ?? 0, commentCount: input.comments ?? 0, reuseCount: input.reuses ?? 0,
    featuredAt: input.featured ? publishedAt : null, createdAt: publishedAt, updatedAt: publishedAt,
  }).returning();
  const status = input.status ?? 'published';
  const [revision] = await db.insert(communityRevisions).values({
    workId: work.id, revisionNumber: 1, status, title: input.title,
    authorType: input.official ? 'official' : 'user',
    publicAuthorId: input.official ? 'beadhue-official' : input.author.publicAuthorId ?? 'unknown',
    frozenDisplayName: input.official ? '豆色绘官方' : input.author.username ?? '豆友',
    licenseVersion: COMMUNITY_LICENSE_VERSION, licenseConfirmedAt: publishedAt,
    engineVersion: 'seed', boardProfile: input.boardProfile ?? '5mm-29',
    paletteKind: input.paletteKind ?? 'builtin', paletteId: input.paletteKind === 'custom' ? null : input.paletteId ?? 'MARD',
    width, height, colorCount: input.colorCount ?? 1, snapshot, preview: deriveCommunityPreview(pattern),
    submittedAt: publishedAt, publishedAt: status === 'published' ? publishedAt : null, createdAt: publishedAt, updatedAt: publishedAt,
  }).returning();
  if (status === 'published') await db.update(communityWorks).set({ currentPublishedRevisionId: revision.id }).where(eq(communityWorks.id, work.id));
  for (const name of input.tags ?? []) {
    let [tag] = await db.select().from(communityTags).where(eq(communityTags.name, name));
    if (!tag) [tag] = await db.insert(communityTags).values({ name, slug: `t-${crypto.randomUUID().slice(0, 12)}` }).returning();
    await db.insert(communityWorkTags).values({ workId: work.id, tagId: tag.id });
  }
  return { workId: work.id, revisionId: revision.id };
}

export async function seedLike(db: TestDatabase, workId: string, userId: string, createdAt = new Date()) {
  await db.insert(communityLikes).values({ workId, userId, createdAt });
}
