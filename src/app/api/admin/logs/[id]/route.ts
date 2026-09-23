/**
 * GET /api/admin/logs/[id]：单条运行日志详情 + 同一 request_id 的全部行（用户第 15 条）。
 * 「同一次请求都发生了什么」是排障时最需要的视图，所以详情一次带齐。
 */
import { getDb } from '@/lib/auth/db';
import { requireApiActor } from '@/lib/auth/dal';
import { okJson, withApiErrors } from '@/lib/auth/http';
import { readSystemLog } from '@/lib/admin/queries';

async function get(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireApiActor('audit:read');
  const { id } = await params;
  return okJson(await readSystemLog(getDb(), id), { headers: { 'Cache-Control': 'private, no-store' } });
}
export const GET = withApiErrors(get);
