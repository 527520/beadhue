'use client';

import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('scroll', onChange, { passive: true });
  return () => window.removeEventListener('scroll', onChange);
}

/** 页面是否已滚动（> 4px）：顶栏据此出现发丝边。服务端与水合首帧为 false。 */
export function useScrolled(threshold = 4): boolean {
  return useSyncExternalStore(subscribe, () => window.scrollY > threshold, () => false);
}
