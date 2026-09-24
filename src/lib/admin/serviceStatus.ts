import { and, eq, gte, sql } from 'drizzle-orm';
import type { AnyDatabase } from '@/../db/client';
import { systemLogs } from '@/../db/schema';
import { resolveMailAdapter } from '@/lib/auth/runtimeConfig';
import { resolveOriginalsCosConfig } from '@/lib/cos/client';
import { summarizeModerationToday } from '@/lib/moderation/commentModeration';

export type ServiceState = 'ok' | 'degraded' | 'off';

export interface ServiceStatusItem {
  id: 'database' | 'storage' | 'moderation' | 'mail';
  state: ServiceState;
  /** 界面按 id + detail 组织文案；数值原样给出。 */
  detail: { latencyMs?: number; calls?: number; budget?: number; failures?: number; adapter?: string; reason?: 'disabled' | 'failing' | 'budget' | 'local' | 'fake' | 'errors' };
}

/**
 * 后台总览「服务状态」与系统信息「依赖服务」（R15-10）：只报告能确认的事实。
 * 数据库 = 一次 select 1 的往返耗时；对象存储 = 是否配置了 COS 私有桶（开发环境为本机目录）；
 * 内容安全 = 今日实际调用与健康；邮件 = 发信通道与最近 24 小时 mail.send_failed 次数。
 */
export async function getServiceStatus(db: AnyDatabase, now: Date = new Date()): Promise<ServiceStatusItem[]> {
  const started = performance.now();
  await db.execute(sql`select 1`);
  const latencyMs = Math.max(1, Math.round(performance.now() - started));
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [moderation, [mailFailures]] = await Promise.all([
    summarizeModerationToday(db, now),
    db.select({ count: sql<number>`count(*)::int` }).from(systemLogs)
      .where(and(eq(systemLogs.event, 'mail.send_failed'), gte(systemLogs.createdAt, since))),
  ]);
  let adapter = 'fake';
  try { adapter = resolveMailAdapter(); } catch { adapter = 'fake'; }
  const failures = Number(mailFailures?.count ?? 0);
  const moderationReason = !moderation.enabled ? 'disabled' : moderation.health.consecutiveFailures > 0 ? 'failing' : moderation.calls >= moderation.budget ? 'budget' : undefined;
  return [
    { id: 'database', state: 'ok', detail: { latencyMs } },
    { id: 'storage', state: resolveOriginalsCosConfig() ? 'ok' : 'off', detail: resolveOriginalsCosConfig() ? {} : { reason: 'local' } },
    { id: 'moderation', state: moderationReason ? (moderationReason === 'disabled' ? 'off' : 'degraded') : 'ok', detail: { calls: moderation.calls, budget: moderation.budget, reason: moderationReason } },
    { id: 'mail', state: adapter === 'fake' ? 'off' : failures > 0 ? 'degraded' : 'ok', detail: { adapter, failures, reason: adapter === 'fake' ? 'fake' : failures > 0 ? 'errors' : undefined } },
  ];
}
