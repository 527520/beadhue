'use client';

import { useSyncExternalStore } from 'react';

/** 订阅媒体查询；服务端与首帧返回 fallback，避免水合不一致。 */
export function useMediaQuery(query: string, fallback = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : fallback),
    () => fallback,
  );
}

/** 手机宽度（< md 768）：弹窗变底部面板、弹出层变底部面板。 */
export const MOBILE_QUERY = '(max-width: 767px)';
/** 触屏无悬停：不显示 Tooltip。 */
export const NO_HOVER_QUERY = '(hover: none)';

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}
