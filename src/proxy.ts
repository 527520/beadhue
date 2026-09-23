import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { buildContentSecurityPolicy } from '@/lib/security/csp';
import { createPageThrottle, isThrottledPublicPath } from '@/lib/security/pageThrottle';

// 进程内页面节流（ADR-0021）：阈值读环境变量而不是 config 模块，proxy 不应拖入完整配置与数据库依赖。
const pageLimit = Number.parseInt(process.env.RATE_PUBLIC_PAGE_IP_MINUTE ?? '', 10);
const throttle = createPageThrottle({ limitPerMinute: Number.isFinite(pageLimit) && pageLimit > 0 ? pageLimit : 120 });

/**
 * robots / sitemap 的输出缓存（admin-round-3 12）。
 *
 * Next 的元数据路由自己固定发 `Cache-Control: public, max-age=0, must-revalidate`
 * （见 next-metadata-route-loader.js），用户代码没有覆盖入口；但 proxy 设的响应头会先落到
 * Node 响应上，而 Next 写回路由响应头时只补「尚未存在」的头（server/send-response.js），
 * 所以这里能把 s-maxage 赢下来。真正的重复抓取成本另由 sitemapWorks 的进程内缓存兜底。
 * 阈值同样读环境变量（SITEMAP_HTTP_S_MAXAGE，默认 300，与 config.security.sitemapHttpSMaxAge 对齐）。
 */
const sMaxAgeRaw = Number.parseInt(process.env.SITEMAP_HTTP_S_MAXAGE ?? '', 10);
const sitemapSMaxAge = Number.isFinite(sMaxAgeRaw) && sMaxAgeRaw >= 0 ? sMaxAgeRaw : 300;

function isCacheableMetadataPath(pathname: string): boolean {
  return pathname === '/robots.txt' || /^\/sitemap\/\d+\.xml$/u.test(pathname);
}

function requestIp(request: NextRequest): string {
  return request.headers.get('x-real-ip')?.trim() || request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
}

export function proxy(request: NextRequest) {
  if (isThrottledPublicPath(request.nextUrl.pathname)) {
    const ip = requestIp(request);
    const retryAfter = ip === 'local' ? null : throttle.hit(ip);
    if (retryAfter !== null) {
      return new NextResponse('访问过于频繁，请稍后再试', { status: 429, headers: { 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store', 'content-type': 'text/plain; charset=utf-8' } });
    }
  }
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const policy = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === 'development');
  const requestHeaders = new Headers(request.headers);

  // Next.js reads both request headers while rendering: x-nonce is available
  // to Server Components and CSP is parsed to nonce framework/RSC scripts.
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', policy);
  // robots / sitemap：对共享缓存声明短 s-maxage（默认 5 分钟），爬虫重复抓取由 CDN 承接。
  if (sitemapSMaxAge > 0 && isCacheableMetadataPath(request.nextUrl.pathname)) {
    response.headers.set('Cache-Control', `public, s-maxage=${sitemapSMaxAge}, stale-while-revalidate=${sitemapSMaxAge}`);
  }
  // Cross-origin isolation exposes SharedArrayBuffer so generation cancellation
  // can be observed from a busy worker without waiting for its event loop.
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  return response;
}

export const config = {
  matcher: [
    {
      // robots.txt 也走 proxy：它需要和 sitemap 一起按 IP 节流（admin-round-3 12），
      // 顺带享受与页面一致的 CSP 响应头。
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
