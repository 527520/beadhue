/**
 * 按账号读配额（admin-round-3 12）：登录后换 IP 就能绕过 IP 桶，所以公开读接口
 * （详情 / 列表 / 评论）还要按账号计小时总量与「每小时不同作品数」，新账号走更紧的档位。
 * 这里用两个档位分别验证两道闸门（阈值压小，用例不必打满 1200 次）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestClient, type TestDatabase } from '@/../db/testClient';
import { setTestDb } from '@/lib/auth/db';
import { createSession } from '@/lib/auth/session';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookies';
import { publishWorkFixture } from '@/app/api/community/communityRouteFixture';

vi.mock('@/lib/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/config')>();
  return {
    ...actual,
    config: {
      ...actual.config,
      security: {
        ...actual.config.security,
        // 新账号档：总量 2 次、不同作品 50 件（隔离「总量」闸门）
        newAccountReadRateLimit: 2,
        newAccountReadDistinctWorks: 50,
        // 已建立账号档：总量 50 次、不同作品 1 件（隔离「不同作品数」闸门）
        accountReadRateLimit: 50,
        accountReadDistinctWorks: 1,
      },
    },
  };
});

let token: string | undefined;
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === SESSION_COOKIE_NAME && token ? { value: token } : undefined) }),
}));

import { GET } from './route';

let db: TestDatabase;

beforeEach(async () => {
  db = await createTestClient();
  setTestDb(db);
  token = undefined;
});

const requestWork = (workId: string) => GET(
  new Request(`http://localhost/api/community/works/${workId}`),
  { params: Promise.resolve({ id: workId }) },
);

describe('GET /api/community/works/[id] 的账号配额', () => {
  it('新账号（注册未满 24 小时）超过小时总量返回 429 + Retry-After', async () => {
    const fixture = await publishWorkFixture(db, { title: '新账号', email: 'fresh@example.test' });
    token = (await createSession(db, fixture.userId)).token;

    expect((await requestWork(fixture.workId)).status).toBe(200);
    expect((await requestWork(fixture.workId)).status).toBe(200); // 同一作品：不占「不同作品」额度
    const limited = await requestWork(fixture.workId);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
    expect((await limited.json()).error.code).toBe('RATE_LIMITED');
  });

  it('已建立账号每小时不同作品数超限返回 429，反复看同一件作品不算新作品', async () => {
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const first = await publishWorkFixture(db, { title: '作品一', email: 'veteran@example.test', createdAt: old });
    const second = await publishWorkFixture(db, { title: '作品二', email: 'other@example.test' });
    token = (await createSession(db, first.userId)).token;

    expect((await requestWork(first.workId)).status).toBe(200);
    expect((await requestWork(first.workId)).status).toBe(200); // 重复访问同一作品不计数
    const limited = await requestWork(second.workId);
    expect(limited.status).toBe(429);
    expect((await limited.json()).error.code).toBe('RATE_LIMITED');
  });

  it('匿名访客不受账号配额影响（只有 IP 桶）', async () => {
    const fixture = await publishWorkFixture(db, { title: '匿名', email: 'anon@example.test' });
    for (let i = 0; i < 4; i += 1) expect((await requestWork(fixture.workId)).status).toBe(200);
  });
});
