/**
 * GET /api/admin/logs：错误与事件流水（system_logs）只读分页查询（用户第 15 条）。
 * 权限复用 audit:read —— 只有管理员能读，因为行里带错误堆栈与调用链。
 */
import { getDb } from '@/lib/auth/db';
import { requireApiActor } from '@/lib/auth/dal';
import { okJson, withApiErrors } from '@/lib/auth/http';
import { listSystemLogs } from '@/lib/admin/queries';

const FILTER_KEYS = ['level', 'source', 'event', 'actorUserId', 'requestId', 'q', 'from', 'to', 'page', 'size', 'sort', 'order'];

async function get(request: Request) {
  await requireApiActor('audit:read');
  const search = new URL(request.url).searchParams;
  const input = Object.fromEntries(FILTER_KEYS.flatMap((key) => search.get(key) ? [[key, search.get(key)]] : []));
  return okJson(await listSystemLogs(getDb(), input), { headers: { 'Cache-Control': 'private, no-store' } });
}
export const GET = withApiErrors(get);
