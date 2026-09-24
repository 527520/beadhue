import { cookies } from 'next/headers';
import { LEGACY_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME } from '@/lib/auth/cookies';
import { hashToken } from '@/lib/auth/tokens';

/** 当前请求会话令牌的哈希（会话表只存哈希）；没有会话 Cookie 时为 null。 */
export async function currentSessionTokenHash(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value ?? jar.get(LEGACY_SESSION_COOKIE_NAME)?.value ?? null;
  return token ? hashToken(token) : null;
}
