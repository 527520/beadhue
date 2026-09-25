import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestClient, type TestDatabase } from './testClient';
import { commentModerationChecks, systemLogs } from './schema';
import { getServiceStatus } from '@/lib/admin/serviceStatus';

describe('getServiceStatus', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestClient();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('默认测试环境：数据库 ok、存储 local、内容安全关闭、邮件 fake', async () => {
    const status = await getServiceStatus(db);
    const byId = Object.fromEntries(status.map((item) => [item.id, item]));

    expect(byId.database).toMatchObject({ state: 'ok' });
    expect(byId.database.detail.latencyMs).toBeGreaterThanOrEqual(1);
    expect(byId.storage).toMatchObject({ state: 'off', detail: { reason: 'local' } });
    expect(byId.moderation).toMatchObject({ state: 'off', detail: { reason: 'disabled', calls: 0, budget: 2000 } });
    expect(byId.mail).toMatchObject({ state: 'off', detail: { adapter: 'fake', reason: 'fake', failures: 0 } });
  });

  it('邮件走 SMTP 且 24 小时内有失败时降级，并如实报告失败次数', async () => {
    vi.stubEnv('SMTP_HOST', 'mail.example.test');
    vi.stubEnv('SMTP_USER', 'ci');
    vi.stubEnv('SMTP_PASS', 'ci');
    vi.stubEnv('SMTP_FROM', 'ci@example.test');
    await db.insert(systemLogs).values({ level: 'error', source: 'mail', event: 'mail.send_failed' });
    await db.insert(systemLogs).values({
      level: 'error', source: 'mail', event: 'mail.send_failed',
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });

    const mail = (await getServiceStatus(db)).find((item) => item.id === 'mail');

    expect(mail).toMatchObject({ state: 'degraded', detail: { adapter: 'smtp', reason: 'errors', failures: 1 } });
  });

  it('有真实内容安全调用记录时原样报告用量', async () => {
    await db.insert(commentModerationChecks).values({
      textHash: 'hash', textLength: 4, provider: 'tencent-tms', suggestion: 'Pass',
      outcome: 'published', reason: 'tms_pass',
    });

    const moderation = (await getServiceStatus(db)).find((item) => item.id === 'moderation');

    expect(moderation).toMatchObject({ state: 'off', detail: { reason: 'disabled', calls: 1, budget: 2000 } });
  });
});
