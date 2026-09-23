/**
 * 发信成本防护（安全审查：SES 按量计费，发信接口=挂到公网上的钱）：
 * - 每邮箱每日上限（与 IP 无关）：分布式攻击换多少 IP 都卡在受害者邮箱这个键上；
 * - 每 IP 每小时总发信上限：单 IP 批量注册被封；
 * - 全局每日上限按**账号档位**分成两个桶（admin-round-3 12）：
 *   新账号 / 未验证账号一个桶（MAIL_DAILY_SEND_LIMIT，默认 200），
 *   已建立账号（已验证且注册满 MAIL_ESTABLISHED_MIN_AGE_DAYS，默认 7 天）另一个桶
 *   （MAIL_ESTABLISHED_DAILY_LIMIT，默认 100）。
 *   攻击者拿邮箱列表烧掉新账号桶时，老用户的「找回密码」仍走自己那一桶，不会被连带封死。
 * 计数复用 db rate_limits 表（原子 UPSERT 递增），零新依赖。
 * 窗口：小时/天按服务器时间对齐（与 hourlyWindowStart 同风格）。
 *
 * 阈值默认值在 `src/lib/config.ts`（MAIL_* / 见 security.mailNewAccountDailyLimit 等）；
 * 为兼容既有部署与运行期覆盖，下面仍优先读同名环境变量（两个来源读的是同一批变量）。
 */
import type { AnyDatabase } from '@/../db/client';
import { and, eq, sql } from 'drizzle-orm';
import { rateLimits, users } from '@/../db/schema';
import { config } from '@/lib/config';
import { checkRateLimit, hourlyWindowStart } from './rateLimit';
import { recordSecurityEvent } from '@/lib/observability/log';

const DAY_MS = 24 * 60 * 60 * 1000;

export const MAIL_PER_EMAIL_DAILY = 5; // forgot 3 + resend 2 的余量由调用方细分
export const MAIL_PER_IP_HOURLY = 20;

export type MailLimitResult = 'ok' | 'emailLimited' | 'ipLimited' | 'globalLimited';
/** 邮件预算桶：新账号（未验证 / 注册未满 N 天 / 邮箱不存在）与已建立账号。 */
export type MailBudgetBucket = 'new' | 'established';
export interface MailLimitReservation {
  result: MailLimitResult;
  /** 发信未实际成功时调用；幂等地返还本次预占的三层配额。 */
  release(): Promise<void>;
}

/** 天对齐的窗口起点。 */
export function dailyWindowStart(now: Date = new Date()): Date {
  return new Date(Math.floor(now.getTime() / DAY_MS) * DAY_MS);
}

function envLimit(name: string): number | null {
  const raw = Number(process.env[name] ?? '');
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : null;
}

/**
 * 判定收件邮箱属于哪个预算桶（纯函数，便于单测）：
 * 只有「已验证 + 注册满 minAgeDays」的账号算已建立；未验证、注册过新、以及不存在的邮箱
 * 都落进新账号桶（对幽灵邮箱无从判断，取更严的一档）。
 */
export function mailBudgetBucket(
  account: { emailVerifiedAt: Date | null; createdAt: Date } | null,
  now: Date = new Date(),
  minAgeDays: number = config.security.mailEstablishedMinAgeDays,
): MailBudgetBucket {
  if (!account || account.emailVerifiedAt === null) return 'new';
  return now.getTime() - account.createdAt.getTime() >= minAgeDays * DAY_MS ? 'established' : 'new';
}

/** 档位桶的每日上限（环境变量优先，默认值来自 config）。 */
export function bucketDailyLimit(bucket: MailBudgetBucket): number {
  return bucket === 'established'
    ? envLimit('MAIL_ESTABLISHED_DAILY_LIMIT') ?? config.security.mailEstablishedDailyLimit
    : envLimit('MAIL_DAILY_SEND_LIMIT') ?? config.security.mailNewAccountDailyLimit;
}

/**
 * 依次检查三层限流；返回首个命中的限制类型，全过返回 'ok'。
 * 调用方语义：emailLimited → 静默 204（防枚举，见各路由注释）；
 * ipLimited/globalLimited → 统一 429（与具体邮箱无关，不泄露任何账号信息）。
 */
export async function checkMailSendLimits(
  db: AnyDatabase,
  opts: { email: string; ip: string; emailLimit?: number; now?: Date },
): Promise<MailLimitResult> {
  return (await reserveMailSendLimits(db, opts)).result;
}

/**
 * 原子计数仍在发信前完成以阻止并发超卖；调用方只在实际发送失败/未发送时 release，
 * 因而最终计数只代表真实成功发出的邮件。
 */
export async function reserveMailSendLimits(
  db: AnyDatabase,
  opts: { email: string; ip: string; emailLimit?: number; now?: Date },
): Promise<MailLimitReservation> {
  // 成本防护只应在存在真实发信成本时生效（配置了 SES 或 SMTP）。
  // 开发/E2E（无渠道，仅日志输出）不受限，避免测试环境被限流计数干扰。
  if (!process.env.SMTP_HOST && !process.env.SES_SECRET_ID) {
    return { result: 'ok', release: async () => undefined };
  }

  const now = opts.now ?? new Date();
  const email = opts.email.trim().toLowerCase();
  const emailLimit = opts.emailLimit ?? MAIL_PER_EMAIL_DAILY;
  const reservations: Array<{ key: string; windowStart: Date }> = [];

  let released = false;
  const release = async (): Promise<void> => {
    if (released) return;
    released = true;
    await db.transaction(async (tx) => {
      for (const reservation of reservations) {
        await tx
          .update(rateLimits)
          .set({ count: sql`greatest(${rateLimits.count} - 1, 0)` })
          .where(and(eq(rateLimits.key, reservation.key), eq(rateLimits.windowStart, reservation.windowStart)));
      }
    });
  };

  const limited = async (result: MailLimitResult): Promise<MailLimitReservation> => {
    await release();
    return { result, release };
  };

  // 每邮箱每日（键含邮箱，窗口=天）
  const emailKey = `mail:email:daily:${email}`;
  const dayStart = dailyWindowStart(now);
  reservations.push({ key: emailKey, windowStart: dayStart });
  if (!(await checkDailyLimit(db, emailKey, emailLimit, now))) return limited('emailLimited');

  // 每 IP 每小时（跨所有邮件类型）
  const ipKey = `mail:ip:hourly:${opts.ip}`;
  reservations.push({ key: ipKey, windowStart: hourlyWindowStart(now) });
  if (!(await checkRateLimit(db, ipKey, MAIL_PER_IP_HOURLY, now))) return limited('ipLimited');

  // 全局每日：按收件账号档位分桶（新账号 / 已建立账号互不挤占）
  const [account] = await db.select({ emailVerifiedAt: users.emailVerifiedAt, createdAt: users.createdAt })
    .from(users).where(eq(sql`lower(${users.email})`, email)).limit(1);
  const bucket = mailBudgetBucket(account ?? null, now);
  const globalKey = `mail:global:daily:${bucket}`;
  reservations.push({ key: globalKey, windowStart: dayStart });
  if (!(await checkDailyLimit(db, globalKey, bucketDailyLimit(bucket), now))) {
    // 邮件额度是可用性杠杆：烧穿后所有验证/找回邮件都会被拒，必须留下可查的运行日志（admin-round-3 13）。
    await recordSecurityEvent(db, {
      event: 'security.mail_budget_exhausted', level: 'warn',
      message: '邮件日额度已用完，验证/找回邮件被拒',
      context: { bucket, key: globalKey },
    });
    return limited('globalLimited');
  }

  return { result: 'ok', release };
}

async function checkDailyLimit(
  db: AnyDatabase,
  key: string,
  limit: number,
  now: Date,
): Promise<boolean> {
  return checkRateLimit(db, key, limit, dailyWindowStart(now));
}
