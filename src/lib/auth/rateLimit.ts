/**
 * 限流（spec §4.2 / ADR-0004）：按 key 每 1 小时窗口最多 limit 次。
 * 使用 db/incrementRateLimit 原子递增；窗口起点按小时对齐。
 */
import { eq, inArray } from 'drizzle-orm';
import { incrementRateLimit, type AnyDatabase } from '@/../db/client';
import { rateLimits } from '@/../db/schema';
import { config } from '@/lib/config';
import { AppError } from '@/lib/errors';

const WINDOW_MS = 60 * 60 * 1000;

/** 小时对齐的窗口起点（ISO）。 */
export function hourlyWindowStart(now: Date = new Date()): Date {
  return new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS);
}

/** 距当前小时窗口结束的秒数，用于 429 的 Retry-After。 */
export function retryAfterSeconds(now: Date = new Date()): number {
  const windowEnd = hourlyWindowStart(now).getTime() + WINDOW_MS;
  return Math.max(1, Math.ceil((windowEnd - now.getTime()) / 1000));
}

/** 构造限流 key：路由 + IP（+ 邮箱，防跨账号与跨 IP 枚举）。 */
export function rateLimitKey(route: string, ip: string, email = ''): string {
  return `auth:${route}:${ip}:${email.trim().toLowerCase()}`;
}

/**
 * 提取客户端 IP：
 * - 优先取反代注入的专用头 x-real-ip（若部署侧配置注入，见 deploy 文档）；
 * - 否则取 x-forwarded-for 首项。当前部署为单层反代（Caddy），XFF 不可信来源会被
 *   Caddy 覆盖；若未来接入 CDN，必须先在反代配置 trusted_proxies 后取「最后一个可信项」，
 *   否则攻击者可伪造 XFF 绕过限流（安全审查）。
 */
export function clientIp(request: Request): string {
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return 'local';
}

/**
 * 递增计数并判定是否放行；返回 false 表示已超限（调用方回 429）。
 */
export async function checkRateLimit(
  db: AnyDatabase,
  key: string,
  limit: number,
  now: Date = new Date(),
): Promise<boolean> {
  const count = await incrementRateLimit(db, key, hourlyWindowStart(now));
  return count <= limit;
}

/** 同步写限流 key：按已鉴权用户计（同一账号换 IP 也受限）。 */
export function syncWriteKey(userId: string): string {
  return `sync:write:${userId}`;
}

/** 任意长度窗口的对齐起点（登录失败窗口为 15 分钟，不是小时）。 */
export function windowStart(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

/** 只读：取某限流键当前的计数与窗口起点；不存在返回 null。 */
export async function readRateLimit(
  db: AnyDatabase,
  key: string,
): Promise<{ count: number; windowStart: Date } | null> {
  const [row] = await db
    .select({ count: rateLimits.count, windowStart: rateLimits.windowStart })
    .from(rateLimits)
    .where(eq(rateLimits.key, key));
  return row ?? null;
}

/** 清除若干限流键（登录成功后清零失败计数与临时锁定）。 */
export async function clearRateLimit(db: AnyDatabase, keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return;
  await db.delete(rateLimits).where(inArray(rateLimits.key, [...keys]));
}

/** 距某时刻还有多少秒（至少 1，用于 429 的 Retry-After）。 */
export function secondsUntil(until: Date, now: Date = new Date()): number {
  return Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 1000));
}

/**
 * 登录失败按邮箱计数与临时锁定（admin-round-3 12）。
 *
 * 为什么不用 checkRateLimit：那道闸门是「小时窗口内累计次数」，被锁的账号只要等下一个小时
 * 就能继续试；这里要的是「15 分钟内错 10 次 → 锁 15 分钟」，且**密码正确也照样拒绝**
 * （否则攻击者一旦猜中就绕过了锁定）。两个键都复用 rate_limits 表，无 schema 变更：
 * - `auth:login-fail:{email}`：15 分钟对齐窗口的失败计数；
 * - `auth:login-lock:{email}`：windowStart 记「锁定时刻」，读出来即知还剩多久。
 */
export type LoginLockState = { locked: boolean; retryAfterSeconds: number };

function loginFailureKey(email: string): string {
  return `auth:login-fail:${email}`;
}

function loginLockKey(email: string): string {
  return `auth:login-lock:${email}`;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function loginFailureWindowMs(): number {
  return config.security.loginFailureWindowMinutes * 60 * 1000;
}

function loginLockMs(): number {
  return config.security.loginLockMinutes * 60 * 1000;
}

/** 只读检查当前是否处于锁定窗口（不改计数）。 */
export async function loginLockState(db: AnyDatabase, email: string, now: Date = new Date()): Promise<LoginLockState> {
  const row = await readRateLimit(db, loginLockKey(normalizeEmail(email)));
  if (!row) return { locked: false, retryAfterSeconds: 0 };
  const unlockAt = row.windowStart.getTime() + loginLockMs();
  if (now.getTime() >= unlockAt) return { locked: false, retryAfterSeconds: 0 };
  return { locked: true, retryAfterSeconds: secondsUntil(new Date(unlockAt), now) };
}

/** 记一次失败：达到阈值即刷新锁定窗口；返回记完之后的锁定状态。 */
export async function recordLoginFailure(db: AnyDatabase, email: string, now: Date = new Date()): Promise<LoginLockState> {
  const key = normalizeEmail(email);
  const count = await incrementRateLimit(db, loginFailureKey(key), windowStart(now, loginFailureWindowMs()));
  if (count < config.security.loginFailureThreshold) return { locked: false, retryAfterSeconds: 0 };
  // 锁定窗口从「跨过阈值的那一刻」起算：windowStart 存绝对时刻，重复触发即顺延。
  await incrementRateLimit(db, loginLockKey(key), now);
  return { locked: true, retryAfterSeconds: Math.max(1, Math.ceil(loginLockMs() / 1000)) };
}

/** 登录成功：清零失败计数与锁定。 */
export async function clearLoginFailures(db: AnyDatabase, email: string): Promise<void> {
  const key = normalizeEmail(email);
  await clearRateLimit(db, [loginFailureKey(key), loginLockKey(key)]);
}

/**
 * 同步写（设计/色板 PUT + DELETE）限流（A-12）。
 * 存量上限限制的是「总存储」，不限制「写入速率」：一个已验证账号可以反复 PUT
 * 约 5 MB 的 body，持续消耗解析 + 行锁。超限抛 RATE_LIMITED，由 withApiErrors 转 429。
 */
export async function enforceSyncWriteLimit(
  db: AnyDatabase,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  const allowed = await checkRateLimit(db, syncWriteKey(userId), config.security.syncWriteRateLimit, now);
  if (!allowed) throw new AppError('RATE_LIMITED', '同步写入过于频繁，请稍后再试');
}
