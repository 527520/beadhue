/**
 * /api/admin/logs 集成测试（用户第 15 条）：
 * - 未处理异常只落一条 system_logs，且 request_id 与 500 响应体里的 requestId 完全一致；
 * - 4xx/429 不落库（不把攻击流量放大成写库流量）；
 * - 管理员可读，审核员 403，响应一律 private, no-store。
 */
import { beforeEach, expect, it, vi } from 'vitest';
import { createTestClient, type TestDatabase } from '@/../db/testClient';
import { systemLogs, users } from '@/../db/schema';
import { setTestDb } from '@/lib/auth/db';
import { createSession } from '@/lib/auth/session';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookies';
import { AppError } from '@/lib/errors';
import { withApiErrors } from '@/lib/auth/http';
import { awaitLogWrites } from '@/lib/observability/log';
import { GET } from './route';
import { GET as database } from './database/route';

let token: string | undefined;
let db: TestDatabase;
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => name === SESSION_COOKIE_NAME && token ? { value: token } : undefined }) }));
beforeEach(async () => { db = await createTestClient(); setTestDb(db); token = undefined; });

const logs = (query = '') => GET(new Request(`http://localhost/api/admin/logs${query}`));

it('未处理异常落一条 system_logs，request_id 与 500 响应体一致', async () => {
  const boom = withApiErrors(async (_request: Request): Promise<Response> => {
    throw new Error('boom-integration');
  });
  const response = await boom(new Request('http://localhost/api/admin/logs?level=error', { headers: { 'x-forwarded-for': '203.0.113.42' } }));
  expect(response.status).toBe(500);
  const body = await response.json() as { requestId: string; error: { code: string } };
  expect(body.error.code).toBe('INTERNAL');
  await awaitLogWrites();

  const rows = await db.select().from(systemLogs);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    source: 'api', event: 'api.unhandled', level: 'error', status: 500,
    // 网络地址只存掩码（IPv4 末段清零），原始 IP 绝不落库
    ipMasked: '203.0.113.0', method: 'GET', path: '/api/admin/logs',
  });
  expect(rows[0].requestId).toBe(body.requestId);
  expect(rows[0].message).toContain('boom-integration');
});

it('4xx 与 429 不写日志（避免把攻击流量放大成写库流量）', async () => {
  const rejected = withApiErrors(async (_request: Request): Promise<Response> => {
    throw new AppError('RATE_LIMITED', '请求过于频繁');
  });
  expect((await rejected(new Request('http://localhost/api/admin/logs'))).status).toBe(429);
  const invalid = withApiErrors(async (_request: Request): Promise<Response> => {
    throw new AppError('VALIDATION', '参数不合法');
  });
  expect((await invalid(new Request('http://localhost/api/admin/logs'))).status).toBe(400);
  await awaitLogWrites();
  expect(await db.select().from(systemLogs)).toHaveLength(0);
});

it('管理员可读运行日志，审核员 403，且响应不被缓存', async () => {
  expect((await logs()).status).toBe(401);
  for (const role of ['user', 'moderator', 'admin'] as const) {
    const [account] = await db.insert(users).values({ email: `${role}@example.test`, role, emailVerifiedAt: new Date() }).returning();
    token = (await createSession(db, account.id)).token;
    const response = await logs();
    expect(response.status, role).toBe(role === 'admin' ? 200 : 403);
    if (role === 'admin') {
      expect(response.headers.get('cache-control')).toContain('no-store');
      const body = await response.json() as { items: unknown[]; total: number; page: number; size: number; totalPages: number };
      expect(body.items).toEqual([]);
      expect(body.page).toBe(1);
      expect(body.totalPages).toBe(1);
    }
  }
  expect((await logs('?level=nonsense')).status).toBe(400);
  expect((await logs('?from=2026-09-05&to=2026-09-01')).status).toBe(400);
});

it('数据库健康读数在 PGlite 下优雅降级，不整页报错', async () => {
  const [account] = await db.insert(users).values({ email: 'db-admin@example.test', role: 'admin', emailVerifiedAt: new Date() }).returning();
  token = (await createSession(db, account.id)).token;
  const response = await database();
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toContain('no-store');
  const body = await response.json() as {
    pool: unknown; activity: { available: boolean; reason: string | null };
    statements: { available: boolean; hint: string }; checkedAt: string;
  };
  // 测试库是进程内 PGlite：没有 node-postgres 连接池，也没有装 pg_stat_statements
  expect(body.pool).toBeNull();
  expect(body.statements.available).toBe(false);
  expect(body.statements.hint.length).toBeGreaterThan(0);
  expect(body.checkedAt).toBeTruthy();
  expect(typeof body.activity.available).toBe('boolean');
});

it('按级别/来源/账号/请求编号/时间筛选，并支持页码分页', async () => {
  const [account] = await db.insert(users).values({ email: 'filter-admin@example.test', role: 'admin', emailVerifiedAt: new Date() }).returning();
  token = (await createSession(db, account.id)).token;
  await db.insert(systemLogs).values(Array.from({ length: 25 }, (_, index) => ({
    level: index % 2 === 0 ? 'error' as const : 'warn' as const,
    source: index % 3 === 0 ? 'api' : 'render',
    event: index === 7 ? 'api.unhandled' : 'render.failed',
    actorUserId: index < 5 ? account.id : null,
    requestId: `req-${index}`,
    message: `消息 ${index}`,
    createdAt: new Date(2026, 8, 10, 0, index),
  })));
  const body = async (query: string) => await (await logs(query)).json() as { items: Array<{ level: string; source: string; requestId: string | null }>; total: number; page: number; size: number; totalPages: number };
  expect(await body('?size=10')).toMatchObject({ total: 25, page: 1, size: 10, totalPages: 3 });
  const second = await body('?size=10&page=2');
  expect(second.items).toHaveLength(10); expect(second.page).toBe(2);
  // 最后一页不足一页也要给出正确总数
  expect((await body('?size=10&page=3')).items).toHaveLength(5);
  expect((await body('?level=warn&size=50')).items.every((item) => item.level === 'warn')).toBe(true);
  expect((await body('?source=api&size=50')).items.every((item) => item.source === 'api')).toBe(true);
  expect((await body('?q=req-7&size=50')).items.map((item) => item.requestId)).toEqual(['req-7']);
  expect((await body(`?actorUserId=${account.id}&size=50`)).total).toBe(5);
  expect((await body('?from=2026-09-10&to=2026-09-10&size=50')).total).toBe(25);
  expect((await logs('?actorUserId=not-a-uuid')).status).toBe(400);
});
