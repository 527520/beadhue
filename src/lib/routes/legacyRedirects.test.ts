import { describe, expect, it } from 'vitest';
import nextConfig from '../../../next.config';
import { LEGACY_REDIRECTS, legacyRedirects, resolveLegacyRedirect } from './legacyRedirects';

describe('旧路由永久重定向（D66）', () => {
  it('五条旧路由都是 308 永久重定向，next.config 使用同一张表', async () => {
    expect(legacyRedirects()).toEqual([
      { source: '/community', destination: '/', permanent: true },
      { source: '/designs', destination: '/me', permanent: true },
      { source: '/community/mine', destination: '/me/public', permanent: true },
      { source: '/account', destination: '/me/settings', permanent: true },
      { source: '/create', destination: '/app', permanent: true },
    ]);
    expect(await nextConfig.redirects?.()).toEqual(legacyRedirects());
  });

  it('保留查询参数，不误伤作品详情、投稿与规则页', () => {
    expect(resolveLegacyRedirect('/community?tag=%E7%8C%AB&sort=featured')).toBe('/?tag=%E7%8C%AB&sort=featured');
    expect(resolveLegacyRedirect('/designs')).toBe('/me');
    expect(resolveLegacyRedirect('/community/mine')).toBe('/me/public');
    expect(resolveLegacyRedirect('/account?tab=security')).toBe('/me/settings?tab=security');
    expect(resolveLegacyRedirect('/create?pick=cat')).toBe('/app?pick=cat');
    for (const path of ['/community/5d7a4ccc-5aa1-405c-a6c5-3471e3b4f0d6', '/community/submit?designId=x', '/community/rules', '/me', '/app']) {
      expect(resolveLegacyRedirect(path)).toBeNull();
    }
  });

  it('源路径不带参数占位（Next 会原样透传查询参数）', () => {
    for (const rule of LEGACY_REDIRECTS) expect(rule.source).not.toMatch(/[:*(]/u);
  });
});
