import { and, eq } from "drizzle-orm";
import { users, wechatBindings } from "@/../db/schema";
import { getDb } from "@/lib/auth/db";
import { readJson, okJson, withApiErrors } from "@/lib/auth/http";
import { createSession } from "@/lib/auth/session";
import { lockActiveAccount } from "@/lib/auth/writeAccess";
import { AppError } from "@/lib/errors";
import { exchangeWechatCode, limitWechatRequest } from "@/lib/mini/wechat";

export const POST = withApiErrors(async (request: Request) => {
  await limitWechatRequest(request);
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const identity = await exchangeWechatCode(
    (body.data as { code?: unknown } | null)?.code,
  );
  const db = getDb();
  const [binding] = await db
    .select()
    .from(wechatBindings)
    .where(
      and(
        eq(wechatBindings.appid, identity.appid),
        eq(wechatBindings.openid, identity.openid),
      ),
    );
  if (!binding)
    return okJson(
      { status: "binding-required" },
      { headers: { "Cache-Control": "no-store" } },
    );
  // Serialize against account deletion, unbinding and governance changes.
  return db.transaction(async (tx) => {
    await lockActiveAccount(tx, binding.userId);
    const [current] = await tx
      .select()
      .from(wechatBindings)
      .where(eq(wechatBindings.id, binding.id));
    if (!current)
      throw new AppError("UNAUTHORIZED", "微信绑定已变化，请重新登录");
    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, binding.userId));
    if (!user?.emailVerifiedAt) throw new AppError("FORBIDDEN", "请先验证邮箱");
    const session = await createSession(
      tx,
      user.id,
      new Date(),
      "微信小程序",
      "weapp",
    );
    return okJson(
      {
        status: "authenticated",
        userId: user.id,
        email: user.email,
        emailVerified: true,
        token: session.token,
        expiresAt: session.expiresAt.toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
});
