// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { MeViewer } from '@/components/me/me-context';
import { MeShell } from './me-shell';

const nav = vi.hoisted(() => ({ pathname: '/me' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/components/shell/site-shell', () => ({ SiteShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

const viewer: MeViewer = {
  name: '小鹿拼豆', email: 'deer@example.com', username: '小鹿拼豆', avatarId: 'pa-deer', avatarColor: null,
  publicAuthorId: 'pa-deer', verified: true, passwordChangedAt: null,
};

beforeEach(() => { nav.pathname = '/me'; });

it('「我的」各页：头部写名字与统计，页签标出当前页并带设计数', () => {
  nav.pathname = '/me/likes';
  render(<MeShell viewer={viewer} stats={{ designs: 12, publicWorks: 3, likes: 12_345 }}><p>喜欢列表</p></MeShell>);
  expect(screen.getByRole('heading', { level: 1, name: '小鹿拼豆' })).toBeVisible();
  expect(screen.getByText('1.2万')).toBeVisible();
  expect(screen.getByRole('link', { name: '公开主页' })).toHaveAttribute('href', '/u/pa-deer');
  const tabs = screen.getByRole('navigation', { name: '我的内容' });
  expect(within(tabs).getByRole('link', { name: /设计/ })).toHaveTextContent('12');
  expect(within(tabs).getByRole('link', { name: /喜欢/ })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByText('喜欢列表')).toBeVisible();
});

it('账号设置页自带版式：不显示头部与页签', () => {
  nav.pathname = '/me/settings';
  render(<MeShell viewer={viewer} stats={{ designs: 12, publicWorks: 3, likes: 5 }}><p>设置表单</p></MeShell>);
  expect(screen.getByText('设置表单')).toBeVisible();
  expect(screen.queryByRole('heading', { level: 1, name: '小鹿拼豆' })).toBeNull();
  expect(screen.queryByRole('navigation', { name: '我的内容' })).toBeNull();
});

it('游客：头部写「我的」，不显示账号入口与统计数字', () => {
  render(<MeShell viewer={null} stats={null}><p>本机设计</p></MeShell>);
  expect(screen.getByRole('heading', { level: 1, name: '我的' })).toBeVisible();
  expect(screen.queryByRole('link', { name: '账号设置' })).toBeNull();
});
