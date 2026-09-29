import { and, eq } from "drizzle-orm";
import { users, sessions, wechatBindings } from "@/../db/schema";
import { getDb } from "@/lib/auth/db";
import { getVerifiedSessionUserId } from "@/lib/auth/session";
import { readJson, okJson, noContent, withApiErrors } from "@/lib/auth/http";
import { enforceMutatingGuard } from "@/lib/auth/guard";
import { verifyPassword } from "@/lib/auth/password";
import { lockActiveAccount } from "@/lib/auth/writeAccess";
import { AppError } from "@/lib/errors";
import {
  exchangeWechatCode,
  limitWechatRequest,
  wechatAppId,
} from "@/lib/mini/wechat";

async function verifiedUser() {
  const id = await getVerifiedSessionUserId();
  if (!id) throw new AppError("UNAUTHORIZED", "请登录并验证邮箱");
  return id;
}
export const GET = withApiErrors(async (_request: Request) => {
  const id = await verifiedUser();
  const [binding] = await getDb()
    .select({ createdAt: wechatBindings.createdAt })
    .from(wechatBindings)
    .where(
      and(
        eq(wechatBindings.userId, id),
        eq(wechatBindings.appid, wechatAppId()),
      ),
    );
  return okJson(
    { bound: !!binding, boundAt: binding?.createdAt ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
});
export const POST = withApiErrors(async (request: Request) => {
  const guard = enforceMutatingGuard(request);
  if (guard) return guard;
  const id = await verifiedUser();
  await limitWechatRequest(request, id);
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const identity = await exchangeWechatCode(
    (body.data as { code?: unknown } | null)?.code,
  );
  try {
    await getDb().transaction(async (tx) => {
      await lockActiveAccount(tx, id);
      const [user] = await tx
        .select({ verified: users.emailVerifiedAt })
        .from(users)
        .where(eq(users.id, id));
      if (!user?.verified) throw new AppError("FORBIDDEN", "请先验证邮箱");
      const [existing] = await tx
        .select()
        .from(wechatBindings)
        .where(
          and(
            eq(wechatBindings.appid, identity.appid),
            eq(wechatBindings.openid, identity.openid),
          ),
        );
      if (existing?.userId === id) return;
      if (existing) throw new AppError("CONFLICT", "该微信已绑定其他账号");
      await tx.insert(wechatBindings).values({ ...identity, userId: id });
    });
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    if (e.code === "23505" || e.cause?.code === "23505")
      throw new AppError("CONFLICT", "微信或账号已有绑定，请先解绑");
    throw error;
  }
  return noContent();
});
export const DELETE = withApiErrors(async (request: Request) => {
  const guard = enforceMutatingGuard(request);
  if (guard) return guard;
  const id = await verifiedUser();
  await limitWechatRequest(request, id);
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const password = (body.data as { password?: unknown } | null)?.password;
  if (typeof password !== "string" || password.length > 128)
    throw new AppError("VALIDATION", "请输入账号密码");
  await getDb().transaction(async (tx) => {
    await lockActiveAccount(tx, id);
    const [user] = await tx
      .select({ hash: users.passwordHash })
      .from(users)
      .where(eq(users.id, id));
    if (!user?.hash || !(await verifyPassword(user.hash, password)))
      throw new AppError("VALIDATION", "密码不正确");
    await tx
      .delete(wechatBindings)
      .where(
        and(
          eq(wechatBindings.userId, id),
          eq(wechatBindings.appid, wechatAppId()),
        ),
      );
    await tx
      .delete(sessions)
      .where(and(eq(sessions.userId, id), eq(sessions.clientType, "weapp")));
  });
  return noContent();
});
