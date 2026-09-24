'use client';

/**
 * 新建设计默认色板（「我的 · 色板」里「设为默认色板」）：登录后存在账号上，游客存在本机。
 * 只认内置色板；读不到或已下线的 ID 回落到 MARD 经典。
 */
import { useSyncExternalStore } from 'react';
import { isBuiltinPaletteId } from '@/lib/palettes';
import { createBeadhueApi } from '@/lib/sync/api';
import type { BuiltinPaletteId } from '@/lib/types';
import { notifyAuthStatusChanged, useAuthStatus } from './useAuthStatus';

export const FALLBACK_DEFAULT_PALETTE: BuiltinPaletteId = 'MARD';
const STORAGE_KEY = 'beadhue:default-palette';
const GUEST = '';
const listeners = new Set<() => void>();
/** 刚设完、账号资料还没重新探测回来（或本机存储不可写）时先用这个值；按账号区分，退出登录不串用。 */
let pending: { owner: string; id: BuiltinPaletteId } | null = null;

function readLocal(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

const emit = () => { for (const listener of listeners) listener(); };
const valid = (value: string | null | undefined): BuiltinPaletteId => (isBuiltinPaletteId(value) ? value : FALLBACK_DEFAULT_PALETTE);

export interface DefaultPalette {
  value: BuiltinPaletteId;
  /** 登录态已确定（游客读本机、登录读账号）；未确定前 value 是回落值。 */
  ready: boolean;
  set: (id: BuiltinPaletteId) => Promise<void>;
}

export function useDefaultPalette(): DefaultPalette {
  const auth = useAuthStatus();
  const local = useSyncExternalStore(subscribe, readLocal, () => null);
  const override = useSyncExternalStore(subscribe, () => pending, () => null);
  const owner = auth.kind === 'user' ? auth.email : GUEST;
  const stored = auth.kind === 'user' ? auth.defaultPalette : local;
  const value = valid(override?.owner === owner ? override.id : stored);
  const set = async (id: BuiltinPaletteId) => {
    if (auth.kind === 'user') {
      await createBeadhueApi().updateProfile({ defaultPalette: id });
      pending = { owner, id };
      notifyAuthStatusChanged();
    } else {
      try {
        window.localStorage.setItem(STORAGE_KEY, id);
        pending = null;
      } catch {
        pending = { owner, id };
      }
    }
    emit();
  };
  return { value, ready: auth.kind !== 'loading', set };
}
