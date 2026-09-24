// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { zhCN } from '@/messages/zh-CN';
import { emptyArtPattern } from '@/lib/render/beads';
import { resetAuthStatusCache } from '@/components/account/useAuthStatus';
import { LoginDialogProvider } from '@/components/shell/login-dialog';
import { SiteShell, type SiteShellProps } from '@/components/shell/site-shell';
import { ToastProvider } from '@/components/ui/toast';
import { badgeText, knownNotifications, notificationCopy, notificationHref, relativeTime, type NotificationItem } from './notification-model';
import { resetUnreadStore, UNREAD_FRESH_MS } from './use-unread-count';

const nav = vi.hoisted(() => ({ pathname: '/', router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => nav.router, usePathname: () => nav.pathname }));

const t = zhCN.notifications;
const bell = zhCN.shell.notifications;

function item(id: string, type: NotificationItem['type'], extra: Partial<NotificationItem['payload']> = {}, read = false): NotificationItem {
  return { id, type, read, readAt: read ? '2026-09-24T01:00:00.000Z' : null, createdAt: new Date(Date.now() - 3 * 3600_000).toISOString(), payload: { workId: `w-${id}`, title: `作品${id}`, ...extra } };
}

interface Server {
  unread: number;
  pages: Record<string, { items: NotificationItem[]; nextCursor: string | null }>;
  listFails?: boolean;
  calls: Array<{ url: string; method: string; body: unknown }>;
}

function stubServer(server: Server, signedIn = true) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    server.calls.push({ url, method, body });
    if (url === '/api/auth/me') return signedIn ? Response.json({ email: 'lu@example.com', username: '小鹿', publicAuthorId: 'a1', role: 'user' }) : new Response(null, { status: 401 });
    if (url === '/api/me/notifications/unread-count') return Response.json({ unreadCount: server.unread });
    if (url.startsWith('/api/me/notifications/read')) {
      const ids = (body as { ids?: string[] }).ids;
      for (const page of Object.values(server.pages)) for (const entry of page.items) if (!ids || ids.includes(entry.id)) entry.read = true;
      server.unread = ids ? Math.max(0, server.unread - ids.length) : 0;
      return Response.json({ updated: ids?.length ?? 0, unreadCount: server.unread });
    }
    if (url.startsWith('/api/me/notifications')) {
      if (server.listFails) return Response.json({ error: { code: 'UNKNOWN', message: 'x' } }, { status: 500 });
      const cursor = new URL(url, 'http://local').searchParams.get('cursor') ?? '';
      const page = server.pages[cursor];
      return Response.json({ items: page.items.map((entry) => ({ ...entry })), nextCursor: page.nextCursor, unreadCount: server.unread });
    }
    return new Response(null, { status: 404 });
  }));
}

function renderShell(props: Partial<SiteShellProps> = {}) {
  const tree = (extra: Partial<SiteShellProps> = {}) => (
    <ToastProvider>
      <LoginDialogProvider>
        <SiteShell {...props} {...extra}><p>页面内容</p></SiteShell>
      </LoginDialogProvider>
    </ToastProvider>
  );
  const view = render(tree());
  return { ...view, rerender: (extra: Partial<SiteShellProps> = {}) => view.rerender(tree(extra)) };
}

const unreadCountCalls = (server: Server) => server.calls.filter((call) => call.url === '/api/me/notifications/unread-count').length;
const readCalls = (server: Server) => server.calls.filter((call) => call.url === '/api/me/notifications/read');

async function openBell(name: RegExp | string = /通知/) {
  fireEvent.click(await screen.findByRole('button', { name, hidden: true }));
  return screen.findByRole('dialog', { name: t.title });
}

beforeEach(() => {
  resetAuthStatusCache();
  resetUnreadStore();
  nav.pathname = '/';
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('通知模型', () => {
  it('跳转目标：通过 / 恢复到详情，新评论到那条评论，未通过 / 下架到我的公开作品', () => {
    expect(notificationHref(item('1', 'revision_approved'))).toBe('/community/w-1');
    expect(notificationHref(item('2', 'work_restored'))).toBe('/community/w-2');
    expect(notificationHref(item('3', 'work_commented', { commentId: 'c9' }))).toBe('/community/w-3#comment-c9');
    expect(notificationHref(item('4', 'work_commented'))).toBe('/community/w-4');
    expect(notificationHref(item('5', 'revision_rejected'))).toBe('/me/public');
    expect(notificationHref(item('6', 'work_removed'))).toBe('/me/public');
  });

  it('文案：未通过附原因，标题缺省写「未命名作品」；不认识的类型被过滤', () => {
    expect(notificationCopy(item('1', 'revision_rejected', { title: '像素奶茶', reason: '标题含联系方式' }))).toEqual({ text: t.rejected('像素奶茶'), detail: t.rejectedReason('标题含联系方式') });
    expect(notificationCopy(item('2', 'work_removed', { title: ' ' })).text).toBe(t.removed(t.untitled));
    expect(notificationCopy(item('3', 'revision_rejected')).detail).toBeNull();
    expect(knownNotifications([item('1', 'work_commented'), { ...item('2', 'work_commented'), type: 'future_type' as never }]).map((entry) => entry.id)).toEqual(['1']);
  });

  it('相对时间与徽标数字', () => {
    const now = Date.parse('2026-09-24T12:00:00Z');
    expect(relativeTime('2026-09-24T11:59:40Z', now)).toBe(t.justNow);
    expect(relativeTime('2026-09-24T11:45:00Z', now)).toBe(t.minutesAgo(15));
    expect(relativeTime('2026-09-24T09:00:00Z', now)).toBe(t.hoursAgo(3));
    expect(relativeTime('2026-09-21T12:00:00Z', now)).toBe(t.daysAgo(3));
    expect(relativeTime('2026-07-01T12:00:00Z', now)).toBe('2026-07-01');
    expect(relativeTime('坏值', now)).toBe('');
    expect([badgeText(3), badgeText(99), badgeText(120)]).toEqual(['3', '99', '99+']);
    const art = emptyArtPattern('notifications');
    expect([art.width, art.height]).toEqual([9, 9]);
    expect(art.cells.some((cell) => cell.hex)).toBe(true);
  });
});

describe('通知铃铛', () => {
  it('游客不显示铃铛；发现页手机顶栏的铃铛位是「登录」', async () => {
    stubServer({ unread: 0, pages: {}, calls: [] }, false);
    renderShell({ mobileTop: 'discover' });
    expect(await screen.findAllByRole('button', { name: zhCN.shell.login, hidden: true })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /通知/, hidden: true })).toBeNull();
  });

  it('未读数：深墨小胶囊显示数字，超过 99 写 99+；两个顶栏的铃铛只发一次请求', async () => {
    const server: Server = { unread: 120, pages: {}, calls: [] };
    stubServer(server);
    renderShell({ mobileTop: 'discover' });
    const bells = await screen.findAllByRole('button', { name: bell.unread(120), hidden: true });
    expect(bells).toHaveLength(2);
    const badge = bells[0].querySelector('[data-slot="unread-badge"]')!;
    expect(badge).toHaveTextContent('99+');
    expect(badge.className).toMatch(/bg-ink/);
    expect(badge.className).not.toMatch(/accent/);
    expect(unreadCountCalls(server)).toBe(1);
  });

  it('换页与窗口重新聚焦时刷新未读数（短时间内的重复触发合并）', async () => {
    const server: Server = { unread: 1, pages: {}, calls: [] };
    stubServer(server);
    const view = renderShell();
    await screen.findByRole('button', { name: bell.unread(1), hidden: true });
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(unreadCountCalls(server)).toBe(1);
    const start = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => start + UNREAD_FRESH_MS + 1000);
    server.unread = 2;
    act(() => { window.dispatchEvent(new Event('focus')); });
    await screen.findByRole('button', { name: bell.unread(2), hidden: true });
    vi.spyOn(Date, 'now').mockImplementation(() => start + 2 * UNREAD_FRESH_MS + 2000);
    server.unread = 0;
    nav.pathname = '/me';
    view.rerender({ nav: 'me' });
    await screen.findByRole('button', { name: bell.label, hidden: true });
    expect(unreadCountCalls(server)).toBe(3);
  });

  it('打开：列出各类通知，未读项露出即标记已读（徽标随之更新，本次打开仍保留未读圆点）', async () => {
    const server: Server = {
      unread: 2,
      pages: { '': { items: [item('1', 'revision_approved', { title: '橘猫团子' }), item('2', 'revision_rejected', { title: '像素奶茶', reason: '标题含联系方式' }), item('3', 'work_commented', { commentId: 'c1' }, true)], nextCursor: null } },
      calls: [],
    };
    stubServer(server);
    renderShell();
    const dialog = await openBell(bell.unread(2));
    const links = await within(dialog).findAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/community/w-1', '/me/public', '/community/w-3#comment-c1']);
    expect(links[0]).toHaveTextContent(t.approved('橘猫团子'));
    expect(links[1]).toHaveTextContent(t.rejectedReason('标题含联系方式'));
    expect(links[0]).toHaveTextContent(t.unreadMark);
    expect(links[0].querySelector('time')).toHaveTextContent(t.hoursAgo(3));
    await waitFor(() => expect(readCalls(server)).toHaveLength(1));
    expect(readCalls(server)[0].body).toEqual({ ids: ['1', '2'] });
    expect(await screen.findByRole('button', { name: bell.label, hidden: true })).toBeTruthy();
    expect(dialog.querySelectorAll('[data-slot="unread-dot"]')).toHaveLength(2);
  });

  it('只标记真正露出的条目（IntersectionObserver）', async () => {
    const observed: Element[] = [];
    let notify: IntersectionObserverCallback = () => undefined;
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { notify = callback; }
      observe(node: Element) { observed.push(node); }
      unobserve() {}
      disconnect() {}
    });
    const server: Server = { unread: 2, pages: { '': { items: [item('1', 'work_removed'), item('2', 'work_restored')], nextCursor: null } }, calls: [] };
    stubServer(server);
    renderShell();
    const dialog = await openBell(bell.unread(2));
    await within(dialog).findAllByRole('link');
    await waitFor(() => expect(observed).toHaveLength(2));
    act(() => notify([{ isIntersecting: true, target: observed[0] } as unknown as IntersectionObserverEntry], {} as IntersectionObserver));
    await waitFor(() => expect(readCalls(server)).toHaveLength(1));
    expect(readCalls(server)[0].body).toEqual({ ids: ['1'] });
    expect(await screen.findByRole('button', { name: bell.unread(1), hidden: true })).toBeTruthy();
  });

  it('全部已读：清掉圆点与徽标，按钮随之收起', async () => {
    const server: Server = { unread: 5, pages: { '': { items: [item('1', 'work_commented'), item('2', 'revision_approved')], nextCursor: 'next' }, next: { items: [], nextCursor: null } }, calls: [] };
    stubServer(server);
    renderShell();
    const dialog = await openBell(bell.unread(5));
    fireEvent.click(await within(dialog).findByRole('button', { name: t.markAll }));
    await waitFor(() => expect(within(dialog).queryByRole('button', { name: t.markAll })).toBeNull());
    expect(readCalls(server).some((call) => JSON.stringify(call.body) === '{}')).toBe(true);
    expect(dialog.querySelectorAll('[data-slot="unread-dot"]')).toHaveLength(0);
    expect(await screen.findByRole('button', { name: bell.label, hidden: true })).toBeTruthy();
  });

  it('点通知跳到目标并收起弹出层', async () => {
    const server: Server = { unread: 0, pages: { '': { items: [item('7', 'work_commented', { commentId: 'c7' }, true)], nextCursor: null } }, calls: [] };
    stubServer(server);
    const onNavigate = vi.fn();
    renderShell({ onNavigate });
    const dialog = await openBell(bell.label);
    fireEvent.click(await within(dialog).findByRole('link', { name: new RegExp(t.commented('作品7')) }));
    expect(onNavigate).toHaveBeenCalledWith('/community/w-7#comment-c7');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: t.title })).toBeNull());
  });

  it('空状态、加载失败重试、加载更多', async () => {
    const server: Server = { unread: 0, pages: { '': { items: [], nextCursor: null } }, calls: [], listFails: true };
    stubServer(server);
    renderShell();
    let dialog = await openBell(bell.label);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(t.loadFailed);
    server.listFails = false;
    fireEvent.click(within(dialog).getByRole('button', { name: t.retry }));
    expect(await within(dialog).findByText(t.emptyTitle)).toBeTruthy();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: t.title })).toBeNull());

    server.pages = { '': { items: [item('1', 'work_restored', {}, true)], nextCursor: 'p2' }, p2: { items: [item('2', 'revision_approved', {}, true)], nextCursor: null } };
    dialog = await openBell(bell.label);
    fireEvent.click(await within(dialog).findByRole('button', { name: t.loadMore }));
    await waitFor(() => expect(within(dialog).getAllByRole('link')).toHaveLength(2));
    expect(server.calls.some((call) => call.url === '/api/me/notifications?cursor=p2')).toBe(true);
    expect(within(dialog).queryByRole('button', { name: t.loadMore })).toBeNull();
  });

  it('发现页手机顶栏：底部面板的标题行里是「全部已读」', async () => {
    const server: Server = { unread: 1, pages: { '': { items: [item('1', 'revision_approved')], nextCursor: null } }, calls: [] };
    stubServer(server);
    renderShell({ mobileTop: 'discover' });
    const bells = await screen.findAllByRole('button', { name: bell.unread(1), hidden: true });
    fireEvent.click(bells[1]);
    const dialog = await screen.findByRole('dialog', { name: t.title });
    const header = dialog.querySelector('[data-slot="dialog-header"]')!;
    expect(within(header as HTMLElement).getByRole('button', { name: t.markAll })).toBeTruthy();
  });
});
