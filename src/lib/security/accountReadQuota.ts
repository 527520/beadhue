/**
 * 按账号的公开读配额（admin-round-3 12）。
 *
 * 只按 IP 限流挡不住「登录后爬」：一个账号换 IP 就能绕过 IP 桶，而公开读接口正是
 * 暴露作品快照的地方（详情 / 列表 / 评论）。这里再加两道按账号的闸门：
 * 1. 每小时总量：`rate_limits` 表的 `account:read:{userId}` 键，小时窗口；
 * 2. 每小时不同作品数：进程内有界 LRU（窗口内已访问过的作品 id 集合），不新增表。
 *
 * 新账号（注册未满 NEW_ACCOUNT_AGE_HOURS，默认 24 小时）走更紧的档位：正常试用够用，
 * 批量养号抓取不够用。所有阈值在 `src/lib/config.ts`，两个档位都返回普通 RATE_LIMITED
 * （429 + Retry-After，见 lib/auth/http.ts）。
 */
import type { AnyDatabase } from '@/../db/client';
import { checkRateLimit, hourlyWindowStart } from '@/lib/auth/rateLimit';
import { config } from '@/lib/config';
import { AppError } from '@/lib/errors';

export type AccountReadTier = 'new' | 'established';

/**
 * 档位判定：注册时间未知（例如无 createdAt 的旧 Actor）按已建立账号处理——
 * 它一定有 IP 桶兜底，而把老用户误判成新账号会凭空收紧正常使用。
 */
export function accountReadTier(
  accountCreatedAt: Date | null | undefined,
  now: Date = new Date(),
  ageHours: number = config.security.newAccountAgeHours,
): AccountReadTier {
  if (!accountCreatedAt) return 'established';
  return now.getTime() - accountCreatedAt.getTime() < ageHours * 60 * 60 * 1000 ? 'new' : 'established';
}

export function accountReadTierLimits(tier: AccountReadTier): { requests: number; distinctWorks: number } {
  return tier === 'new'
    ? { requests: config.security.newAccountReadRateLimit, distinctWorks: config.security.newAccountReadDistinctWorks }
    : { requests: config.security.accountReadRateLimit, distinctWorks: config.security.accountReadDistinctWorks };
}

export function accountReadKey(userId: string): string {
  return `account:read:${userId}`;
}

// ---- 每小时不同作品数：进程内集合 ----
// 挂在 globalThis：列表 / 详情 / 评论是三个独立打包的路由，模块级变量不共享，
// 否则同一账号在三个入口各算一套「不同作品」，闸门形同虚设。
const TRACKER_KEY = '__doupu_account_work_window__';
const MAX_TRACKED_ACCOUNTS = 20_000;

interface WorkWindow { windowStart: number; works: Set<string> }
interface WorkWindowStore { accounts: Map<string, WorkWindow> }

function tracker(): WorkWindowStore {
  const store = globalThis as Record<string, unknown>;
  let instance = store[TRACKER_KEY] as WorkWindowStore | undefined;
  if (!instance) {
    instance = { accounts: new Map() };
    store[TRACKER_KEY] = instance;
  }
  return instance;
}

/** 测试与维护用：清空不同作品窗口。 */
export function resetAccountWorkWindow(): void {
  tracker().accounts.clear();
}

/**
 * 把本次访问的作品 id 记入当前小时窗口；返回 false 表示超出「不同作品数」上限。
 * 已在本窗口访问过的作品不重复计数（翻页 / 刷新不算新作品）。
 */
export function recordDistinctWorks(userId: string, workIds: readonly string[], now: Date, limit: number): boolean {
  const store = tracker();
  const windowStart = hourlyWindowStart(now).getTime();
  let entry = store.accounts.get(userId);
  if (!entry || entry.windowStart !== windowStart) {
    entry = { windowStart, works: new Set() };
    store.accounts.delete(userId);
    store.accounts.set(userId, entry);
  } else {
    // LRU：命中即移到队尾，淘汰时丢最久未活跃的账号。
    store.accounts.delete(userId);
    store.accounts.set(userId, entry);
  }
  let exceeded = false;
  for (const workId of workIds) {
    if (entry.works.has(workId)) continue;
    if (entry.works.size >= limit) { exceeded = true; continue; }
    entry.works.add(workId);
  }
  if (store.accounts.size > MAX_TRACKED_ACCOUNTS) {
    for (const oldest of [...store.accounts.keys()].slice(0, Math.ceil(store.accounts.size / 2))) store.accounts.delete(oldest);
  }
  return !exceeded;
}

/**
 * 公开读接口的账号「小时总量」闸门（详情 / 列表 / 评论都先过这一道，再读库）。
 * 匿名访客不经过这里（只有 IP 桶）；超限抛 RATE_LIMITED → 429 + Retry-After。
 */
export async function enforceAccountRequestQuota(
  db: AnyDatabase,
  input: { userId: string; accountCreatedAt?: Date | null; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  const limits = accountReadTierLimits(accountReadTier(input.accountCreatedAt, now));
  if (!(await checkRateLimit(db, accountReadKey(input.userId), limits.requests, now))) {
    throw new AppError('RATE_LIMITED', '访问过于频繁，请稍后再试');
  }
}

/**
 * 公开读接口的「每小时不同作品数」闸门。
 * 详情 / 评论在请求一开始就知道作品 id；列表要等查询结果，所以单独暴露一个同步判定，
 * 让列表路由能在读库前先过总量闸门、读库后只补记本次返回的作品。
 */
export function enforceAccountWorkQuota(
  input: { userId: string; accountCreatedAt?: Date | null; workIds: readonly string[]; now?: Date },
): void {
  if (input.workIds.length === 0) return;
  const now = input.now ?? new Date();
  const limits = accountReadTierLimits(accountReadTier(input.accountCreatedAt, now));
  if (!recordDistinctWorks(input.userId, input.workIds, now, limits.distinctWorks)) {
    throw new AppError('RATE_LIMITED', '访问过于频繁，请稍后再试');
  }
}

/** 两道闸门一起过（作品 id 在请求开始时已知的入口用这个）。 */
export async function enforceAccountReadQuota(
  db: AnyDatabase,
  input: { userId: string; accountCreatedAt?: Date | null; workIds?: readonly string[]; now?: Date },
): Promise<void> {
  await enforceAccountRequestQuota(db, input);
  enforceAccountWorkQuota({ ...input, workIds: input.workIds ?? [] });
}
