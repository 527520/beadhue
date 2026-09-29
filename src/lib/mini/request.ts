import { AppError } from "@/lib/errors";
import { getDb } from "@/lib/auth/db";
import { resolveTokenSession } from "@/lib/auth/session";
import { miniRequestContext } from "./context";

const PUBLIC_AUTH = new Set([
  "wechat-login",
  "email-login",
  "register",
  "resend-verification",
  "forgot-password",
]);
const PRIVATE_ROUTES: Array<[RegExp, readonly string[]]> = [
  [/^\/api\/auth\/me$/, ["GET"]],
  [/^\/api\/auth\/account$/, ["POST", "DELETE"]],
  [/^\/api\/auth\/(logout|change-password)$/, ["POST"]],
  [/^\/api\/me\/sessions$/, ["GET"]],
  [/^\/api\/me\/sessions\/revoke-others$/, ["POST"]],
  [/^\/api\/designs$/, ["GET"]],
  [/^\/api\/designs\/[a-f0-9-]{36}$/, ["GET", "PUT", "DELETE"]],
  [/^\/api\/designs\/[a-f0-9-]{36}\/original$/, ["GET", "PUT", "DELETE"]],
  [/^\/api\/designs\/[a-f0-9-]{36}\/thumbnail$/, ["GET"]],
  [/^\/api\/palettes$/, ["GET"]],
  [/^\/api\/palettes\/[a-f0-9-]{36}$/, ["GET", "PUT", "DELETE"]],
  [/^\/api\/originals(\/usage|\/designs)?$/, ["GET"]],
  [/^\/api\/mini\/auth\/wechat-binding$/, ["GET", "POST", "DELETE"]],
];

export function allowsMiniRequest(path: string, method: string): boolean {
  return PRIVATE_ROUTES.some(
    ([pattern, methods]) => pattern.test(path) && methods.includes(method),
  );
}

export function miniAuthEnabled(): void {
  if (process.env.MINI_AUTH_ENABLED !== "true")
    throw new AppError("FORBIDDEN", "小程序登录尚未开放");
}

export async function withMiniRequest<T>(
  request: Request | null,
  run: () => Promise<T>,
): Promise<T> {
  if (!request) return run();
  // Nested shared route handlers retain only the context for this exact request.
  if (miniRequestContext.getStore()?.request === request) return run();
  const path = new URL(request.url).pathname;
  const publicName = path.startsWith("/api/mini/auth/")
    ? path.slice("/api/mini/auth/".length)
    : "";
  if (PUBLIC_AUTH.has(publicName) && request.method === "POST") {
    miniAuthEnabled();
    if (request.headers.has("origin"))
      throw new AppError("FORBIDDEN", "此入口仅用于原生客户端");
    if (
      !/^application\/json(?:;|$)/i.test(
        request.headers.get("content-type") ?? "",
      )
    ) {
      throw new AppError("VALIDATION", "请求体必须为 application/json");
    }
    return miniRequestContext.run({ request, session: null }, run);
  }
  const authorization = request.headers.get("authorization");
  if (!authorization) return miniRequestContext.exit(run);
  if (!allowsMiniRequest(path, request.method))
    throw new AppError("FORBIDDEN", "小程序会话不支持此操作");
  const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(authorization);
  if (!match) throw new AppError("UNAUTHORIZED", "会话无效，请重新登录");
  const session = await resolveTokenSession(getDb(), match[1], new Date(), {
    clientType: "weapp",
    renew: true,
  });
  if (!session) throw new AppError("UNAUTHORIZED", "会话已失效，请重新登录");
  return miniRequestContext.run({ request, session }, run);
}
