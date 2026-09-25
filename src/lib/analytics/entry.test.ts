// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fakeClient = {
  track: vi.fn(),
  clear: vi.fn(),
  flush: vi.fn(),
  flushBeacon: vi.fn(),
};

vi.mock('./clientQueue', () => ({
  createAnalyticsClient: vi.fn(() => fakeClient),
}));

type ClientModule = typeof import('./client');

async function freshModule(): Promise<ClientModule> {
  vi.resetModules();
  return import('./client');
}

function grantConsent(): void {
  document.cookie = 'beadhue_analytics_consent=granted; path=/';
}

function stubBrowserApis(): void {
  Object.defineProperty(navigator, 'locks', { value: { request: vi.fn() }, configurable: true });
  Object.defineProperty(navigator, 'sendBeacon', { value: vi.fn(() => true), configurable: true });
}

beforeEach(() => {
  document.cookie = 'beadhue_analytics_consent=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  fakeClient.track.mockClear();
  fakeClient.clear.mockClear();
  fakeClient.flushBeacon.mockClear();
  stubBrowserApis();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('analytics client 入口（同意闸门 + 早期队列 + 懒加载）', () => {
  it('未初始化或未同意时不发任何事件', async () => {
    const client = await freshModule();
    client.track({ name: 'page_viewed' } as never);
    client.setAnalyticsInitialized(true);
    client.track({ name: 'page_viewed' } as never);
    expect(fakeClient.track).not.toHaveBeenCalled();
  });

  it('同意后先入早期队列，动态加载后按原顺序补记', async () => {
    const client = await freshModule();
    grantConsent();
    client.setAnalyticsInitialized(true);
    const event = { name: 'page_viewed', properties: { surface: 'home' } } as const;
    client.track(event);
    client.track(event);

    await vi.waitFor(() => expect(fakeClient.track).toHaveBeenCalledTimes(2));

    client.track(event);
    expect(fakeClient.track).toHaveBeenCalledTimes(3);
  });

  it('utm 参数进入补记上下文，path 带完整查询串', async () => {
    const client = await freshModule();
    window.history.replaceState(null, '', '/community?utm_source=weibo&utm_campaign=launch&secret=no');
    grantConsent();
    client.setAnalyticsInitialized(true);
    client.track({ name: 'page_viewed' } as never);
    await vi.waitFor(() => expect(fakeClient.track).toHaveBeenCalled());
    const { createAnalyticsClient } = await import('./clientQueue');
    const options = vi.mocked(createAnalyticsClient).mock.calls[0][0];
    expect(options.context()).toMatchObject({ path: '/community?utm_source=weibo&utm_campaign=launch&secret=no' });
    // 只认 utm_* 白名单。
    expect(JSON.stringify(options.context())).not.toContain('"secret"');
    expect(options.context().utm).toEqual({ source: 'weibo', campaign: 'launch' });
  });

  it('加载失败置空 loading，可重试并补记', async () => {
    const queue = await import('./clientQueue');
    vi.mocked(queue.createAnalyticsClient).mockClear();
    vi.mocked(queue.createAnalyticsClient).mockImplementationOnce(() => {
      throw new Error('network down');
    });
    const client = await freshModule();
    grantConsent();
    client.setAnalyticsInitialized(true);
    client.track({ name: 'page_viewed' } as never);
    await vi.waitFor(() => expect(vi.mocked(queue.createAnalyticsClient).mock.calls.length).toBeGreaterThanOrEqual(1));

    const before = vi.mocked(queue.createAnalyticsClient).mock.calls.length;
    vi.mocked(queue.createAnalyticsClient).mockImplementationOnce(() => fakeClient);
    client.track({ name: 'page_viewed' } as never);
    await vi.waitFor(() => expect(vi.mocked(queue.createAnalyticsClient).mock.calls.length).toBeGreaterThan(before));
    expect(fakeClient.track.mock.calls.length).toBeGreaterThan(0);
  });

  it('clearAnalyticsQueue 清空客户端与早期队列', async () => {
    const client = await freshModule();
    grantConsent();
    client.setAnalyticsInitialized(true);
    client.track({ name: 'page_viewed' } as never);
    await vi.waitFor(() => expect(fakeClient.track).toHaveBeenCalled());
    client.clearAnalyticsQueue();
    expect(fakeClient.clear).toHaveBeenCalled();
  });

  it('页面隐藏时 flushBeacon', async () => {
    const client = await freshModule();
    grantConsent();
    client.setAnalyticsInitialized(true);
    client.track({ name: 'page_viewed' } as never);
    await vi.waitFor(() => expect(fakeClient.track).toHaveBeenCalled());
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(fakeClient.flushBeacon).toHaveBeenCalled();
  });
});
