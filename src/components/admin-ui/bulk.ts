import { randomId } from '@/lib/ids';

/**
 * 批量写入（精选、下架、保留评论…）：接口只支持单项，这里逐项顺序提交，每项独立幂等键；
 * 某项因状态变化或权限失败不影响其余项，返回成功与失败数。
 */
export async function bulkWrite<T>(items: T[], request: (item: T) => { url: string; method: 'PATCH' | 'POST'; body: object }): Promise<{ done: number; failed: number }> {
  let done = 0;
  let failed = 0;
  for (const item of items) {
    const { url, method, body } = request(item);
    try {
      const response = await fetch(url, { method, headers: { 'content-type': 'application/json', 'idempotency-key': randomId() }, body: JSON.stringify(body) });
      if (response.ok) done += 1; else failed += 1;
    } catch { failed += 1; }
  }
  return { done, failed };
}
