import { eq } from 'drizzle-orm';
import type { AnyDatabase } from '@/../db/client';
import { users } from '@/../db/schema';

export interface MyProfile {
  email: string;
  username: string | null;
  publicAuthorId: string | null;
  avatarColor: string | null;
  passwordChangedAt: Date | null;
}

/** 「我的」页头与账号设置的资料：邮箱、用户名、公开作者 ID、头像颜色、上次修改密码的时间。 */
export async function getMyProfile(db: AnyDatabase, userId: string): Promise<MyProfile | null> {
  const [row] = await db
    .select({ email: users.email, username: users.username, publicAuthorId: users.publicAuthorId, avatarColor: users.avatarColor, passwordChangedAt: users.passwordChangedAt })
    .from(users)
    .where(eq(users.id, userId));
  // 注销后的匿名账号没有邮箱，不再有「我的」资料。
  return row?.email ? { ...row, email: row.email } : null;
}

/** 展示名：用户名优先，否则取邮箱 @ 前面的部分（与顶栏头像菜单同一口径）。 */
export function profileDisplayName(profile: Pick<MyProfile, 'email' | 'username'>): string {
  return profile.username?.trim() || profile.email.split('@')[0] || profile.email;
}
