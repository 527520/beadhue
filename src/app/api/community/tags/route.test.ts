/**
 * 无节流端点补漏（admin-round-3 12）：`GET /api/community/tags` 此前只靠响应头缓存，
 * 未命中的每次请求都能任意读库；现在按 IP 计小时窗口。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestClient, type TestDatabase } from '@/../db/testClient';
import { setTestDb } from '@/lib/auth/db';

vi.mock('@/lib/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/config')>();
  return { ...actual, config: { ...actual.config, security: { ...actual.config.security, tagsRateLimit: 3 } } };
});

import { GET } from './route';

let db: TestDatabase;

beforeEach(async () => {
  db = await createTestClient();
  setTestDb(db);
});

const requestTags = (ip?: string) => GET(new Request('http://localhost/api/community/tags', ip ? { headers: { 'x-real-ip': ip } } : undefined));

describe('GET /api/community/tags', () => {
  it('超过每 IP 小时上限返回 429 + Retry-After', async () => {
    for (let i = 0; i < 3; i += 1) {
      const response = await requestTags('203.0.113.11');
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('public, s-maxage=300');
    }
    const limited = await requestTags('203.0.113.11');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
    expect((await limited.json()).error.code).toBe('RATE_LIMITED');
  });

  it('另一个 IP 不受影响', async () => {
    for (let i = 0; i < 4; i += 1) await requestTags('203.0.113.12');
    expect((await requestTags('203.0.113.13')).status).toBe(200);
  });
});
