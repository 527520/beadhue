/**
 * 公开页面进程内节流（ADR-0021）：proxy 在渲染前按 IP 计每分钟请求数，超限直接 429。
 * 单实例部署（D26）下进程内 Map 足够；键数量有上限并定期清理，避免被海量伪造 IP 撑爆内存。
 */
export interface PageThrottle {
  /** 返回 null 表示放行；否则返回建议的 Retry-After 秒数。 */
  hit(ip: string, now?: number): number | null;
  size(): number;
}

export function createPageThrottle(options: { limitPerMinute: number; maxKeys?: number }): PageThrottle {
  const WINDOW_MS = 60_000;
  const maxKeys = options.maxKeys ?? 20_000;
  const buckets = new Map<string, { windowStart: number; count: number }>();
  let lastSweep = 0;
  const sweep = (now: number) => {
    if (now - lastSweep < WINDOW_MS && buckets.size < maxKeys) return;
    lastSweep = now;
    for (const [key, bucket] of buckets) if (now - bucket.windowStart >= WINDOW_MS) buckets.delete(key);
    // 仍然过多：丢掉最早的一半，宁可放过也不能让内存无限增长。
    if (buckets.size >= maxKeys) for (const key of [...buckets.keys()].slice(0, Math.ceil(buckets.size / 2))) buckets.delete(key);
  };
  return {
    hit(ip, now = Date.now()) {
      sweep(now);
      const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;
      const bucket = buckets.get(ip);
      if (!bucket || bucket.windowStart !== windowStart) { buckets.set(ip, { windowStart, count: 1 }); return null; }
      bucket.count += 1;
      if (bucket.count <= options.limitPerMinute) return null;
      return Math.max(1, Math.ceil((windowStart + WINDOW_MS - now) / 1000));
    },
    size: () => buckets.size,
  };
}

/**
 * 需要页面级节流的公开路径：发现页（/，R15 起即豆社列表）、作品详情、作者主页、sitemap 分页、robots.txt。
 * 旧的 /community 由 next.config 的重定向在 proxy 之前处理，不再需要节流。
 *
 * 修正（admin-round-3 12）：`generateSitemaps` 只注册 `/sitemap/<n>.xml`
 * （见 Next 的 `generate-sitemaps` 文档与 `next-metadata-route-loader`：静态参数是
 * `"<n>.xml"`，没有 `/sitemap.xml` 这条路由），原先那个分支是永不命中的死代码，
 * 同时 `/robots.txt` 反而完全没有节流；现在按真实路径匹配并补上 robots.txt。
 */
export function isThrottledPublicPath(pathname: string): boolean {
  return pathname === '/'
    || /^\/community\/[0-9a-f-]{36}$/iu.test(pathname)
    || /^\/u\/[^/]{1,80}$/u.test(pathname)
    || /^\/sitemap\/\d+\.xml$/u.test(pathname)
    || pathname === '/robots.txt';
}
