// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { resetAuthStatusCache } from '@/components/account/useAuthStatus';
import { DetailView, type DetailWork } from './detail-view';
import { relativeTime } from './detail-format';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/community/w1' }));

const pattern = { width: 2, height: 1, cells: [{ hex: '#E0473F', code: 'F5', transparent: false }, { hex: '#FFFFFF', code: 'H1', transparent: false }] };
const base: DetailWork = {
  id: 'w1', title: '橘猫团子', author: { authorType: 'user', publicAuthorId: 'pa-1', displayName: '橙子手作' },
  width: 32, height: 32, colorCount: 7, beadCount: 498,
  colorUsage: Array.from({ length: 7 }, (_, index) => ({ code: `A${index}`, name: `色${index}`, hex: '#E0473F', count: 100 - index })),
  colorBand: ['#E0473F', '#FFFFFF'], pattern, thumbnailUrl: '/t.png', largeImageUrl: '/l.png', imageCell: 28,
  tags: [{ id: 't1', name: '动物', slug: 't-1' }, { id: 't2', name: '猫咪', slug: 't-2' }], featured: true, liked: false, likes: 1284,
  comments: 0, commentsLocked: false, publishedAt: '2026-09-23T00:00:00.000Z', publishedLabel: '1 天前', publishedTitle: '2026年9月23日',
  beadSize: '5mm', boardCols: 29, boardRows: 29, boards: 4, paletteLabel: 'MARD 291 色',
};

const fetchMock = vi.fn();
beforeEach(() => {
  resetAuthStatusCache();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).startsWith('/api/auth/me')) return new Response(JSON.stringify({ email: 'me@example.test', publicAuthorId: 'pa-me' }), { status: 200 });
    if (String(url).includes('/comments')) return new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 });
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

it('登录后：标题行、面包屑、制作卡与色号清单；评论按最新在前请求', async () => {
  render(<DetailView work={base} loggedIn related={[]} byAuthor={[]} />);
  expect(screen.getByRole('heading', { level: 1, name: '橘猫团子' })).toBeVisible();
  const crumbs = screen.getByRole('navigation', { name: '位置' });
  expect(within(crumbs).getByRole('link', { name: '动物' })).toHaveAttribute('href', '/?cat=%E5%8A%A8%E7%89%A9');
  expect(screen.getByRole('link', { name: /橙子手作/ })).toHaveAttribute('href', '/u/pa-1');
  expect(screen.getByText('1 天前发布')).toHaveAttribute('title', '2026年9月23日');
  expect(screen.getByText('精选')).toBeVisible();
  expect(screen.getByText('5mm 豆 · 需要 4 块 29×29 底板')).toBeVisible();
  expect(screen.getByText('A0')).toBeVisible();
  expect(screen.getByRole('button', { name: '查看全部 7 色' })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getAllByRole('button', { name: '用这张制作' })).toHaveLength(2);
  expect(screen.getByRole('region', { name: '图纸查看器' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '色号' })).not.toHaveAttribute('aria-disabled');
  await waitFor(() => expect(screen.getByText('还没有讨论，拼好后来晒晒成品吧。')).toBeVisible());
  expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/community/works/w1/comments?order=desc')).toBe(true);
  expect(screen.getByLabelText('发表评论')).toBeVisible();
  fireEvent.click(screen.getAllByRole('button', { name: '用这张制作' })[0]);
  expect(await screen.findByRole('heading', { name: '用这张图纸制作' })).toBeVisible();
  expect(screen.getByText('32×32 格 · 7 色 · 498 颗')).toBeVisible();
});

it('未登录：色号清单模糊并提示登录，色号与方格锁定，主按钮「登录后制作」', async () => {
  render(<DetailView work={{ ...base, pattern: null, colorUsage: null }} loggedIn={false} related={[]} byAuthor={[]} />);
  expect(screen.getByText('登录后查看完整色号与颗数')).toBeVisible();
  expect(screen.queryByText('A0')).toBeNull();
  expect(screen.getByRole('button', { name: '色号' })).toHaveAttribute('aria-disabled', 'true');
  expect(screen.getByRole('button', { name: '方格' })).toHaveAttribute('aria-disabled', 'true');
  expect(screen.getAllByRole('button', { name: '登录后制作' })).toHaveLength(2);
  expect(screen.getByText('登录后参与讨论')).toBeVisible();
  await act(async () => { await Promise.resolve(); });
});

it('相似作品与作者的更多作品：去重、链接到类目与作者主页', () => {
  const item = (id: string) => ({
    id, revisionId: `r-${id}`, title: `作品 ${id}`, author: base.author, boardProfile: '5mm-29', palette: { kind: 'builtin', id: 'MARD' },
    width: 29, height: 29, colorCount: 3, preview: { version: 1 as const, width: 1, height: 1, originalWidth: 1, originalHeight: 1, cells: [null], colorBand: [] },
    thumbnailUrl: `/t-${id}.png`, tags: [], counts: { likes: 0, comments: 0, reuses: 0 }, featured: false, liked: false, publishedAt: base.publishedAt,
  });
  render(<DetailView work={base} loggedIn related={[item('a'), item('b')]} byAuthor={[item('b'), item('c'), item('w1')]} />);
  const related = screen.getByRole('region', { name: '相似作品' });
  expect(within(related).getByRole('link', { name: '更多「动物」' })).toHaveAttribute('href', '/?cat=%E5%8A%A8%E7%89%A9');
  const mine = screen.getByRole('region', { name: '橙子手作的更多作品' });
  expect(within(mine).getAllByRole('link', { name: /^查看「/ }).map((link) => link.getAttribute('href'))).toEqual(['/community/c']);
  expect(within(mine).getByRole('link', { name: '作者主页' })).toHaveAttribute('href', '/u/pa-1');
});

it('相对时间：分钟、小时、天，超过 30 天写日期', () => {
  const now = Date.parse('2026-09-24T12:00:00Z');
  expect(relativeTime('2026-09-24T11:59:40Z', now)).toBe('刚刚');
  expect(relativeTime('2026-09-24T11:30:00Z', now)).toBe('30 分钟前');
  expect(relativeTime('2026-09-24T09:00:00Z', now)).toBe('3 小时前');
  expect(relativeTime('2026-09-20T12:00:00Z', now)).toBe('4 天前');
  expect(relativeTime('2026-07-01T12:00:00Z', now)).toBe('2026年7月1日');
});
