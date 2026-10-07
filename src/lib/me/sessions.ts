import { currentSessionToken } from '@/lib/auth/session';
import { hashToken } from '@/lib/auth/tokens';

export async function currentSessionTokenHash(): Promise<string | null> {
  const token = await currentSessionToken();
  return token ? hashToken(token) : null;
}
