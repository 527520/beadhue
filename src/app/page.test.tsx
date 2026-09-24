// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import DiscoverPage, { generateMetadata } from './page';

vi.mock('@/components/shell/site-shell', () => ({
  SiteShell: ({ children, searchExtras }: { children: React.ReactNode; searchExtras?: React.ReactNode }) => <>{children}<div data-testid="search-extras">{searchExtras}</div></>,
}));
vi.mock('@/components/community/CommunityImpression', () => ({ CommunityListImpression: () => null }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/lib/auth/db', () => ({ getDb: () => ({}) }));
vi.mock('@/lib/auth/session', () => ({ getSessionActor: vi.fn(async () => null) }));

const data = vi.hoisted(() => ({
  list: vi.fn(),
  count: vi.fn(async () => 0),
  popular: vi.fn(async () => [{ id: 't1', name: '猫咪', slug: 'cat', count: 3 }]),
  categories: vi.fn(async () => [{ id: 't1', name: '猫咪', icon: 'cat' }, { id: 't2', name: '无图标', icon: null }]),
}));
vi.mock('@/lib/community/queries', async (original) => ({
  ...(await original<object>()),
  listPublicCommunityWorks: data.list,
  countPublicCommunityWorks: data.count,
  listPopularCommunityTags: data.popular,
}));
vi.mock('@/lib/community/discovery', () => ({ listDiscoverCategories: data.categories }));

const work = (id: string, extra: Record<string, unknown> = {}) => ({
  id, revisionId: `r-${id}`, title: `作品 ${id}`, author: { authorType: 'user' as const, publicAuthorId: 'pa', displayName: '小鹿拼豆' },
  boardProfile: '5mm-29', palette: { kind: 'builtin', id: 'MARD' }, width: 32, height: 29, colorCount: 7,
  preview: { version: 1, width: 1, height: 1, originalWidth: 1, originalHeight: 1, cells: [null], colorBand: ['#E0473F', '#FFFFFF'] },
  thumbnailUrl: `/api/community/revisions/r-${id}/thumbnail?v=2`, tags: [], counts: { likes: 0, comments: 0, reuses: 0 },
  featured: false, liked: false, publishedAt: '2026-09-20T08:00:00.000Z', ...extra,
});

beforeEach(() => {
  data.list.mockReset();
  data.count.mockReset();
});

it('首屏服务端渲染类目条与作品卡，筛选参数带进列表查询与类目链接', async () => {
  data.list.mockResolvedValue({ items: [work('1', { featured: true }), work('2', { author: { authorType: 'official', publicAuthorId: 'beadhue-official', displayName: '豆色绘官方' } })], nextCursor: 'c1' });
  data.count.mockResolvedValue(30);
  render(await DiscoverPage({ searchParams: Promise.resolve({ cat: '猫咪', size: 'm', sort: 'likes' }) }));
  expect(data.list.mock.calls[0][1]).toMatchObject({ cat: '猫咪', size: 'm', sort: 'likes' });
  const nav = screen.getByRole('navigation', { name: '类目' });
  expect(within(nav).getByRole('link', { name: '全部' })).toHaveAttribute('href', '/?sort=likes&size=m');
  expect(within(nav).getByRole('link', { name: '猫咪' })).toHaveAttribute('aria-current', 'page');
  expect(within(nav).getByRole('link', { name: '无图标' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1, name: '猫咪' })).toBeVisible();
  expect(screen.getByText('30 张图纸')).toBeVisible();
  expect(screen.getByRole('link', { name: '查看「作品 1」' })).toHaveAttribute('href', '/community/1');
  expect(within(screen.getByRole('region', { name: '作品' })).getByText('精选')).toBeVisible();
  expect(within(screen.getByRole('region', { name: '作品' })).getByText('官方')).toBeVisible();
  expect(screen.getByRole('button', { name: '喜欢「作品 1」' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: '移除筛选：30–40 格' })).toBeVisible();
  // 加载更多是带游标的链接（无脚本也能翻页），保留全部筛选
  const more = new URL(screen.getByRole('link', { name: '加载更多' }).getAttribute('href')!, 'http://local');
  expect(Object.fromEntries(more.searchParams)).toEqual({ cat: '猫咪', sort: 'likes', size: 'm', cursor: 'c1' });
  expect(within(screen.getByTestId('search-extras')).getByRole('link', { name: '猫咪' })).toHaveAttribute('href', '/?cat=%E7%8C%AB%E5%92%AA&sort=likes&size=m');
});

it('搜索无结果：标题回显关键词、清除搜索和筛选、热门搜索芯片', async () => {
  data.list.mockResolvedValue({ items: [], nextCursor: null });
  render(await DiscoverPage({ searchParams: Promise.resolve({ q: '恐龙' }) }));
  expect(screen.getByRole('heading', { level: 1, name: '“恐龙”' })).toBeVisible();
  expect(screen.getByText(/标题、标签和作者都会被搜索/)).toBeVisible();
  expect(screen.getByRole('heading', { name: '没有找到“恐龙”相关的图纸' })).toBeVisible();
  expect(screen.getByRole('link', { name: '清除搜索和筛选' })).toHaveAttribute('href', '/');
  expect(within(screen.getByRole('navigation', { name: '热门搜索' })).getByRole('link', { name: '猫咪' })).toHaveAttribute('href', '/?q=%E7%8C%AB%E5%92%AA');
  expect(await generateMetadata({ searchParams: Promise.resolve({ q: '恐龙' }) })).toMatchObject({ title: '“恐龙”的搜索结果' });
});

it('r14 的 tag 参数并入类目，旧排序值换成新值；非法参数给出清除入口', async () => {
  data.list.mockResolvedValue({ items: [], nextCursor: null });
  render(await DiscoverPage({ searchParams: Promise.resolve({ tag: '猫咪', sort: 'latest' }) }));
  expect(data.list.mock.calls[0][1]).toMatchObject({ cat: '猫咪', sort: 'new' });
  document.body.innerHTML = '';
  render(await DiscoverPage({ searchParams: Promise.resolve({ size: 'huge' }) }));
  expect(screen.getByRole('heading', { name: '筛选条件无效' })).toBeVisible();
  expect(screen.getByRole('link', { name: '清除筛选' })).toHaveAttribute('href', '/');
});

it('默认视图没有可见标题，只有给读屏的页面标题', async () => {
  data.list.mockResolvedValue({ items: [work('1')], nextCursor: null });
  render(await DiscoverPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole('heading', { level: 1, name: '发现图纸' })).toHaveClass('sr-only');
  expect(screen.queryByRole('link', { name: '加载更多' })).toBeNull();
});
