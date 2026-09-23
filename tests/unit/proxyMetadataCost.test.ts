/**
 * proxy 层的 robots / sitemap 成本控制（admin-round-3 12）：
 * - 两者都纳入每 IP 每分钟页面节流（robots.txt 此前被 matcher 排除在外）；
 * - 对共享缓存声明短 s-maxage（Next 元数据路由自己发的 max-age=0 会被 proxy 的头赢下，
 *   见 server/send-response.js 只补「尚未存在」的头）。
 */
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

describe('proxy 元数据路径', () => {
  it('robots.txt 与 sitemap 分页下发短 s-maxage，并保留 CSP', () => {
    for (const path of ['/robots.txt', '/sitemap/0.xml', '/sitemap/12.xml']) {
      const response = proxy(new NextRequest(`http://localhost${path}`));
      expect(response.headers.get('cache-control')).toBe('public, s-maxage=300, stale-while-revalidate=300');
      expect(response.headers.get('content-security-policy')).toBeTruthy();
    }
  });

  it('普通页面不下发 s-maxage，仍带 CSP 与跨域隔离头', () => {
    const response = proxy(new NextRequest('http://localhost/app'));
    expect(response.headers.get('cache-control')).toBeNull();
    expect(response.headers.get('content-security-policy')).toBeTruthy();
    expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin');
  });

  it('同一 IP 超过每分钟页面阈值返回 429（robots.txt 也在其中）', () => {
    const request = (path: string) => new NextRequest(`http://localhost${path}`, { headers: { 'x-real-ip': '203.0.113.200' } });
    let last = proxy(request('/robots.txt'));
    for (let i = 0; i < 200 && last.status !== 429; i += 1) last = proxy(request('/robots.txt'));
    expect(last.status).toBe(429);
    expect(last.headers.get('retry-after')).toBeTruthy();
  });
});
