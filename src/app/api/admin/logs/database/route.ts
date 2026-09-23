/**
 * GET /api/admin/logs/database：连接池 + pg_stat_activity + 库大小 + pg_stat_statements 说明（用户第 15 条）。
 * 权限用 audit:read：这里是运行事实，不给普通审核员看。
 */
import { getDb } from '@/lib/auth/db';
import { requireApiActor } from '@/lib/auth/dal';
import { okJson, withApiErrors } from '@/lib/auth/http';
import { readDatabaseHealth } from '@/lib/admin/dbHealth';

async function get() {
  await requireApiActor('audit:read');
  return okJson(await readDatabaseHealth(getDb()), { headers: { 'Cache-Control': 'private, no-store' } });
}
export const GET = withApiErrors(get);
