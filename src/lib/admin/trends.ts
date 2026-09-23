import { gte, sql, type SQLWrapper } from 'drizzle-orm';
import { z } from 'zod';
import type { AnyDatabase } from '@/../db/client';
import { communityLikes, communityRevisions, users } from '@/../db/schema';
import { pushSpan } from '@/lib/observability/context';

export const trendsQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }).strict();

const DAY_MS = 24 * 60 * 60 * 1000;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 上海时区的日期串（YYYY-MM-DD）。 */
function shanghaiDate(time: number): string {
  return new Date(time + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

export interface TrendDay { date: string; submissions: number; likes: number; newUsers: number }

/**
 * 后台总览趋势（R15-02）：最近 N 天（含今天，按上海时区切日）每日投稿、点赞与新用户。
 * 全部来自业务事实表：投稿 = 修订的 submitted_at，点赞 = community_likes，新用户 = users.created_at；
 * 取消的点赞已从事实表删除，因此不计入。
 */
export async function getAdminTrends(db: AnyDatabase, input: unknown = {}, now: Date = new Date()) {
  pushSpan({ kind: 'service', name: 'admin.getTrends' });
  const { days } = trendsQuerySchema.parse(input);
  const dates = Array.from({ length: days }, (_, index) => shanghaiDate(now.getTime() - (days - 1 - index) * DAY_MS));
  const start = new Date(`${dates[0]}T00:00:00+08:00`);
  const dayOf = (column: SQLWrapper) => sql<string>`to_char(${column} at time zone 'Asia/Shanghai', 'YYYY-MM-DD')`;
  const count = sql<number>`count(*)::int`;
  const toMap = (rows: Array<{ day: string; count: number }>) => new Map(rows.map((row) => [row.day, Number(row.count)]));
  const [submissions, likes, newUsers] = await Promise.all([
    db.select({ day: dayOf(communityRevisions.submittedAt), count }).from(communityRevisions)
      .where(gte(communityRevisions.submittedAt, start)).groupBy(dayOf(communityRevisions.submittedAt)).then(toMap),
    db.select({ day: dayOf(communityLikes.createdAt), count }).from(communityLikes)
      .where(gte(communityLikes.createdAt, start)).groupBy(dayOf(communityLikes.createdAt)).then(toMap),
    db.select({ day: dayOf(users.createdAt), count }).from(users)
      .where(gte(users.createdAt, start)).groupBy(dayOf(users.createdAt)).then(toMap),
  ]);
  const items: TrendDay[] = dates.map((date) => ({
    date, submissions: submissions.get(date) ?? 0, likes: likes.get(date) ?? 0, newUsers: newUsers.get(date) ?? 0,
  }));
  return { days, timezone: 'Asia/Shanghai', from: dates[0], to: dates.at(-1)!, items };
}
