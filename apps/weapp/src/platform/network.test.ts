import { beforeEach, it, expect, vi } from "vitest";
const fake = vi.hoisted(() => ({
  data: new Map<string, unknown>(),
  request: vi.fn(),
}));
vi.mock("@tarojs/taro", () => ({
  default: {
    getStorageSync: (k: string) => fake.data.get(k),
    setStorageSync: (k: string, v: unknown) => fake.data.set(k, v),
    removeStorageSync: (k: string) => fake.data.delete(k),
    request: fake.request,
  },
}));
import {
  session,
  setSession,
  updateSessionIfCurrent,
  logoutSession,
  privateImage,
} from "./network";
const a = {
  token: "a".repeat(64),
  userId: "12345678-1234-4234-8234-123456789012",
  email: "a@example.com",
  emailVerified: true,
  expiresAt: "2027-01-01",
};
const b = {
  ...a,
  token: "b".repeat(64),
  userId: "22345678-1234-4234-8234-123456789012",
};
beforeEach(() => {
  setSession(null);
  fake.request.mockReset();
  vi.stubGlobal("API_BASE_URL", "https://api.example.com");
});
it("does not restore a revoked account from a late refresh response", () => {
  setSession(a);
  setSession(null);
  expect(updateSessionIfCurrent(a.token, { ...a, emailVerified: true })).toBe(
    false,
  );
  expect(session()).toBeNull();
  setSession(b);
  expect(updateSessionIfCurrent(a.token, a)).toBe(false);
  expect(session()).toEqual(b);
});
it.each([401, 403])(
  "can sign out locally after server rejection %s",
  async (statusCode) => {
    setSession(a);
    fake.request.mockResolvedValue({
      statusCode,
      data: { error: { code: "UNAUTHENTICATED", message: "expired" } },
    });
    expect(await logoutSession()).toBe(true);
    expect(session()).toBeNull();
  },
);
it("does not clear a newer account when an older logout finishes", async () => {
  let finish!: (v: unknown) => void;
  setSession(a);
  fake.request.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const job = logoutSession();
  setSession(b);
  finish({ statusCode: 200, data: {} });
  expect(await job).toBe(false);
  expect(session()).toEqual(b);
});
it("never displays a private download after account switch and fixes the request credential", async () => {
  let finish!: (v: unknown) => void;
  setSession(a);
  fake.request.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const job = privateImage("/api/designs/123/original");
  setSession(b);
  finish({ statusCode: 200, data: new ArrayBuffer(4) });
  await expect(job).rejects.toThrow("账号已切换");
  expect(fake.request.mock.calls[0][0].header.Authorization).toBe(
    `Bearer ${a.token}`,
  );
});
