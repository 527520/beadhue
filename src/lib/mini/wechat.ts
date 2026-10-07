import { AppError } from "@/lib/errors";
import { checkRateLimit, clientIp, rateLimitKey } from "@/lib/auth/rateLimit";
import { getDb } from "@/lib/auth/db";
import { miniAuthEnabled } from "./request";

export function wechatAppId(): string {
  const appid = process.env.WECHAT_APP_ID ?? "";
  if (!/^wx[a-f0-9]{16}$/i.test(appid))
    throw new AppError("FORBIDDEN", "微信登录尚未配置");
  return appid;
}

export async function limitWechatRequest(
  request: Request,
  userId?: string,
): Promise<void> {
  if (
    !(await checkRateLimit(
      getDb(),
      rateLimitKey("mini-auth-ip", clientIp(request)),
      30,
    ))
  ) {
    throw new AppError("RATE_LIMITED", "操作频繁，请稍后重试");
  }
  if (
    userId &&
    !(await checkRateLimit(getDb(), rateLimitKey("mini-binding", userId), 10))
  ) {
    throw new AppError("RATE_LIMITED", "操作频繁，请稍后重试");
  }
}

/** Do not log the upstream URL/body: both carry credentials. */
export async function exchangeWechatCode(
  code: unknown,
): Promise<{ appid: string; openid: string; unionid: string | null }> {
  miniAuthEnabled();
  if (typeof code !== "string" || code.length < 1 || code.length > 256)
    throw new AppError("VALIDATION", "微信凭证无效，请重新登录");
  const appid = wechatAppId();
  const secret = process.env.WECHAT_APP_SECRET;
  if (!secret) throw new AppError("FORBIDDEN", "微信登录尚未配置");
  const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
  url.search = new URLSearchParams({
    appid,
    secret,
    js_code: code,
    grant_type: "authorization_code",
  }).toString();
  let data: { errcode?: number; openid?: unknown; unionid?: unknown };
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("upstream");
    data = await response.json();
  } catch {
    throw new AppError("VALIDATION", "微信服务暂时不可用，请稍后重试");
  }
  if (
    data.errcode ||
    typeof data.openid !== "string" ||
    !data.openid ||
    data.openid.length > 128
  ) {
    throw new AppError("UNAUTHORIZED", "微信凭证已失效，请重新登录");
  }
  return {
    appid,
    openid: data.openid,
    unionid: typeof data.unionid === "string" ? data.unionid : null,
  };
}
