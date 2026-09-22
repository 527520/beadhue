import { beforeAll, describe, expect, it } from 'vitest';
import { createTestClient } from './testClient';
import type { AnyDatabase } from './client';
import { enforceOriginalUploadLimit } from '@/lib/security/originalUploadLimit';
import { apiError } from '@/lib/auth/http';

describe('original upload account and IP windows', () => {
  let db: AnyDatabase;
  beforeAll(async () => {
    db = await createTestClient();
  });
  const attempt = (userId: string, ip: string, timestamp: string) =>
    enforceOriginalUploadLimit(db, {
      userId,
      request: new Request('http://local/upload', { headers: { 'x-real-ip': ip } }),
      now: new Date(timestamp),
    });

  it('admits exactly ten concurrent requests across devices, then resets at the minute', async () => {
    const result = await Promise.allSettled(
      Array.from({ length: 14 }, (_, i) => attempt('concurrent', `device-${i}`, '2026-09-22T12:01:20Z')),
    );
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
    for (const r of result)
      if (r.status === 'rejected') {
        expect(apiError(r.reason).headers.get('Retry-After')).toBe('40');
      }
    await expect(attempt('concurrent', 'new-device', '2026-09-22T12:02:00Z')).resolves.toBeUndefined();
  });

  it('counts sixty attempts across minutes and chooses the latest blocked window', async () => {
    for (let minute = 0; minute < 6; minute++) {
      for (let i = 0; i < 10; i++) await attempt('hourly', `hour-${i}`, `2026-09-22T13:0${minute}:00Z`);
    }
    await expect(attempt('hourly', 'hour-other', '2026-09-22T13:06:20Z')).rejects.toMatchObject({
      retryAfter: 3220,
    });
    await expect(attempt('hourly', 'hour-other', '2026-09-22T14:00:00Z')).resolves.toBeUndefined();
  });

  it('shares thirty per minute across accounts on the same IP', async () => {
    for (let i = 0; i < 30; i++) await attempt(`shared-${i}`, 'shared-ip', '2026-09-22T15:00:00Z');
    await expect(attempt('new-account', 'shared-ip', '2026-09-22T15:00:59Z')).rejects.toMatchObject({
      retryAfter: 1,
    });
  });

  it('shares 180 per hour across accounts even after minute windows reset', async () => {
    for (let minute = 0; minute < 6; minute++) {
      for (let i = 0; i < 30; i++)
        await attempt(`ip-hour-${minute}-${i}`, 'hour-ip', `2026-09-22T16:0${minute}:00Z`);
    }
    await expect(attempt('fresh', 'hour-ip', '2026-09-22T16:06:00Z')).rejects.toMatchObject({
      retryAfter: 3240,
    });
  });
});
