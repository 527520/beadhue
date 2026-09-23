'use client';

/**
 * 后台列表分页读取（admin-round-3 06）。
 *
 * 取代只用游标的 `useAdminCollection`：这里带页码、每页条数与总数，
 * 并且会在服务端把页码夹回总页数时同步本地状态（删除最后一页的最后一条后不会停在空页）。
 *
 * 与旧 hook 的两点行为差异（都是刻意的）：
 * - 只有「本模块首次加载」显示骨架；翻页 / 换每页条数 / 重新加载时保留现有行并标记 aria-busy，
 *   避免每翻一页整列表卸载重画。
 * - 暴露 `patchItem`：保存标签这类只改一个字段的写入不再需要整列表重拉。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { zhCN } from '@/messages/zh-CN';
import { ApiError } from '@/lib/sync/clientAdapter';
import type { PageSize } from '@/lib/admin/pagination';
import { readStoredPageSize, storePageSize } from './pageSizeStore';

interface Snapshot<T> {
  key: string;
  items: T[];
  total: number;
  totalPages: number;
  page: number;
  loading: boolean;
  error: string | null;
}

/** 把 page / size 拼到已有查询串上（base 可能已经带 `?q=`）。 */
export function pageUrl(baseUrl: string, page: number, size: number): string {
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}page=${page}&size=${size}`;
}

export function useAdminPage<T>(baseUrl: string, module: string, isItem?: (value: unknown) => value is T) {
  const [size, setSize] = useState<PageSize>(() => readStoredPageSize(module));
  const [page, setPage] = useState(1);
  const url = pageUrl(baseUrl, page, size);
  const [snapshot, setSnapshot] = useState<Snapshot<T>>({ key: '', items: [], total: 0, totalPages: 1, page: 1, loading: true, error: null });
  const sequence = useRef(0);
  const activeRead = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    const request = ++sequence.current;
    activeRead.current?.abort();
    const controller = new AbortController(); activeRead.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    setSnapshot((previous) => previous.key === url
      ? { ...previous, loading: true, error: null }
      : { key: url, items: [], total: 0, totalPages: 1, page, loading: true, error: null });
    try {
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new ApiError(response.status, 'UNKNOWN', body?.error?.message || zhCN.communityAdmin.queueLoadFailed);
      if (!Array.isArray(body?.items) || (isItem && !body.items.every(isItem))) throw new Error();
      if (request !== sequence.current) return;
      const total = typeof body.total === 'number' && Number.isFinite(body.total) ? Math.max(0, body.total) : body.items.length;
      const totalPages = typeof body.totalPages === 'number' && body.totalPages >= 1 ? body.totalPages : 1;
      const serverPage = typeof body.page === 'number' && body.page >= 1 ? body.page : page;
      setSnapshot({ key: url, items: body.items, total, totalPages, page: serverPage, loading: false, error: null });
      // 服务端把页码夹回范围内（例如删掉最后一页的最后一条）时同步，避免停在空页。
      if (serverPage !== page) setPage(serverPage);
    } catch (caught) {
      if (request === sequence.current) {
        setSnapshot((previous) => ({ ...previous, loading: false, error: controller.signal.aborted ? zhCN.communityAdmin.command.readTimeout : caught instanceof ApiError ? caught.message : zhCN.communityAdmin.queueLoadFailed }));
      }
    } finally { window.clearTimeout(timeout); }
  }, [url, isItem, page]);

  useEffect(() => {
    const requestSequence = sequence;
    const reads = activeRead;
    const timer = window.setTimeout(() => void reload(), 0);
    return () => { window.clearTimeout(timer); requestSequence.current++; reads.current?.abort(); };
  }, [reload]);

  /** 换每页条数：回到第 1 页并记住选择。 */
  const changeSize = useCallback((next: PageSize) => {
    setSize(next);
    storePageSize(module, next);
    setPage(1);
  }, [module]);

  /** 只改本地某一项（保存标签、批量打标这类已知服务端结果的写入）。 */
  const patchItem = useCallback((id: string, patch: Partial<T>) => {
    setSnapshot((previous) => ({ ...previous, items: previous.items.map((item) => ((item as { id?: string }).id === id ? { ...item, ...patch } : item)) }));
  }, []);

  const current = snapshot.key === url;
  return {
    items: current ? snapshot.items : [],
    total: current ? snapshot.total : 0,
    totalPages: current ? snapshot.totalPages : 1,
    page: current ? snapshot.page : page,
    size,
    loading: !current || snapshot.loading,
    error: current ? snapshot.error : null,
    setPage,
    setSize: changeSize,
    reload,
    patchItem,
  };
}
