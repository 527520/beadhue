import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

describe('Next.js configuration', () => {
  it('allows the loopback hostname used by browser tests to load development chunks', () => {
    expect(nextConfig.allowedDevOrigins).toContain('127.0.0.1');
  });

  it('keeps generated worker chunks inside the cross-origin isolated agent cluster', async () => {
    const rules = await nextConfig.headers?.();
    const staticRule = rules?.find((rule) => rule.source === '/_next/static/:path*');

    expect(staticRule?.headers).toEqual(expect.arrayContaining([
      { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
      { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
    ]));
  });

  it('allows WeChat to load public fonts without adding CORS to other routes', async () => {
    const rules = await nextConfig.headers?.();
    const corsRules = rules?.filter((rule) =>
      rule.headers.some((header) => header.key.toLowerCase() === 'access-control-allow-origin'),
    );

    expect(corsRules).toHaveLength(1);
    expect(corsRules?.[0].source).toBe('/fonts/:path*');
    expect(corsRules?.[0].headers).toContainEqual({ key: 'Access-Control-Allow-Origin', value: '*' });
  });
});
