import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { eq } from "drizzle-orm";
import { createTestClient, type TestDatabase } from "@/../db/testClient";
import { rateLimits, sessions, users, wechatBindings } from "@/../db/schema";
import { setTestDb } from "@/lib/auth/db";
import {
  createSession,
  resolveSession,
  resolveTokenSession,
} from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { hashToken } from "@/lib/auth/tokens";
import { SESSION_COOKIE_NAME } from "@/lib/auth/cookies";
import { allowsMiniRequest, withMiniRequest } from "@/lib/mini/request";
import { enforceMutatingGuard } from "@/lib/auth/guard";
import { GET as me } from "@/app/api/auth/me/route";
import { POST as account } from "@/app/api/auth/account/route";
import { POST as login } from "./auth/email-login/route";
import { POST as wxLogin } from "./auth/wechat-login/route";
import {
  GET as binding,
  POST as bind,
  DELETE as unbind,
} from "./auth/wechat-binding/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as revoke } from "@/app/api/me/sessions/revoke-others/route";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined }),
}));
const appid = "wx1234567890abcdef";
function req(
  path: string,
  method = "GET",
  token?: string,
  body?: unknown,
  origin?: string,
) {
  return new Request(`https://example.test${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
describe("native private API boundary", () => {
  let db: TestDatabase,
    userId: string,
    web: string,
    mini: string,
    passwordHash: string;
  beforeAll(async () => {
    db = await createTestClient();
    setTestDb(db);
    passwordHash = await hashPassword("Correct-Horse-42!");
  });
  beforeEach(async () => {
    vi.stubEnv("MINI_AUTH_ENABLED", "true");
    vi.stubEnv("WECHAT_APP_ID", appid);
    vi.stubEnv("WECHAT_APP_SECRET", "test-only-secret");
    await db.delete(users);
    await db.delete(rateLimits);
    const [user] = await db
      .insert(users)
      .values({
        email: "mini@example.test",
        passwordHash,
        emailVerifiedAt: new Date(),
      })
      .returning();
    userId = user.id;
    web = (await createSession(db, userId)).token;
    mini = (await createSession(db, userId, new Date(), "微信小程序", "weapp"))
      .token;
  });
  afterAll(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("accepts a verified native token without Origin for private data", async () => {
    expect((await me(req("/api/auth/me", "GET", mini))).status).toBe(200);
    expect(
      (
        await account(
          req("/api/auth/account", "POST", mini, { username: "小豆" }),
        )
      ).status,
    ).toBe(204);
    expect((await db.select().from(users))[0].username).toBe("小豆");
  });
  it("does not treat a Web token as Bearer or a mini token as a Cookie", async () => {
    expect((await me(req("/api/auth/me", "GET", web))).status).toBe(401);
    expect(
      await resolveSession(db, `${SESSION_COOKIE_NAME}=${mini}`),
    ).toBeNull();
    expect(
      await resolveTokenSession(db, web, new Date(), { clientType: "weapp" }),
    ).toBeNull();
  });
  it("rejects community, share and admin routes even for a native admin", async () => {
    await db.update(users).set({ role: "admin" }).where(eq(users.id, userId));
    for (const path of [
      "/api/admin/users",
      "/api/community/works",
      "/api/designs/00000000-0000-4000-8000-000000000000/share",
    ]) {
      expect(allowsMiniRequest(path, "POST")).toBe(false);
      await expect(
        withMiniRequest(req(path, "POST", mini, {}), async () => true),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });
  it("does not weaken Origin checks without a verified native context", () => {
    expect(
      enforceMutatingGuard(req("/api/auth/account", "POST", undefined, {}))
        ?.status,
    ).toBe(403);
    expect(
      enforceMutatingGuard(req("/api/auth/account", "POST", mini, {}))?.status,
    ).toBe(403);
  });
  it("isolates concurrent request contexts", async () => {
    await Promise.all([
      withMiniRequest(req("/api/auth/account", "POST", mini, {}), async () => {
        await new Promise((r) => setTimeout(r, 10));
        expect((await me(req("/api/auth/me", "GET", mini))).status).toBe(200);
      }),
      withMiniRequest(req("/api/auth/me"), async () => {
        expect((await me(req("/api/auth/me"))).status).toBe(401);
      }),
    ]);
  });
  it("reuses password login and issues only a hashed native session", async () => {
    const response = await login(
      req("/api/mini/auth/email-login", "POST", undefined, {
        email: "mini@example.test",
        password: "Correct-Horse-42!",
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    const body = await response.json();
    expect(body.userId).toBe(userId);
    const [row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, hashToken(body.token)));
    expect(row.clientType).toBe("weapp");
    expect(row.tokenHash).not.toBe(body.token);
  });
  it("blocks browser Origin on native public login and respects kill switch", async () => {
    expect(
      (
        await login(
          req(
            "/api/mini/auth/email-login",
            "POST",
            undefined,
            {},
            "https://evil.test",
          ),
        )
      ).status,
    ).toBe(403);
    vi.stubEnv("MINI_AUTH_ENABLED", "false");
    expect(
      (
        await wxLogin(
          req("/api/mini/auth/wechat-login", "POST", undefined, {
            code: "code",
          }),
        )
      ).status,
    ).toBe(403);
  });
  it("does not elevate an unverified email session", async () => {
    await db
      .update(users)
      .set({ emailVerifiedAt: null })
      .where(eq(users.id, userId));
    expect(
      (await account(req("/api/auth/account", "POST", mini, { username: "x" })))
        .status,
    ).toBe(401);
    expect(
      (
        await bind(
          req("/api/mini/auth/wechat-binding", "POST", mini, { code: "code" }),
        )
      ).status,
    ).toBe(401);
  });
  it("binds a fresh code and redacts identifiers, then logs into the same user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ openid: "openid-a", session_key: "must-never-leak" }),
      ),
    );
    expect(
      (
        await bind(
          req("/api/mini/auth/wechat-binding", "POST", mini, {
            code: "fresh-code",
          }),
        )
      ).status,
    ).toBe(204);
    const status = await (
      await binding(req("/api/mini/auth/wechat-binding", "GET", mini))
    ).json();
    expect(status.bound).toBe(true);
    expect(status.openid).toBeUndefined();
    const response = await wxLogin(
      req("/api/mini/auth/wechat-login", "POST", undefined, {
        code: "new-code",
      }),
    );
    const data = await response.json();
    expect(data.userId).toBe(userId);
    expect(data.session_key).toBeUndefined();
    expect(data.openid).toBeUndefined();
  });
  it("returns binding-required for unknown identity and denies stale code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ openid: "unknown" })),
    );
    expect(
      await (
        await wxLogin(
          req("/api/mini/auth/wechat-login", "POST", undefined, {
            code: "fresh",
          }),
        )
      ).json(),
    ).toEqual({ status: "binding-required" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ errcode: 40029 })),
    );
    expect(
      (
        await wxLogin(
          req("/api/mini/auth/wechat-login", "POST", undefined, {
            code: "stale",
          }),
        )
      ).status,
    ).toBe(401);
  });
  it("uniquely constrains both identity and per-app account binding", async () => {
    await db.insert(wechatBindings).values({ userId, appid, openid: "first" });
    await expect(
      db.insert(wechatBindings).values({ userId, appid, openid: "second" }),
    ).rejects.toThrow();
    const [other] = await db
      .insert(users)
      .values({ email: "other@example.test" })
      .returning();
    await expect(
      db
        .insert(wechatBindings)
        .values({ userId: other.id, appid, openid: "first" }),
    ).rejects.toThrow();
  });
  it("unbinds with password, revokes mini sessions and keeps Web valid", async () => {
    await db.insert(wechatBindings).values({ userId, appid, openid: "first" });
    expect(
      (
        await unbind(
          req("/api/mini/auth/wechat-binding", "DELETE", mini, {
            password: "wrong",
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await unbind(
          req("/api/mini/auth/wechat-binding", "DELETE", mini, {
            password: "Correct-Horse-42!",
          }),
        )
      ).status,
    ).toBe(204);
    expect(
      await resolveTokenSession(db, mini, new Date(), { clientType: "weapp" }),
    ).toBeNull();
    expect(
      await resolveSession(db, `${SESSION_COOKIE_NAME}=${web}`),
    ).not.toBeNull();
    expect(await db.select().from(wechatBindings)).toHaveLength(0);
  });
  it("revokes other devices across both clients while retaining this token", async () => {
    expect(
      (await revoke(req("/api/me/sessions/revoke-others", "POST", mini, {})))
        .status,
    ).toBe(200);
    expect(
      await resolveSession(db, `${SESSION_COOKIE_NAME}=${web}`),
    ).toBeNull();
    expect(
      await resolveTokenSession(db, mini, new Date(), { clientType: "weapp" }),
    ).not.toBeNull();
  });
  it("logout and suspension invalidate native access", async () => {
    expect(
      (await logout(req("/api/auth/logout", "POST", mini, {}))).status,
    ).toBe(204);
    expect((await me(req("/api/auth/me", "GET", mini))).status).toBe(401);
    const next = (await createSession(db, userId, new Date(), null, "weapp"))
      .token;
    await db
      .update(users)
      .set({ accountStatus: "suspended" })
      .where(eq(users.id, userId));
    expect((await me(req("/api/auth/me", "GET", next))).status).toBe(401);
  });
});
