// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MeProvider, type MeViewer } from '../me-context';
import { SettingsView } from './settings-view';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation, usePathname: () => '/me/settings' }));

const viewer: MeViewer = { name: '小鹿', email: 'lu@example.com', username: '小鹿', avatarId: 'a', avatarColor: null, publicAuthorId: 'a', verified: true, passwordChangedAt: null };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let calls: Array<{ url: string; init?: RequestInit }>;
let routes: Record<string, (init?: RequestInit) => Response>;

beforeEach(() => {
  calls = [];
  routes = {
    'GET /api/me/sessions': () => json({ items: [{ current: true, createdAt: new Date().toISOString() }, { current: false, createdAt: new Date(Date.now() - 86_400_000).toISOString() }], count: 2 }),
    'POST /api/me/sessions/revoke-others': () => json({ revoked: 1 }),
    'GET /api/originals/usage': () => json({ bytes: 1.8 * 1024 ** 3, images: 3, quotaBytes: 2 * 1024 ** 3 }),
    'PATCH /api/auth/account': () => new Response(null, { status: 204 }),
    'POST /api/auth/change-password': () => json({ error: { code: 'VALIDATION', message: '当前密码不正确。', field: 'currentPassword' } }, 400),
    'DELETE /api/auth/account': () => new Response(null, { status: 204 }),
  };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const handler = routes[`${init?.method ?? 'GET'} ${url}`];
    return handler ? handler(init) : json({}, 404);
  }));
});
afterEach(() => vi.unstubAllGlobals());

const renderView = (value: MeViewer | null = viewer) => render(
  <MeProvider value={{ viewer: value, stats: { designs: 6, publicWorks: 4, likes: 10 }, designCount: null, setDesignCount: () => undefined, refreshStats: () => undefined }}>
    <SettingsView />
  </MeProvider>,
);

describe('账号设置', () => {
  it('一个 h1、五个分区；原图空间超 80% 显示警告', async () => {
    renderView();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    for (const name of ['个人资料', '登录与安全', '原图空间', '隐私', '危险区域']) expect(screen.getByRole('heading', { level: 2, name })).toBeTruthy();
    expect(await screen.findByText('空间快满了。用满后，新上传的原图只保存在这台设备上。')).toBeVisible();
    expect(screen.getByRole('progressbar', { name: '原图空间用量' })).toHaveAttribute('aria-valuenow', '90');
  });

  it('用户名未修改时保存禁用；保存调用现有接口并刷新页面', async () => {
    const user = userEvent.setup();
    renderView();
    const save = screen.getByRole('button', { name: '保存' });
    expect(save).toBeDisabled();
    await user.clear(screen.getByLabelText('用户名'));
    await user.type(screen.getByLabelText('用户名'), '新名字');
    await user.click(save);
    await waitFor(() => expect(calls.some((call) => call.init?.method === 'PATCH' && call.init.body === JSON.stringify({ username: '新名字' }))).toBe(true));
    expect(navigation.refresh).toHaveBeenCalled();
  });

  it('更换头像颜色：选一颗豆色后保存可用，只提交颜色', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('button', { name: '更换颜色' }));
    const blue = await screen.findByRole('button', { name: '晴空蓝' });
    expect(blue).toHaveAttribute('aria-pressed', 'false');
    await user.click(blue);
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(calls.some((call) => call.init?.method === 'PATCH' && call.init.body === JSON.stringify({ avatarColor: '#3F7FD9' }))).toBe(true));
  });

  it('密码行写上次修改时间；登录设备列出「系统 · 浏览器」', async () => {
    const user = userEvent.setup();
    routes['GET /api/me/sessions'] = () => json({ items: [{ current: true, createdAt: new Date().toISOString(), label: 'macOS · Chrome' }, { current: false, createdAt: new Date().toISOString(), label: null }], count: 2 });
    renderView({ ...viewer, passwordChangedAt: new Date(Date.now() - 3 * 86_400_000).toISOString() });
    expect(await screen.findByText('上次修改于 3 天前')).toBeVisible();
    await user.click(screen.getByText('查看设备'));
    expect(screen.getByText('macOS · Chrome')).toBeVisible();
    expect(screen.getByText('其他设备')).toBeVisible();
  });

  it('修改密码：客户端校验两次不一致，服务端的当前密码错误挂在字段下', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('button', { name: '修改密码' }));
    const dialog = await screen.findByRole('dialog', { name: '修改密码' });
    await user.type(within(dialog).getByLabelText('当前密码'), 'old-password');
    await user.type(within(dialog).getByLabelText('新密码'), 'newpassword1');
    await user.type(within(dialog).getByLabelText('确认新密码'), 'newpassword2');
    await user.click(within(dialog).getByRole('button', { name: '修改密码' }));
    expect(await within(dialog).findByText('两次输入的新密码不一致')).toBeVisible();
    await user.clear(within(dialog).getByLabelText('确认新密码'));
    await user.type(within(dialog).getByLabelText('确认新密码'), 'newpassword1');
    await user.click(within(dialog).getByRole('button', { name: '修改密码' }));
    expect(await within(dialog).findByText('当前密码不正确。')).toBeVisible();
  });

  it('退出其他设备：确认后调用接口', async () => {
    const user = userEvent.setup();
    renderView();
    expect(await screen.findByText('当前在 2 台设备上登录')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '退出其他设备' }));
    await user.click(within(await screen.findByRole('dialog', { name: '退出其他设备？' })).getByRole('button', { name: '退出其他设备' }));
    await waitFor(() => expect(calls.some((call) => call.url === '/api/me/sessions/revoke-others')).toBe(true));
  });

  it('注销账号：输入用户名且填写密码才可提交，仍走需要密码的现有接口', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('button', { name: '注销账号' }));
    const dialog = await screen.findByRole('dialog', { name: '注销账号？' });
    expect(dialog).toHaveTextContent('公开作品和引用记录会保留');
    const confirm = within(dialog).getByRole('button', { name: '注销账号' });
    await user.type(within(dialog).getByLabelText('输入用户名「小鹿」以确认'), '小鹿');
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText('当前密码'), 'secret');
    await user.click(confirm);
    await waitFor(() => expect(calls.find((call) => call.init?.method === 'DELETE')?.init?.body).toBe(JSON.stringify({ password: 'secret' })));
    expect(navigation.push).toHaveBeenCalledWith('/');
  });

  it('游客：登录提示卡与隐私开关', () => {
    renderView(null);
    expect(screen.getByText('登录后管理账号')).toBeVisible();
    expect(screen.getByRole('switch', { name: '匿名使用统计' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: '设置分区' })).toBeNull();
  });
});
