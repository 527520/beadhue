'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';

/**
 * 未读通知数（D70）：页面级共享，桌面顶栏与手机顶栏的两个铃铛读同一份数字、只发一次请求。
 * 不做长连接：铃铛挂载、换页（pathname 变化）、窗口重新聚焦或标签页回到前台时刷新；
 * 弹出层里列表与标记已读的响应也会带回最新数字。换了账号（或退出后再登录）从 0 重新开始。
 */

/** 这段时间内的重复触发（两个铃铛同时挂载、StrictMode 双调用、聚焦与可见性事件接连到达）合并成一次。 */
export const UNREAD_FRESH_MS = 3_000;
const ENDPOINT = '/api/me/notifications/unread-count';

let owner: string | null = null;
let unread = 0;
let checkedAt = 0;
let generation = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: number): void {
  unread = Math.max(0, Math.floor(next) || 0);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 以服务端返回为准写入未读数（列表、标记已读的响应都带 unreadCount）。 */
export function setUnreadCount(next: number): void {
  checkedAt = Date.now();
  publish(next);
}

/** 乐观扣减：标记已读的请求发出时先减，响应回来再以服务端数字校正。 */
export function decrementUnreadCount(by: number): void {
  publish(unread - by);
}

export function refreshUnreadCount({ force = false }: { force?: boolean } = {}): Promise<void> {
  if (owner === null) return Promise.resolve();
  if (inflight) return inflight;
  if (!force && Date.now() - checkedAt < UNREAD_FRESH_MS) return Promise.resolve();
  const ticket = generation;
  const request = fetch(ENDPOINT, { cache: 'no-store' })
    .then(async (response) => {
      if (ticket !== generation) return;
      // 会话过期或账号被暂停：不显示徽标，登录态由 useAuthStatus 自己更新。
      if (response.status === 401 || response.status === 403) return setUnreadCount(0);
      if (!response.ok) return;
      const body = (await response.json().catch(() => null)) as { unreadCount?: unknown } | null;
      if (ticket === generation && typeof body?.unreadCount === 'number') setUnreadCount(body.unreadCount);
    })
    .catch(() => undefined)
    .finally(() => {
      if (inflight === request) inflight = null;
    });
  inflight = request;
  return request;
}

/** 当前页面属于哪个账号；换人时清零并作废在途请求。 */
function claim(user: string): void {
  if (owner === user) return;
  owner = user;
  generation += 1;
  inflight = null;
  checkedAt = 0;
  publish(0);
}

/** 仅测试使用：清掉共享状态。 */
export function resetUnreadStore(): void {
  owner = null;
  generation += 1;
  inflight = null;
  checkedAt = 0;
  unread = 0;
}

/** 已登录用户的未读数；负责触发挂载、换页与聚焦时的刷新。 */
export function useUnreadCount(user: string): number {
  const pathname = usePathname();
  const count = useSyncExternalStore(subscribe, () => (owner === user ? unread : 0), () => 0);
  useEffect(() => {
    claim(user);
    void refreshUnreadCount();
  }, [user, pathname]);
  useEffect(() => {
    const refresh = () => void refreshUnreadCount();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return count;
}
