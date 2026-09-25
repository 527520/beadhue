import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { AnyDatabase } from '@/../db/client';
import { communityWorks, designs } from '@/../db/schema';
import { countExpression } from '@/lib/admin/pagination';

export interface MyStats {
  /** 云端未删除的设计数 */
  designs: number;
  /** 本人（非官方身份）当前公开的作品数 */
  publicWorks: number;
  /** 这些公开作品收到的喜欢总数 */
  likes: number;
}

/** 「我的」页头统计：设计数、公开作品数、获赞总数。 */
export async function getMyStats(db: AnyDatabase, userId: string): Promise<MyStats> {
  const [[design], [works]] = await Promise.all([
    db.select({ count: countExpression }).from(designs).where(and(eq(designs.userId, userId), isNull(designs.deletedAt))),
    db.select({ count: countExpression, likes: sql<number>`coalesce(sum(${communityWorks.likeCount}), 0)::int` }).from(communityWorks).where(and(
      eq(communityWorks.authorUserId, userId), eq(communityWorks.authorType, 'user'),
      eq(communityWorks.lifecycleStatus, 'active'), isNotNull(communityWorks.currentPublishedRevisionId),
    )),
  ]);
  return { designs: Number(design?.count ?? 0), publicWorks: Number(works?.count ?? 0), likes: Number(works?.likes ?? 0) };
}
