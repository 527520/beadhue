/**
 * GET /api/admin/logs/slow-queries：阈值触发的慢查询（含调用链）只读分页查询（用户第 15 条）。
 * 只展示语句文本与调用链；参数值从未落库（drizzle 发 $n 占位符）。
 */
import { getDb } from '@/lib/auth/db';
import { requireApiActor } from '@/lib/auth/dal';
import { okJson, withApiErrors } from '@/lib/auth/http';
import { listSlowQueries } from '@/lib/admin/queries';

const FILTER_KEYS = ['q', 'route', 'minDurationMs', 'from', 'to', 'page', 'size', 'sort', 'order'];

async function get(request: Request) {
  await requireApiActor('audit:read');
  const search = new URL(request.url).searchParams;
  const input = Object.fromEntries(FILTER_KEYS.flatMap((key) => search.get(key) ? [[key, search.get(key)]] : []));
  return okJson(await listSlowQueries(getDb(), input), { headers: { 'Cache-Control': 'private, no-store' } });
}
export const GET = withApiErrors(get);
