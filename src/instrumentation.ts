/**
 * Next.js instrumentation（服务启动钩子）：
 * - 开发/E2E 无 DATABASE_URL 时初始化进程内 PGlite 数据库（免装 Postgres）。
 * - 生产：APP_URL 必须是 https 地址（验证/重置邮件链接与 Origin 校验依赖它），
 *   缺失或非 https 时 fail-fast，避免发出指向 localhost 的邮件链接。
 * - 运行日志（用户第 15 条）：onRequestError 捕获渲染/路由/Server Action 的未处理异常；
 *   每日清理顺带删除过期的 system_logs 与 slow_queries。
 */
import type { Instrumentation } from 'next';

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.NODE_ENV === 'production') {
      const { validateProductionAuthAdapters } = await import('@/lib/auth/runtimeConfig');
      validateProductionAuthAdapters();
      // 限流表定期清理（优化票 03）：每日删除 25 小时前的过期窗口（窗口小时对齐，>24h 必过期）
      const { cleanupExpiredIdempotencyRecords, cleanupRateLimits, cleanupSyncTombstones } = await import('@/../db/client');
      const { getDb } = await import('@/lib/auth/db');
      const runCleanup = async (): Promise<void> => {
        try {
          const removed = await cleanupRateLimits(getDb(), new Date(Date.now() - 25 * 60 * 60 * 1000));
          if (removed > 0) console.log(`[cleanup] rate_limits 清理 ${removed} 行过期窗口`);
          const tombstones = await cleanupSyncTombstones(getDb(), new Date());
          const idempotency = await cleanupExpiredIdempotencyRecords(getDb(), new Date());
          if (tombstones.designs + tombstones.palettes > 0) {
            console.log(`[cleanup] 同步墓碑清理 designs=${tombstones.designs} palettes=${tombstones.palettes}`);
          }
          if (idempotency > 0) console.log(`[cleanup] 幂等记录清理 ${idempotency} 条`);
        } catch (error) {
          console.error('[cleanup] rate_limits 清理失败（不阻塞启动）:', error);
        }
        try {
          const { runAnalyticsMaintenance } = await import('@/lib/analytics/maintenance');
          const analytics = await runAnalyticsMaintenance(getDb(), new Date());
          if (!analytics.skipped) {
            console.log(`[cleanup] 分析维护聚合 ${analytics.daysRolledUp} 天，清理 ${analytics.rawEventsDeleted} 条原始事件`);
          }
        } catch (error) {
          console.error('[cleanup] 分析维护失败（不阻塞应用）:', error);
        }
        try {
          // 作品原图（D49）：下架逾期删除 + 补扫已标记删除但对象尚未清除的行。
          const { expireBlockedOriginals, purgeDeletedOriginals } = await import('@/lib/community/originals');
          const { getOriginalStore } = await import('@/lib/community/originalStore');
          const { cleanupPrivateOriginals } = await import('@/lib/originals/server');
          await cleanupPrivateOriginals(getDb(), getOriginalStore());
          const expired = await expireBlockedOriginals(getDb(), getOriginalStore(), new Date());
          const swept = await purgeDeletedOriginals(getDb(), getOriginalStore());
          if (expired.expired + swept.purged + swept.failed > 0) {
            console.log(`[cleanup] 原图清理 逾期下架=${expired.expired} 清除=${expired.purged + swept.purged} 失败=${expired.failed + swept.failed}`);
          }
        } catch (error) {
          console.error('[cleanup] 原图清理失败（不阻塞应用）:', error);
        }
        try {
          // 运行日志保留期（用户第 15 条）：system_logs 默认 30 天、slow_queries 默认 14 天。
          const { cleanupObservabilityLogs } = await import('@/lib/observability/retention');
          const logs = await cleanupObservabilityLogs(getDb(), new Date());
          if (logs.systemLogs + logs.slowQueries > 0) {
            console.log(`[cleanup] 运行日志清理 system_logs=${logs.systemLogs} slow_queries=${logs.slowQueries}`);
          }
        } catch (error) {
          console.error('[cleanup] 运行日志清理失败（不阻塞应用）:', error);
        }
      };
      void runCleanup();
      setInterval(() => void runCleanup(), 24 * 60 * 60 * 1000);
    }
    const { ensureFallbackDb } = await import('@/lib/auth/db');
    await ensureFallbackDb();
    if (process.env.NODE_ENV !== 'production' && process.env.BEADHUE_E2E_SEED === '1') {
      const { seedE2eGovernance } = await import('@/lib/auth/testSeed');
      const { getDb } = await import('@/lib/auth/db');
      await seedE2eGovernance(getDb());
    }
  }
}

/**
 * 把「哪个账号、哪个 IP、什么操作、什么错误」写进运行日志（用户第 15 条）。
 *
 * 覆盖 API 之外的服务端路径：RSC 渲染（render）、Route Handler（route）、
 * Server Action（action）。API 路由的未知异常由 `withApiErrors` 负责，两条路径
 * 不会重复落库（前者异常已被捕获，不会冒到这里）。
 * 仅 Node 运行时执行：Edge 运行时没有数据库客户端。
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // 错误钩子里不能假设应用模块已加载：动态导入，避免影响启动期。
  const [{ writeSystemLogBestEffort }, { maskIp }] = await Promise.all([
    import('@/lib/observability/log'),
    import('@/lib/observability/context'),
  ]);
  const incomingId = request.headers['x-request-id'];
  const headerId = Array.isArray(incomingId) ? incomingId[0] : incomingId;
  const realIp = request.headers['x-real-ip'];
  const forwarded = request.headers['x-forwarded-for'];
  const rawIp = (Array.isArray(realIp) ? realIp[0] : realIp) ?? (Array.isArray(forwarded) ? forwarded[0] : forwarded) ?? 'local';
  const digest = typeof error === 'object' && error !== null && 'digest' in error ? String((error as { digest?: unknown }).digest) : null;
  await writeSystemLogBestEffort({
    level: 'error',
    source: context.routeType,
    event: `${context.routeType}.unhandled`,
    requestId: typeof headerId === 'string' && headerId ? headerId.slice(0, 64) : crypto.randomUUID(),
    ipMasked: maskIp(rawIp.split(',')[0]),
    method: request.method,
    path: request.path.split('?')[0],
    route: context.routePath,
    errorCode: digest,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
    context: { routerKind: context.routerKind, renderSource: context.renderSource, digest },
  });
};
