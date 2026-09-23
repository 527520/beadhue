'use client';

import { useSyncExternalStore } from 'react';

/** 最近搜索只存本机（不上传、不进统计），最多 6 条，新的在前。 */
export const RECENT_SEARCHES_KEY = 'beadhue:recent-searches';
export const RECENT_SEARCHES_LIMIT = 6;
const CHANGED = 'beadhue:recent-searches-changed';
const EMPTY: readonly string[] = [];

let cachedRaw: string | null = null;
let cachedList: readonly string[] = EMPTY;

function read(): readonly string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cachedRaw) return cachedList;
  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cachedList = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, RECENT_SEARCHES_LIMIT) : EMPTY;
  } catch {
    cachedList = EMPTY;
  }
  return cachedList;
}

function write(list: readonly string[]): void {
  try {
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
  } catch {
    // 隐私模式等存储不可用：静默放弃，不影响搜索本身。
  }
  window.dispatchEvent(new Event(CHANGED));
}

export function rememberSearch(query: string): void {
  const value = query.trim();
  if (!value) return;
  write([value, ...read().filter((item) => item !== value)].slice(0, RECENT_SEARCHES_LIMIT));
}

export function clearRecentSearches(): void {
  write([]);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useRecentSearches(): readonly string[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
