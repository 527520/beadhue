import { and, eq, gt, isNull } from 'drizzle-orm';
import { emailTokens } from '@/../db/schema';
import { AppError } from '@/lib/errors';
import { resetPasswordSchema } from '@/lib/schemas';
import { getDb } from '@/lib/auth/db';
import { hashPassword } from '@/lib/auth/password';
import { hashToken } from '@/lib/auth/tokens';
import { resetPasswordWithToken } from '@/lib/auth/transitions';
import { checkRateLimit, clientIp, rateLimitKey } from '@/lib/auth/rateLimit';
import { enforceMutatingGuard } from '@/lib/auth/guard';
import { apiError, noContent, readJson, withApiErrors } from '@/lib/auth/http';
import { zhCN } from '@/messages/zh-CN';
import { config } from '@/lib/config';

/** 令牌端点限流（票 02 配置化：环境变量 RATE_TOKEN）；令牌 256-bit 不可爆破，仅防滥用。 */
const RATE_LIMIT = config.security.tokenRateLimit;

/** 重置密码：令牌一次性；成功后旧会话全部失效（spec E32）。 */
async function post(request: Request) {
  const guard = enforceMutatingGuard(request);
  if (guard) return guard;

  const ip = clientIp(request);
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const parsed = resetPasswordSchema.safeParse(body.data);
  if (!parsed.success) return apiError(parsed.error);
  const { token, password } = parsed.data;

  const db = getDb();
  if (!(await checkRateLimit(db, rateLimitKey('reset', ip), RATE_LIMIT))) {
    return apiError(new AppError('RATE_LIMITED', zhCN.auth.tooManyRequests));
  }
  // Argon2 在事务外执行，避免昂贵计算长时间占用数据库连接与行锁。
  const passwordHash = await hashPassword(password);
  const changed = await resetPasswordWithToken(db, {
    tokenHash: hashToken(token),
    passwordHash,
    now: new Date(),
  });
  if (!changed) {
    return apiError(new AppError('VALIDATION', zhCN.auth.linkInvalid));
  }

  return noContent();
}

export const POST = withApiErrors(post);

/** 打开重置页时预检令牌（不消耗）：仍可用 204，不存在、已用过或已过期 400，页面直接给「重新获取重置邮件」。 */
async function get(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  const db = getDb();
  if (!(await checkRateLimit(db, rateLimitKey('reset-check', clientIp(request)), RATE_LIMIT))) {
    return apiError(new AppError('RATE_LIMITED', zhCN.auth.tooManyRequests));
  }
  if (!token || token.length > 200) return apiError(new AppError('VALIDATION', zhCN.auth.linkInvalid));
  const [row] = await db.select({ id: emailTokens.id }).from(emailTokens).where(and(
    eq(emailTokens.tokenHash, hashToken(token)), eq(emailTokens.purpose, 'reset'), isNull(emailTokens.usedAt), gt(emailTokens.expiresAt, new Date()),
  ));
  return row ? noContent() : apiError(new AppError('VALIDATION', zhCN.auth.linkInvalid));
}

export const GET = withApiErrors(get);
