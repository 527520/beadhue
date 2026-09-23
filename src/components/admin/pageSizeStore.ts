'use client';

/**
 * 后台列表每页条数记忆（admin-round-3 06）：默认 10，可选 10/20/50/100，按模块分别记住。
 * 只存条数（非敏感），读回时校验白名单，坏值一律回退默认。
 */
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, type PageSize } from '@/lib/admin/pagination';

const KEY_PREFIX = 'doupu.admin.pageSize.';

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    // 隐私模式/禁用存储：静默回退默认值，不影响列表可用性。
    return null;
  }
}

export function readStoredPageSize(module: string): PageSize {
  const raw = storage()?.getItem(`${KEY_PREFIX}${module}`);
  const value = Number(raw);
  return (PAGE_SIZES as readonly number[]).includes(value) ? (value as PageSize) : DEFAULT_PAGE_SIZE;
}

export function storePageSize(module: string, size: PageSize): void {
  try {
    storage()?.setItem(`${KEY_PREFIX}${module}`, String(size));
  } catch {
    // 写不进去（配额/隐私模式）就算了，本轮选择只影响下一次打开。
  }
}
