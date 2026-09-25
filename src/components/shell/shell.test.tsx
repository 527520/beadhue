// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { zhCN } from '@/messages/zh-CN';
import { resetAuthStatusCache } from '@/components/account/useAuthStatus';
import { ToastProvider } from '@/components/ui/toast';
import { LoginDialogProvider, useRequireLogin } from './login-dialog';
import { LoginForm } from './login-form';
import { clearRecentSearches, rememberSearch, RECENT_SEARCHES_KEY } from './recent-searches';
import { SiteShell } from './site-shell';
import { SkipLink } from './skip-link';
import { resetSuggestCache } from './use-search-suggest';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/' }));

const t = zhCN.shell;
type Handler = (url: string, init?: RequestInit) => Response | undefined;
function stubFetch(handler: Handler) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init) ?? new Response(null, { status: 404 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const guest: Handler = (url) => (url === '/api/auth/me' ? new Response(null, { status: 401 }) : undefined);
const user: Handler = (url) => (url === '/api/auth/me' ? Response.json({ email: 'lu@example.com', username: '小鹿拼豆', publicAuthorId: 'a1', role: 'admin' }) : undefined);

function renderShell(props: Partial<Parameters<typeof SiteShell>[0]> = {}) {
  return render(
    <ToastProvider>
      <LoginDialogProvider>
        <SiteShell {...props}>
          <p>页面内容</p>
        </SiteShell>
      </LoginDialogProvider>
    </ToastProvider>,
  );
}

beforeEach(() => {
  resetAuthStatusCache();
  resetSuggestCache();
  window.localStorage.removeItem(RECENT_SEARCHES_KEY);
  Object.values(router).forEach((fn) => fn.mockReset());
});
afterEach(() => vi.unstubAllGlobals());

describe('站点外壳', () => {
  it('顶栏与底栏按页面高亮当前导航，主区域是唯一的 #main', async () => {
    stubFetch(guest);
    renderShell({ nav: 'me' });
    const navs = screen.getAllByRole('navigation', { name: t.mainNav, hidden: true });
    expect(navs).toHaveLength(2);
    for (const nav of navs) expect(within(nav).getByRole('link', { name: t.me, hidden: true })).toHaveAttribute('aria-current', 'page');
    expect(within(navs[1]).getByRole('link', { name: t.create, hidden: true })).toHaveAttribute('href', '/app');
    expect(document.querySelectorAll('main#main')).toHaveLength(1);
    expect(screen.getByText('页面内容').closest('main')).toBeTruthy();
    await screen.findAllByRole('button', { name: t.login, hidden: true });
  });

  it('「上传图片」按页面声明降为描边或隐藏；二级页不渲染底栏与页脚', async () => {
    stubFetch(guest);
    const { unmount } = renderShell({ topbarCta: 'secondary' });
    expect(screen.getByRole('link', { name: t.upload, hidden: true })).toHaveAttribute('href', '/app');
    unmount();
    renderShell({ topbarCta: false, tabbar: false, footer: false });
    expect(screen.queryByRole('link', { name: t.upload, hidden: true })).toBeNull();
    expect(screen.getAllByRole('navigation', { name: t.mainNav, hidden: true })).toHaveLength(1);
    expect(screen.queryByRole('contentinfo', { hidden: true })).toBeNull();
    await screen.findAllByRole('button', { name: t.login, hidden: true });
  });

  it('离开拦截：外壳里的站内链接交给页面（工作台先保存再走）', async () => {
    stubFetch(guest);
    const onNavigate = vi.fn();
    renderShell({ onNavigate });
    fireEvent.click(screen.getAllByRole('link', { name: t.discover, hidden: true })[0]);
    expect(onNavigate).toHaveBeenCalledWith('/');
    await screen.findAllByRole('button', { name: t.login, hidden: true });
  });

  it('已登录显示头像菜单：原图空间、我的、色板、设置、帮助、隐私、管理后台与退出', async () => {
    stubFetch((url) => user(url) ?? (url === '/api/originals/usage' ? Response.json({ bytes: 0.5 * 1024 ** 3, quotaBytes: 2 * 1024 ** 3 }) : undefined));
    renderShell();
    const trigger = await screen.findByRole('button', { name: t.accountMenu, hidden: true });
    fireEvent.click(trigger);
    const menu = await screen.findByRole('menu');
    for (const name of [t.account.home, t.account.designs, t.account.palettes, t.account.settings, t.account.help, t.account.privacy, t.account.admin]) {
      expect(within(menu).getAllByRole('menuitem', { name }).length).toBeGreaterThan(0);
    }
    expect(within(menu).getByRole('menuitem', { name: t.account.settings })).toHaveAttribute('href', '/me/settings');
    expect(within(menu).getByText('小鹿拼豆')).toBeTruthy();
    expect(await within(menu).findByText(t.account.storageUsage('0.5', '2'))).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: t.account.logout })).toBeTruthy();
  });

  it('桌面搜索：聚焦出最近搜索与大家在搜，输入后给匹配的图纸与作者，回车进入 /?q= 并记入最近搜索', async () => {
    rememberSearch('樱花杯垫');
    const fetchMock = stubFetch((url) => guest(url) ?? (url.startsWith('/api/community/search/suggest?q=')
      ? Response.json(url.endsWith('q=')
        ? { q: '', tags: [{ id: 't', name: '星星人', count: 3 }], works: [], authors: [] }
        : { q: '猫', tags: [], works: [{ id: 'w1', revisionId: 'r1', title: '橘猫团子', width: 32, height: 32, thumbnailUrl: '/t.png' }], authors: [{ publicAuthorId: 'p1', authorType: 'user', displayName: '猫猫手作', workCount: 2 }] })
      : undefined));
    renderShell();
    const input = screen.getAllByRole('searchbox', { name: t.search.label, hidden: true })[0];
    fireEvent.focus(input);
    const panel = await screen.findByRole('region', { name: t.search.panel, hidden: true });
    expect(within(panel).getByRole('link', { name: '樱花杯垫', hidden: true })).toHaveAttribute('href', '/?q=%E6%A8%B1%E8%8A%B1%E6%9D%AF%E5%9E%AB');
    expect(await within(panel).findByRole('link', { name: '星星人', hidden: true })).toBeTruthy();
    fireEvent.change(input, { target: { value: '猫' } });
    expect(await within(panel).findByRole('link', { name: /橘猫团子/, hidden: true }, { timeout: 2000 })).toHaveAttribute('href', '/community/w1');
    expect(within(panel).getByRole('link', { name: /猫猫手作/, hidden: true })).toHaveAttribute('href', '/u/p1');
    fireEvent.submit(input.closest('form')!);
    expect(router.push).toHaveBeenCalledWith('/?q=%E7%8C%AB');
    expect(JSON.parse(window.localStorage.getItem(RECENT_SEARCHES_KEY)!)).toEqual(['猫', '樱花杯垫']);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('suggest')).length).toBe(2);
    act(() => clearRecentSearches());
  });

  it('手机：点放大镜进入全屏搜索页（页面内容隐藏，底栏保留），返回后恢复', async () => {
    stubFetch(guest);
    renderShell({ mobileTop: 'discover' });
    fireEvent.click(screen.getByRole('button', { name: t.search.open, hidden: true }));
    expect(screen.getByRole('region', { name: t.search.panel, hidden: true })).toBeTruthy();
    expect(screen.getByText('页面内容').parentElement).toHaveClass('max-md:hidden');
    fireEvent.click(screen.getByRole('button', { name: t.back, hidden: true }));
    expect(screen.queryByRole('region', { name: t.search.panel, hidden: true })).toBeNull();
    // 游客不显示通知铃铛，发现页手机顶栏的铃铛位是「登录」。
    expect(await screen.findAllByRole('button', { name: t.login, hidden: true })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: t.notifications.label, hidden: true })).toBeNull();
  });

  it('游客点「登录」打开登录弹窗；统计同意浮卡两个按钮同为次按钮', async () => {
    stubFetch(guest);
    renderShell();
    const login = (await screen.findAllByRole('button', { name: t.login, hidden: true }))[0];
    fireEvent.click(login);
    expect(await screen.findByRole('dialog', { name: t.loginDialog.title })).toBeTruthy();
    const consent = screen.getByRole('complementary', { name: t.consent.label, hidden: true });
    expect(within(consent).getByRole('button', { name: t.consent.reject, hidden: true })).toBeTruthy();
    expect(within(consent).getByRole('button', { name: t.consent.grant, hidden: true })).toBeTruthy();
  });

  it('点「注册」关掉登录弹窗，链接仍去注册页', async () => {
    stubFetch(guest);
    renderShell();
    fireEvent.click((await screen.findAllByRole('button', { name: t.login, hidden: true }))[0]);
    const dialog = await screen.findByRole('dialog', { name: t.loginDialog.title });
    const register = within(dialog).getByRole('link', { name: t.loginDialog.register });
    expect(register).toHaveAttribute('href', expect.stringContaining('/register'));
    fireEvent.click(register);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: t.loginDialog.title })).toBeNull());
  });
});

describe('登录表单与需要登录的操作', () => {
  it('错误挂在字段下：邮箱格式、空密码、账号密码不对', async () => {
    const fetchMock = stubFetch(() => Response.json({ error: { code: 'UNAUTHORIZED', message: 'x' } }, { status: 401 }));
    const onSuccess = vi.fn();
    render(<LoginForm onSuccess={onSuccess} registerHref="/register" forgotHref="/forgot-password" />);
    fireEvent.click(screen.getByRole('button', { name: t.loginDialog.submit }));
    expect(await screen.findByText(t.loginDialog.emailInvalid)).toBeTruthy();
    expect(screen.getByText(t.loginDialog.passwordRequired)).toBeTruthy();
    expect(screen.getByLabelText(t.loginDialog.email)).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(t.loginDialog.email), { target: { value: 'lu@example.com' } });
    fireEvent.change(screen.getByLabelText(t.loginDialog.password), { target: { value: 'wrong-pass' } });
    fireEvent.click(screen.getByRole('button', { name: t.loginDialog.submit }));
    expect(await screen.findByRole('alert')).toHaveTextContent(zhCN.auth.invalidCredentials);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: t.loginDialog.forgot })).toHaveAttribute('href', '/forgot-password');
  });

  it('未登录时先弹登录，成功后留在原页面继续原操作', async () => {
    let signedIn = false;
    stubFetch((url) => {
      if (url === '/api/auth/me') return signedIn ? Response.json({ email: 'lu@example.com' }) : new Response(null, { status: 401 });
      if (url === '/api/auth/login') { signedIn = true; return Response.json({ email: 'lu@example.com', emailVerified: true }); }
      return undefined;
    });
    const action = vi.fn();
    function Like() {
      const requireLogin = useRequireLogin();
      return <button type="button" onClick={() => requireLogin(action)}>喜欢</button>;
    }
    render(<ToastProvider><LoginDialogProvider><Like /></LoginDialogProvider></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: '喜欢' }));
    const dialog = await screen.findByRole('dialog', { name: t.loginDialog.title });
    fireEvent.change(within(dialog).getByLabelText(t.loginDialog.email), { target: { value: 'lu@example.com' } });
    fireEvent.change(within(dialog).getByLabelText(t.loginDialog.password), { target: { value: 'E2e-pass-123!' } });
    fireEvent.click(within(dialog).getByRole('button', { name: t.loginDialog.submit }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(router.push).not.toHaveBeenCalled();
  });

  it('跳到主内容：聚焦主区域，保留 #main 片段链接', () => {
    render(<><SkipLink /><main id="main">主内容</main></>);
    const link = screen.getByRole('link', { name: t.skipToMain });
    expect(link).toHaveAttribute('href', '#main');
    fireEvent.click(link);
    expect(document.activeElement).toBe(screen.getByText('主内容'));
  });
});
