'use client';

import { useEffect, useState } from 'react';

export interface SuggestTag { id: string; name: string; count: number }
export interface SuggestWork { id: string; revisionId: string; title: string; width: number; height: number; thumbnailUrl: string }
export interface SuggestAuthor { publicAuthorId: string; authorType: 'user' | 'official'; displayName: string; avatarColor?: string | null; workCount: number }
export interface SearchSuggestResult { q: string; tags: SuggestTag[]; works: SuggestWork[]; authors: SuggestAuthor[] }

/** 与接口一致（GET /api/community/search/suggest，q ≤ 40 字）。 */
export const SUGGEST_QUERY_MAX = 40;
const DEBOUNCE_MS = 180;
const CACHE_LIMIT = 60;
const cache = new Map<string, SearchSuggestResult>();

function remember(q: string, result: SearchSuggestResult): void {
  cache.delete(q);
  cache.set(q, result);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
}

function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalize(body: unknown, q: string): SearchSuggestResult {
  const data = (body ?? {}) as Partial<SearchSuggestResult>;
  return { q, tags: list<SuggestTag>(data.tags), works: list<SuggestWork>(data.works), authors: list<SuggestAuthor>(data.authors) };
}

export function normalizeSuggestQuery(query: string): string {
  return query.trim().slice(0, SUGGEST_QUERY_MAX);
}

/** 仅测试使用。 */
export function resetSuggestCache(): void {
  cache.clear();
}

/**
 * 搜索建议：空关键词取「大家在搜」（热门标签），有关键词时防抖后取匹配的图纸与作者。
 * 结果按关键词缓存在页面内；失败不缓存（下次聚焦重试），界面按「没有匹配」处理。
 */
export function useSearchSuggest(query: string, enabled: boolean): SearchSuggestResult | null {
  const q = normalizeSuggestQuery(query);
  const [failed, setFailed] = useState<string | null>(null);
  const [, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled || cache.has(q)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/community/search/suggest?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(`suggest ${response.status}`);
          remember(q, normalize(await response.json(), q));
          setVersion((value) => value + 1);
        })
        .catch(() => {
          if (!controller.signal.aborted) setFailed(q);
        });
    }, q ? DEBOUNCE_MS : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [q, enabled]);

  return cache.get(q) ?? (failed === q ? { q, tags: [], works: [], authors: [] } : null);
}
