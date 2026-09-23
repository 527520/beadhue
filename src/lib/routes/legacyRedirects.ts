/**
 * 旧路由永久重定向（D66）：Next 的 redirects 会把查询参数原样带到新地址。
 * next.config.ts 读取这张表；单元测试核对表本身，E2E 核对真实 308 与参数保留。
 */
export const LEGACY_REDIRECTS = [
  { source: '/community', destination: '/' },
  { source: '/designs', destination: '/me' },
  { source: '/community/mine', destination: '/me/public' },
  { source: '/account', destination: '/me/settings' },
  { source: '/create', destination: '/app' },
] as const;

export function legacyRedirects(): Array<{ source: string; destination: string; permanent: true }> {
  return LEGACY_REDIRECTS.map((rule) => ({ ...rule, permanent: true }));
}

/** 给定旧地址（含查询参数），返回重定向后的地址；不是旧路由返回 null。 */
export function resolveLegacyRedirect(pathAndQuery: string): string | null {
  const url = new URL(pathAndQuery, 'https://beadhue.invalid');
  const rule = LEGACY_REDIRECTS.find((item) => item.source === url.pathname.replace(/\/$/u, '') || (item.source === '/community' && url.pathname === '/community/'));
  return rule ? `${rule.destination}${url.search}` : null;
}
