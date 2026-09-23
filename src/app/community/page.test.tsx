// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import CommunityPage from './page';

vi.mock('@/lib/auth/db', () => ({ getDb: () => ({}) }));
vi.mock('@/components/layout/SiteHeader', () => ({ default: () => <header /> }));
vi.mock('@/components/community/CommunityImpression', () => ({ CommunityListImpression: () => null }));
// TagFilter 用 useRouter 做客户端跳转；本文件只验证服务端渲染结果，这里给一个空实现。
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const query = vi.hoisted(() => ({
  list: vi.fn(),
  tags: vi.fn(async () => [{ id: 'tag-1', name: '花朵', slug: 'flowers', count: 3 }]),
  allTags: vi.fn(async () => [
    { id: 'tag-1', name: '花朵', slug: 'flowers', count: 3 },
    { id: 'tag-2', name: '猫咪', slug: 'cats', count: 1 },
  ]),
}));
vi.mock('@/lib/community/queries', async (original) => ({
  ...(await original<object>()),
  listPublicCommunityWorks: query.list,
  listPopularCommunityTags: query.tags,
  listAllCommunityTagsWithCounts: query.allTags,
}));

const card = {
  id: 'work-1', revisionId: 'revision-1', title: '窗边的小花', author: { authorType: 'user' as const, publicAuthorId: 'pa-1', displayName: '爱丽丝' },
  boardProfile: '5mm-29', palette: { kind: 'builtin', id: 'MARD' }, width: 29, height: 29, colorCount: 2,
  preview: { colorBand: ['#ff0000', '#ffffff'] }, tags: [{ id: 'tag-1', name: '花朵', slug: 'flowers' }],
  counts: { likes: 1, comments: 2, reuses: 3 }, featured: false, publishedAt: '2026-09-05T12:00:00.000Z',
};

it('豆社下一页保留所有有效筛选，重设筛选不带旧游标', async () => {
  query.list.mockResolvedValue({ items: [], nextCursor: 'next/cursor+value' });
  render(await CommunityPage({ searchParams: Promise.resolve({ q: '花', author: '作者', tag: 'flowers', boardProfile: '5mm-29', palette: 'mard', from: '2026-09-01', to: '2026-09-05', sort: 'popular' }) }));
  const next = new URL(screen.getByRole('link', { name: '下一页' }).getAttribute('href')!, 'http://local');
  expect(Object.fromEntries(next.searchParams)).toEqual({ q: '花', author: '作者', tag: 'flowers', boardProfile: '5mm-29', palette: 'mard', from: '2026-09-01', to: '2026-09-05', sort: 'popular', cursor: 'next/cursor+value' });
  const form = document.querySelector('form')!;
  expect(new FormData(form).get('cursor')).toBeNull();
  expect(new FormData(form).get('author')).toBe('作者');
  // 标签栏：当前标签可一键取消（保留其他筛选），热门标签按名称筛选
  const clearTag = new URL(screen.getByRole('link', { name: '取消标签筛选 花朵' }).getAttribute('href')!, 'http://local');
  expect(clearTag.searchParams.has('tag')).toBe(false); expect(clearTag.searchParams.get('author')).toBe('作者');
});

it('热门标签以名称为筛选键展示在筛选栏下方', async () => {
  query.list.mockResolvedValue({ items: [], nextCursor: null });
  render(await CommunityPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole('link', { name: /花朵/ })).toHaveAttribute('href', '/community?tag=%E8%8A%B1%E6%9C%B5');
});

it('没有筛选结果时提供清除筛选，不把失败搜索说成社区没有作品', async () => {
  query.list.mockResolvedValue({ items: [], nextCursor: null });
  render(await CommunityPage({ searchParams: Promise.resolve({ q: '不存在的作品' }) }));
  expect(screen.getByText('没有符合这些条件的作品')).toBeVisible();
  expect(within(document.querySelector('.community-empty')!).getByRole('link', { name: '清除筛选' })).toHaveAttribute('href', '/community');
});

it('无效日期筛选提供恢复入口，不让整页变为服务器错误', async () => {
  render(await CommunityPage({ searchParams: Promise.resolve({ from: 'invalid-date' }) }));
  expect(screen.getByText('筛选条件无法识别')).toBeVisible();
  expect(screen.getByRole('link', { name: '清除筛选' })).toHaveAttribute('href', '/community');
});

it('列表卡片不再显示标签，标签筛选控件接管筛选', async () => {
  query.list.mockResolvedValue({ items: [card], nextCursor: null });
  render(await CommunityPage({ searchParams: Promise.resolve({}) }));
  // 卡片只剩封面与标题两个链接，标签行整块消失。
  const listCard = document.querySelector<HTMLElement>('.community-card')!;
  expect(document.querySelector('.community-tags')).toBeNull();
  expect(within(listCard).getAllByRole('link')).toHaveLength(2);
  // 可搜索的单选控件与热门芯片行同时在位。
  expect(screen.getByRole('combobox', { name: '按标签筛选' })).toBeVisible();
  expect(screen.getByRole('link', { name: /花朵/ })).toHaveAttribute('href', '/community?tag=%E8%8A%B1%E6%9C%B5');
  // SSR 热路径跳过逐作品标签查询；热门芯片只取前 8 个。
  expect(query.list).toHaveBeenCalledWith({}, expect.anything(), { includeTags: false });
  expect(query.tags).toHaveBeenCalledWith({}, 8);
});
