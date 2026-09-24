'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminPage } from '@/components/admin/useAdminPage';

export type FilterValue = string | string[];
export type FilterState = Record<string, FilterValue>;
/** 表头排序：列键 + 方向，交给服务端整表排序。 */
export type SortState = { key: string; dir: 'asc' | 'desc' } | null;

const active = (value: FilterValue | undefined) => (Array.isArray(value) ? value.length > 0 : Boolean(value));

/** 查询串：空条件不带（服务端 schema 是 strict，空字符串会报错）；多选用逗号拼接。 */
export function tableQuery(q: string, filters: FilterState, extra: Record<string, string | undefined> = {}): string {
  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  for (const [key, value] of Object.entries(filters)) if (active(value)) params.set(key, Array.isArray(value) ? value.join(',') : value);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  return params.toString();
}

/**
 * 后台表格的读取状态：搜索（160ms 去抖）、筛选、页码与每页条数（按模块记忆，沿用 r14 的 pageSizeStore）。
 * 列表数据仍由 useAdminPage 分页读取；条件变化回到第 1 页。
 */
export function useAdminTable<T>(endpoint: string, module: string, options: { initialQ?: string; isItem?: (value: unknown) => value is T; extra?: Record<string, string | undefined>; mapFilters?: (filters: FilterState) => FilterState } = {}) {
  const [input, setInput] = useState(options.initialQ ?? '');
  const [q, setQ] = useState(options.initialQ ?? '');
  const [filters, setFilters] = useState<FilterState>({});
  const [sort, setSortState] = useState<SortState>(null);
  const query = tableQuery(q, options.mapFilters ? options.mapFilters(filters) : filters, { ...options.extra, sort: sort?.key, order: sort?.dir });
  const page = useAdminPage<T>(query ? `${endpoint}?${query}` : endpoint, module, options.isItem);
  const { setPage } = page;
  const setSort = useCallback((next: SortState) => { setSortState(next); setPage(1); }, [setPage]);
  useEffect(() => {
    if (input === q) return;
    const timer = window.setTimeout(() => { setQ(input); setPage(1); }, 160);
    return () => window.clearTimeout(timer);
  }, [input, q, setPage]);
  const setFilter = useCallback((key: string, value: FilterValue) => { setFilters((current) => ({ ...current, [key]: value })); setPage(1); }, [setPage]);
  const reset = useCallback(() => { setInput(''); setQ(''); setFilters({}); setPage(1); }, [setPage]);
  const filtered = useMemo(() => Boolean(q.trim()) || Object.values(filters).some(active), [q, filters]);
  return { ...page, input, setInput, q, filters, setFilter, reset, filtered, query, sort, setSort };
}

/** 导出 CSV：按当前条件逐页取（每页 100，最多 2000 条），加 BOM 以便表格软件识别 UTF-8。 */
export async function exportCsv<T>(endpoint: string, query: string, columns: Array<[string, (row: T) => unknown]>, filename: string): Promise<number> {
  const rows: T[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const response = await fetch(`${endpoint}?${query ? `${query}&` : ''}page=${page}&size=100`, { cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    const body = await response.json() as { items?: T[]; totalPages?: number };
    rows.push(...(body.items ?? []));
    if (!body.totalPages || page >= body.totalPages) break;
  }
  const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const text = [columns.map(([header]) => cell(header)).join(','), ...rows.map((row) => columns.map(([, get]) => cell(get(row))).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff', text], { type: 'text/csv;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  return rows.length;
}
