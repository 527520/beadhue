// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsentCard } from '@/components/shell/consent-card';
import { ConsentPreferences } from '@/components/pages/consent-preferences';

const { track, clearAnalyticsQueue, setAnalyticsInitialized } = vi.hoisted(() => ({
  track: vi.fn(),
  clearAnalyticsQueue: vi.fn(),
  setAnalyticsInitialized: vi.fn(),
}));
vi.mock('@/lib/analytics/client', () => ({ track, clearAnalyticsQueue, setAnalyticsInitialized }));

/** 同意逻辑（chooseAnalyticsConsent / useAnalyticsPreference）经站点浮卡与隐私页偏好两个入口验证。 */
describe('analytics consent', () => {
  beforeEach(() => {
    document.cookie = 'beadhue_analytics_consent=; Max-Age=0; Path=/';
    track.mockReset();
    clearAnalyticsQueue.mockReset();
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: async (_name: string, run: () => unknown) => run() } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'granted' }), { status: 200 })));
  });

  it('waits for an explicit choice and does not track a refusal', async () => {
    render(<ConsentCard />);
    fireEvent.click(await screen.findByRole('button', { name: '不同意' }));
    await waitFor(() => expect(screen.queryByLabelText('匿名使用统计')).not.toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith('/api/analytics/consent', expect.objectContaining({ body: '{"status":"denied"}' }));
    expect(clearAnalyticsQueue).toHaveBeenCalledOnce();
    expect(track).not.toHaveBeenCalled();
  });

  it('records only the current page view after consent succeeds', async () => {
    window.history.replaceState({}, '', '/community');
    render(<ConsentCard />);
    fireEvent.click(await screen.findByRole('button', { name: '同意统计' }));
    await waitFor(() => expect(track).toHaveBeenCalledWith({
      name: 'page_viewed', properties: { surface: 'community' },
    }));
  });

  it('keeps a failed grant visible and can retry without collecting before confirmation', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<ConsentCard />);
    fireEvent.click(await screen.findByRole('button', { name: '同意统计' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('当前页面不会采集');
    expect(track).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '同意统计' }));
    await waitFor(() => expect(screen.queryByLabelText('匿名使用统计')).not.toBeInTheDocument());
    expect(track).toHaveBeenCalledOnce();
  });

  it('stops immediately on withdrawal, persists the intent on failure, and allows only deletion retry', async () => {
    document.cookie = 'beadhue_analytics_consent=granted; Path=/';
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const view = render(<ConsentPreferences />);
    fireEvent.click(await screen.findByRole('button', { name: '撤回并清除原始数据' }));
    expect(clearAnalyticsQueue).toHaveBeenCalledOnce();
    expect(document.cookie).not.toContain('beadhue_analytics_consent=granted');
    finish(new Response('{}', { status: 503 }));
    expect(await screen.findByRole('alert')).toHaveTextContent('已停止采集');
    expect(screen.queryByRole('button', { name: '同意匿名统计' })).not.toBeInTheDocument();
    view.unmount();
    render(<ConsentPreferences />);
    fireEvent.click(await screen.findByRole('button', { name: '重试清除原始数据' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('已撤回同意，并清除'));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(track).not.toHaveBeenCalled();
  });

  it('shares choices and request guards between preferences and the card', async () => {
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(<><ConsentCard /><ConsentPreferences /></>);
    await screen.findByRole('button', { name: '同意统计' });
    await waitFor(() => expect(screen.getByRole('button', { name: '同意匿名统计' })).toBeEnabled());
    const grant = screen.getByRole('button', { name: '同意匿名统计' });
    fireEvent.click(grant);
    fireEvent.click(grant);
    expect(fetch).toHaveBeenCalledOnce();
    finish(new Response('{}', { status: 200 }));
    await waitFor(() => expect(screen.queryByLabelText('匿名使用统计')).not.toBeInTheDocument());
    expect(screen.getByText('当前状态：已同意')).toBeInTheDocument();
    await waitFor(() => expect(track).toHaveBeenCalledOnce());
  });

  it('never replaces a later withdrawal preference with an earlier grant response', async () => {
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(<ConsentPreferences />);
    await waitFor(() => expect(screen.getByRole('button', { name: '同意匿名统计' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '同意匿名统计' }));
    document.cookie = 'beadhue_analytics_consent=withdrawn; Path=/';
    finish(new Response('{}', { status: 200 }));
    await screen.findByRole('button', { name: '重试清除原始数据' });
    expect(document.cookie).toContain('beadhue_analytics_consent=withdrawn');
    expect(track).not.toHaveBeenCalled();
  });

  it('does not grant analytics when cross-tab serialization is unavailable', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    render(<ConsentPreferences />);
    await waitFor(() => expect(screen.getByRole('button', { name: '同意匿名统计' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '同意匿名统计' }));
    await screen.findByRole('alert');
    expect(fetch).not.toHaveBeenCalled();
    expect(document.cookie).not.toContain('beadhue_analytics_consent=granted');
  });
});
