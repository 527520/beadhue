import type { AnyDatabase } from '@/../db/client';
import { checkRateLimit } from '@/lib/auth/rateLimit';
import { config } from '@/lib/config';
import { AppError } from '@/lib/errors';

/** 「我的」私有接口按账号计小时窗口：只读（统计 / 通知 / 未读数）与写（通知已读）各一条。 */
export async function enforceMeRateLimit(db: AnyDatabase, userId: string, kind: 'read' | 'write', now: Date = new Date()): Promise<void> {
  const limit = kind === 'read' ? config.security.meReadRateLimit : config.security.meWriteRateLimit;
  if (!(await checkRateLimit(db, `me:${kind}:${userId}`, limit, now))) {
    throw new AppError('RATE_LIMITED', '操作过于频繁，请稍后再试');
  }
}
