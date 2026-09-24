'use client';

import { useCallback, useEffect, useState } from 'react';

export interface OriginalUsage {
  bytes: number;
  images: number;
  quotaBytes: number;
}

/** 原图空间用量（GET /api/originals/usage，仅已验证账号）；null 为读取中，'error' 为读取失败。 */
export function useOriginalUsage(enabled: boolean) {
  const [usage, setUsage] = useState<OriginalUsage | 'error' | null>(null);
  const reload = useCallback(async () => {
    try {
      const response = await fetch('/api/originals/usage', { cache: 'no-store' });
      const body = response.ok ? ((await response.json()) as Partial<OriginalUsage>) : null;
      if (body && Number.isFinite(body.bytes) && Number(body.quotaBytes) > 0) {
        setUsage({ bytes: Number(body.bytes), images: Number(body.images ?? 0), quotaBytes: Number(body.quotaBytes) });
      } else setUsage('error');
    } catch {
      setUsage('error');
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timer);
  }, [enabled, reload]);
  return { usage, reload };
}
