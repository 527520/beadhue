/**
 * 慢查询与日志详情端点（用户第 15 条）：调用链、筛选、分页、权限。
 * 这两条读路径是「不进服务器排障」的核心，之前没有测试覆盖。
 */
import { beforeEach, expect, it, vi } from 'vitest';
import { createTestClient, type TestDatabase } from '@/../db/testClient';
import { slowQueries, systemLogs, users } from '@/../db/schema';
import { setTestDb } from '@/lib/auth/db';
import { createSession } from '@/lib/auth/session';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookies';
import { GET as slowList } from './slow-queries/route';
import { GET as detail } from './[id]/route';

let token: string | undefined;
let db: TestDatabase;
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => name === SESSION_COOKIE_NAME && token ? { value: token } : undefined }) }));
beforeEach(async () => { db = await createTestClient(); setTestDb(db); token = undefined; });

const slow = (query = '') => slowList(new Request(`http://localhost/api/admin/logs/slow-queries${query}`));
const one = (id: string) => detail(new Request(`http://localhost/api/admin/logs/${id}`), { params: Promise.resolve({ id }) });

async function asAdmin() {
  const [account] = await db.insert(users).values({ email: `logs-${crypto.randomUUID()}@example.test`, role: 'admin', emailVerifiedAt: new Date() }).returning();
  token = (await createSession(db, account.id)).token;
  return account;
}

it('慢查询列表按耗时/路由/关键词筛选并分页，调用链完整返回', async () => {
  await asAdmin();
  await db.insert(slowQueries).values(Array.from({ length: 12 }, (_, index) => ({
    requestId: `req-${index}`, route: index % 2 === 0 ? '/api/admin/community/works' : '/community',
    method: 'GET', statement: 'select * from community_works where id = $1', durationMs: 600 + index,
    rowCount: index, chain: [{ kind: 'service' as const, name: `community.listPublicWorks` }, { kind: 'db' as const, name: 'select' }],
  })));
  const first = await (await slow('?size=10')).json() as { items: Array<{ durationMs: number; chain: Array<{ name: string }>; statement: string }>; total: number; totalPages: number };
  expect(first.total).toBe(12); expect(first.totalPages).toBe(2); expect(first.items).toHaveLength(10);
  // 调用链是排障的关键信息：必须原样带出（路由 → 服务 → SQL）。
  expect(first.items[0].chain).toHaveLength(2);
  expect(first.items[0].statement).toContain('$1');
  // 参数值从不落库：语句里不该出现具体取值。
  expect(first.items[0].statement).not.toContain('req-');
  const slowest = await (await slow('?minDurationMs=605')).json() as { total: number };
  expect(slowest.total).toBe(7);
  // route 是子串匹配（排障时通常只记得路径片段），所以这里用一个更具体的片段断言。
  const route = await (await slow('?route=community/works&size=50')).json() as { items: Array<{ statement: string }>; total: number };
  expect(route.total).toBe(6);
  expect(await (await slow('?q=community_works&size=50')).json()).toMatchObject({ total: 12 });
  expect((await slow('?size=7')).status).toBe(400);
  expect((await slow('?minDurationMs=abc')).status).toBe(400);
});

it('单条日志详情同时给出同一请求编号的全部行', async () => {
  await asAdmin();
  const rows = await db.insert(systemLogs).values([
    { level: 'error' as const, source: 'api', event: 'api.unhandled', requestId: 'req-shared', message: '第一段' },
    { level: 'warn' as const, source: 'security', event: 'security.login_lockout', requestId: 'req-shared', message: '第二段' },
    { level: 'info' as const, source: 'api', event: 'api.ok', requestId: 'req-other', message: '别的请求' },
  ]).returning();
  const body = await (await one(rows[0].id)).json() as { item: { id: string; message: string }; related: Array<{ requestId: string | null }> };
  expect(body.item.id).toBe(rows[0].id);
  expect(body.item.message).toBe('第一段');
  expect(body.related.map((entry) => entry.requestId)).toEqual(['req-shared', 'req-shared']);
});

it('未登录 401、审核员 403（堆栈只给管理员看）', async () => {
  expect((await slow()).status).toBe(401);
  const [moderator] = await db.insert(users).values({ email: 'logs-moderator@example.test', role: 'moderator', emailVerifiedAt: new Date() }).returning();
  token = (await createSession(db, moderator.id)).token;
  expect((await slow()).status).toBe(403);
  expect((await one(crypto.randomUUID())).status).toBe(403);
});
