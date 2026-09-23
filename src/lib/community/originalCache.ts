/**
 * 原图字节的进程内 LRU 缓存（admin-round-3 12）。
 *
 * 原图 GET 每次命中 COS 都要走一次外网往返并完整下载对象（单张上限 20 MB）；
 * 同一 cosKey 的内容是不变的（键名里带 sha256），所以取回一次即可驻留内存，
 * 重复取回不再打 COS。按字节预算 + 条数上限淘汰，超预算只丢弃最久未用的一条。
 *
 * 挂在 globalThis 上（与缩略图缓存同样的理由）：公开原图路由与管理端预览路由
 * 是两个独立打包的模块，模块级变量不共享；缓存实例必须是同一个才有意义。
 */
import { config } from '@/lib/config';

export class ByteLruCache {
  private readonly entries = new Map<string, Buffer>();
  private total = 0;
  private readonly maxEntries: number;
  constructor(private readonly budgetBytes: number, maxEntries = Number.MAX_SAFE_INTEGER) {
    this.maxEntries = Math.max(1, maxEntries);
  }
  get(key: string): Buffer | undefined {
    const value = this.entries.get(key);
    if (value) { this.entries.delete(key); this.entries.set(key, value); }
    return value;
  }
  set(key: string, value: Buffer): void {
    // 单条就超过总预算时不缓存：否则会把其余条目全部挤掉。
    if (value.length > this.budgetBytes) return;
    const existing = this.entries.get(key);
    if (existing) { this.total -= existing.length; this.entries.delete(key); }
    this.entries.set(key, value);
    this.total += value.length;
    for (const [oldest, buffer] of this.entries) {
      if (this.total <= this.budgetBytes && this.entries.size <= this.maxEntries) break;
      this.entries.delete(oldest);
      this.total -= buffer.length;
    }
  }
  /** 对象被替换 / 删除时同步失效，避免继续供应已下线的字节。 */
  delete(key: string): void {
    const existing = this.entries.get(key);
    if (!existing) return;
    this.entries.delete(key);
    this.total -= existing.length;
  }
  get size() { return this.entries.size; }
  get bytes() { return this.total; }
}

const CACHE_KEY = '__beadhue_original_byte_cache__';

export function getOriginalByteCache(): ByteLruCache {
  const store = globalThis as Record<string, unknown>;
  let cache = store[CACHE_KEY] as ByteLruCache | undefined;
  if (!cache) {
    // 预算为 0（ORIGINAL_CACHE_BYTES=0）时等价于关闭缓存：set 一律丢弃。
    cache = new ByteLruCache(config.security.originalCacheBytes);
    store[CACHE_KEY] = cache;
  }
  return cache;
}
