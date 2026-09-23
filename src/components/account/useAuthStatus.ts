'use client';

/**
 * 登录态探测（J-1）。
 *
 * `/api/auth/me` 的探测此前在 Workbench、HomeAuthNav、OnboardingGuide 里各写一遍，
 * 三处对「401」「网络失败」「响应体缺 email」的处理还各不相同；首页同时渲染
 * 导航与新手引导，等于同一个接口请求两次。
 *
 * 这里收成一个 hook 并共享同一次在途请求：
 * - 401 → guest；
 * - 网络失败 → unknown（区别于 guest：新手引导在网络异常时不打扰用户，
 *   而导航把 unknown 当作未登录处理即可）。
 *
 * R15-03：结果另存一份页面级快照（useSyncExternalStore）。站点外壳随页面重新挂载时先用上一次的结果
 * 渲染头像，再在后台重新探测，切换页面不再闪一下「登录」按钮；服务端与水合首帧仍是 loading。
 */
import { useEffect, useSyncExternalStore } from 'react';

export type AuthStatus =
  | { kind: 'loading' }
  | { kind: 'guest' }
  | { kind: 'unknown' }
  | {
      kind: 'user';
      email: string;
      username: string | null;
      /** 公开作者 ID（头像取色、作者主页）；旧响应缺省为 null。 */
      publicAuthorId: string | null;
      role: 'user' | 'moderator' | 'admin';
    };

type Settled = Exclude<AuthStatus, { kind: 'loading' }>;

const LOADING: AuthStatus = { kind: 'loading' };
/** 页面级共享：同一次加载里多个组件只发一次请求。 */
let inflight: Promise<Settled> | null = null;
let snapshot: AuthStatus = LOADING;
const listeners = new Set<() => void>();
const AUTH_STATUS_CHANGED = 'beadhue:auth-status-changed';

function readRole(value: unknown): 'user' | 'moderator' | 'admin' {
  return value === 'admin' || value === 'moderator' ? value : 'user';
}

async function probe(): Promise<Settled> {
  try {
    const response = await fetch('/api/auth/me', { method: 'GET' });
    if (!response.ok) return { kind: 'guest' };
    const body = (await response.json().catch(() => null)) as { email?: string; username?: string | null; publicAuthorId?: string | null; role?: string } | null;
    return { kind: 'user', email: body?.email ?? '', username: body?.username ?? null, publicAuthorId: body?.publicAuthorId ?? null, role: readRole(body?.role) };
  } catch {
    return { kind: 'unknown' };
  }
}

function publish(next: AuthStatus): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

function sharedProbe(): Promise<Settled> {
  inflight ??= probe()
    .then((settled) => {
      publish(settled);
      return settled;
    })
    .finally(() => {
      // 请求完成后清空，方便登录/退出后重新探测（下一次挂载会重新发起）。
      inflight = null;
    });
  return inflight;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 需要确定登录态时（如「需要登录的操作」）：已有结果直接返回，否则等待这一次探测。 */
export function ensureAuthStatus(): Promise<Settled> {
  return snapshot.kind === 'loading' ? sharedProbe() : Promise.resolve(snapshot);
}

/** 仅测试使用：清掉共享的在途请求与快照，避免用例之间互相影响。 */
export function resetAuthStatusCache(): void {
  inflight = null;
  snapshot = LOADING;
}

/** 登录、退出或展示资料更新后，通知当前页面上的所有导航重新探测。 */
export function notifyAuthStatusChanged(): void {
  window.dispatchEvent(new Event(AUTH_STATUS_CHANGED));
}

export function useAuthStatus(): AuthStatus {
  const status = useSyncExternalStore(subscribe, () => snapshot, () => LOADING);

  useEffect(() => {
    const refresh = (): void => {
      void sharedProbe();
    };
    refresh();
    window.addEventListener(AUTH_STATUS_CHANGED, refresh);
    return () => window.removeEventListener(AUTH_STATUS_CHANGED, refresh);
  }, []);

  return status;
}
