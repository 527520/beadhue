// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAdminInspection } from './useAdminInspection';
import { zhCN } from '@/messages/zh-CN';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it.each([
  { name: 'inspection', useRead: () => useAdminInspection('/api/admin/example/id') },
])('a malformed or failed $name read never exposes browser/JSON internals', async ({ useRead }) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('{')).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockResolvedValueOnce(new Response('{"error":{"message":"对象版本已变化"}}', { status: 409 })));
  const { result } = renderHook<{ error: string | null; reload: () => Promise<void> }, void>(useRead);
  await waitFor(() => expect(result.current.error).toBe(zhCN.communityAdmin.queueLoadFailed));
  await act(async () => { await result.current.reload(); });
  expect(result.current.error).toBe(zhCN.communityAdmin.queueLoadFailed);
  await act(async () => { await result.current.reload(); });
  expect(result.current.error).toBe('对象版本已变化');
});
it.each([
  { name: 'inspection', useRead: () => useAdminInspection('/api/admin/example/id') },
])('a stalled $name becomes an explicit retryable error instead of loading forever', async ({ useRead }) => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => { init?.signal?.addEventListener('abort', () => reject(new Error('timeout'))); })));
  const { result } = renderHook<{ error: string | null; reload: () => Promise<void> }, void>(useRead);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect(result.current.error).toBeTruthy();
  vi.mocked(fetch).mockResolvedValueOnce(new Response('{"items":[],"id":"one"}'));
  await act(async () => { await result.current.reload(); });
  expect(result.current.error).toBeNull();
});
