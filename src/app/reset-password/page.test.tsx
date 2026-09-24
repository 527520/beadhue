// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import ResetPasswordPage from './page';
import { zhCN } from '@/messages/zh-CN';
vi.mock('@/components/shell/site-shell', () => ({ SiteShell: ({ children }: { children: React.ReactNode }) => children }));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function fill(password: string, confirm: string): void {
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: confirm } });
}

/** 打开页面：预检令牌通过后才出表单。 */
async function openForm(): Promise<void> {
  render(<ResetPasswordPage />);
  await screen.findByRole('button', { name: zhCN.authPages.resetSubmit });
}

describe('reset-password 页', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    // 页面直接读取 window.location.search（dev 下 useSearchParams 可能挂起）
    window.history.pushState({}, '', '/reset-password?token=reset-token');
  });

  afterEach(() => {
    window.history.pushState({}, '', '/reset-password');
  });

  it('打开时预检令牌（不消耗），通过后显示表单', async () => {
    render(<ResetPasswordPage />);
    expect(screen.getByRole('status').textContent).toContain(zhCN.authPages.resetChecking);
    await screen.findByRole('button', { name: zhCN.authPages.resetSubmit });
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/reset-password?token=reset-token', expect.objectContaining({ cache: 'no-store' }));
  });

  it('令牌无效或已过期：不出表单，直接给「重新获取重置邮件」', async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'VALIDATION', message: zhCN.auth.linkInvalid } }), { status: 400 }));
    render(<ResetPasswordPage />);
    expect(await screen.findByRole('link', { name: zhCN.authPages.resetAgain })).toHaveAttribute('href', '/forgot-password');
    expect(screen.getByRole('alert').textContent).toContain(zhCN.authPages.resetInvalid);
    expect(screen.queryByLabelText('密码')).toBeNull();
  });

  it('密码不一致本地拦截', async () => {
    await openForm();
    fill('12345678', '87654321');
    fireEvent.click(screen.getByRole('button', { name: zhCN.authPages.resetSubmit }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(zhCN.authPages.passwordMismatch));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('密码过短本地拦截（8–72 边界）', async () => {
    await openForm();
    fill('short', 'short');
    fireEvent.click(screen.getByRole('button', { name: zhCN.authPages.resetSubmit }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('成功 → 提示旧会话失效并携带 token', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await openForm();
    fill('12345678', '12345678');
    fireEvent.click(screen.getByRole('button', { name: zhCN.authPages.resetSubmit }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain(zhCN.authPages.resetSuccess));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/reset-password',
      expect.objectContaining({ body: JSON.stringify({ token: 'reset-token', password: '12345678' }) }),
    );
  });

  it('提交时令牌已失效 → 统一文案（spec E30/E32）', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'VALIDATION', message: zhCN.auth.linkInvalid } }), { status: 400 }));
    await openForm();
    fill('12345678', '12345678');
    fireEvent.click(screen.getByRole('button', { name: zhCN.authPages.resetSubmit }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(zhCN.auth.linkInvalid));
  });
});

vi.mock('@/components/account/useAuthStatus', () => ({ useAuthStatus: () => ({ kind: 'guest' }) }));
