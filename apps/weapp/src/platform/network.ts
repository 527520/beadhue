import Taro from "@tarojs/taro";
import {
  cloudDesignPageSchema,
  cloudDesignFullSchema,
  revisionResponseSchema,
  parseCloudResponse,
} from "@beadhue/core/sync-schemas";
import { ApiError, type CloudApi } from "@beadhue/core/sync";

export interface Session {
  token: string;
  userId: string;
  email: string;
  emailVerified: boolean;
  expiresAt: string;
}
const SESSION_KEY = "beadhue-mini-session";
let current: Session | null = null;
export function session(): Session | null {
  if (current) return current;
  const stored = Taro.getStorageSync<Session>(SESSION_KEY);
  if (stored?.token && /^[a-f0-9-]{36}$/.test(stored.userId)) current = stored;
  return current;
}
export function setSession(value: Session | null) {
  // Persist first so a failed secure-storage write cannot change the active namespace.
  if (value) Taro.setStorageSync(SESSION_KEY, value);
  else Taro.removeStorageSync(SESSION_KEY);
  current = value;
}
function baseUrl() {
  if (!/^https:\/\/[^/]+/.test(API_BASE_URL))
    throw new Error("云同步尚未配置，请先使用本地创作");
  return API_BASE_URL.replace(/\/$/, "");
}
export async function request<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    data?: unknown;
    token?: string | null;
    binary?: boolean;
    responseBytes?: boolean;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  if (!path.startsWith("/api/")) throw new Error("非法 API 路径");
  const token = options.token === undefined ? session()?.token : options.token;
  const result = await Taro.request<T>({
    url: `${baseUrl()}${path}`,
    method: options.method ?? "GET",
    data: options.data as string | object | ArrayBuffer | undefined,
    header: {
      ...options.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": options.binary
        ? "application/octet-stream"
        : "application/json",
    },
    responseType: options.responseBytes ? "arraybuffer" : "text",
    dataType: options.responseBytes ? "其他" : "json",
    timeout: 30000,
  });
  if (result.statusCode >= 300) {
    const error = (
      result.data as {
        error?: { code?: string; message?: string; field?: string };
      }
    )?.error;
    throw new ApiError(
      result.statusCode,
      error?.code ?? "NETWORK",
      error?.message ?? "请求失败，请稍后重试",
      error?.field,
    );
  }
  return result.data;
}
/** Capture the credential once. A request started as account A never acquires account B's token. */
export function cloudApi(token: string): CloudApi {
  const call = <T>(path: string, options: Parameters<typeof request>[1] = {}) =>
    request<T>(path, { ...options, token });
  return {
    listDesignsPage: async (cursor) =>
      parseCloudResponse(
        cloudDesignPageSchema,
        await call(
          `/api/designs${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
        ),
      ),
    getDesign: async (id) => {
      try {
        return parseCloudResponse(
          cloudDesignFullSchema,
          await call(`/api/designs/${id}`),
        );
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    putDesign: async (id, name, project, baseRevision) =>
      parseCloudResponse(
        revisionResponseSchema,
        await call(`/api/designs/${id}`, {
          method: "PUT",
          data: { name, project, baseRevision },
        }),
      ),
    deleteDesign: async (id, baseRevision) =>
      parseCloudResponse(
        revisionResponseSchema,
        await call(`/api/designs/${id}`, {
          method: "DELETE",
          data: { baseRevision },
        }),
      ),
  };
}
export async function privateImage(path: string): Promise<string> {
  const owner=session();
  if(!owner?.emailVerified)throw new Error("请先登录并验证邮箱");
  const data = await request<ArrayBuffer>(path, { responseBytes: true, token:owner.token });
  const local = `${wx.env.USER_DATA_PATH}/preview-${owner.userId}-${Date.now()}.png`;
  wx.getFileSystemManager().writeFileSync(local, data);
  return local;
}
