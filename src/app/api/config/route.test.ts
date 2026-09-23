import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestClient } from '@/../db/testClient';
import { setTestDb } from '@/lib/auth/db';

const { publicConfigMock } = vi.hoisted(() => ({
  publicConfigMock: vi.fn(),
}));

vi.mock('@/lib/config', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/config')>(),
  publicConfig: publicConfigMock,
}));

import { GET } from './route';

beforeAll(async () => {
  // admin-round-3 12 起 GET /api/config 先过每 IP 限流（要读库）：注入测试库，
  // 用例才真正走到 publicConfig 抛错的分支，而不是在 getDb() 就失败。
  setTestDb(await createTestClient());
});

describe('GET /api/config', () => {
  it('未知异常返回统一 JSON，并沿用请求 ID', async () => {
    publicConfigMock.mockImplementationOnce(() => {
      throw new Error('configuration secret');
    });
    vi.spyOn(console, 'error').mockImplementationOnce(() => undefined);

    const response = await GET(new Request('http://localhost/api/config', {
      headers: { 'x-request-id': 'config-request-123' },
    }));

    expect(response.status).toBe(500);
    expect(response.headers.get('x-request-id')).toBe('config-request-123');
    expect(await response.json()).toEqual({
      error: { code: 'INTERNAL', message: '服务器内部错误' },
      requestId: 'config-request-123',
    });
  });
});
