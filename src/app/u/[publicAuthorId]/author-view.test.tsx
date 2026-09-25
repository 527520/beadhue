// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CommunityListItem } from '@/lib/community/queries';
import { AuthorWorks, ManageLink } from './author-view';
import { ShareProfileButton } from './share-button';

const hoisted = vi.hoisted(() => ({
  toast: vi.fn(),
  copyText: vi.fn(async () => true),
  auth: { kind: 'guest' } as { kind: string; publicAuthorId?: string },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => hoisted.toast }));
vi.mock('@/components/account/useAuthStatus', () => ({ useAuthStatus: () => hoisted.auth }));
vi.mock('@/components/works/detail/work-actions', () => ({ copyText: hoisted.copyText }));

const work = (id: string): CommunityListItem => ({
  id, revisionId: `r-${id}`, title: `作品 ${id}`, author: { authorType: 'user', publicAuthorId: 'pa', displayName: '小鹿拼豆' } as CommunityListItem['author'],
  boardProfile: '5mm-29', palette: { kind: 'builtin', id: 'MARD' }, width: 32, height: 29, colorCount: 7,
  preview: { version: 1, width: 1, height: 1, originalWidth: 1, originalHeight: 1, cells: [null], colorBand: ['#E0473F', '#FFFFFF'] } as CommunityListItem['preview'],
  thumbnailUrl: `/api/community/revisions/r-${id}/thumbnail?v=2`, tags: [], counts: { likes: 0, comments: 0, reuses: 0 },
  featured: false, liked: false, publishedAt: '2026-09-20T08:00:00.000Z',
});

beforeEach(() => {
  hoisted.toast.mockReset();
  hoisted.copyText.mockClear();
  hoisted.auth = { kind: 'guest' };
});
afterEach(() => vi.unstubAllGlobals());

it('加载更多是带游标的链接；点击就地追加下一页，最后一页后写「已经到底了」', async () => {
  const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify({ items: [work('2'), work('1')], nextCursor: null }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<AuthorWorks authorId="pa" items={[work('1')]} nextCursor="c1" />);
  const more = screen.getByRole('link', { name: '加载更多' });
  expect(more).toHaveAttribute('href', '/u/pa?cursor=c1');
  fireEvent.click(more);
  expect(await screen.findByRole('link', { name: '查看「作品 2」' })).toBeVisible();
  expect(String(fetchMock.mock.calls[0][0])).toBe('/api/community/works?author=pa&sort=new&cursor=c1');
  expect(screen.getAllByRole('link', { name: '查看「作品 1」' })).toHaveLength(1);
  expect(screen.queryByRole('link', { name: '加载更多' })).toBeNull();
  expect(screen.getByRole('button', { name: '已经到底了' })).toBeDisabled();
});

it('加载失败提示重试，链接保留', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
  render(<AuthorWorks authorId="pa" items={[work('1')]} nextCursor="c1" />);
  fireEvent.click(screen.getByRole('link', { name: '加载更多' }));
  await waitFor(() => expect(hoisted.toast).toHaveBeenCalledWith('没有加载出来，请重试'));
  expect(screen.getByRole('link', { name: '加载更多' })).toHaveAttribute('href', '/u/pa?cursor=c1');
});

it('只有作者本人看到「管理公开作品」', () => {
  const { rerender } = render(<ManageLink authorId="pa" />);
  expect(screen.queryByRole('link', { name: '管理公开作品' })).toBeNull();
  hoisted.auth = { kind: 'user', publicAuthorId: 'someone-else' };
  rerender(<ManageLink authorId="pa" />);
  expect(screen.queryByRole('link', { name: '管理公开作品' })).toBeNull();
  hoisted.auth = { kind: 'user', publicAuthorId: 'pa' };
  rerender(<ManageLink authorId="pa" />);
  expect(screen.getByRole('link', { name: '管理公开作品' })).toHaveAttribute('href', '/me/public');
});

it('分享主页复制不带查询参数的地址', async () => {
  window.history.replaceState(null, '', '/u/pa?cursor=c1');
  render(<ShareProfileButton />);
  fireEvent.click(screen.getByRole('button', { name: '分享主页' }));
  await waitFor(() => expect(hoisted.toast).toHaveBeenCalled());
  expect(hoisted.copyText).toHaveBeenCalledWith(`${window.location.origin}/u/pa`);
  expect(hoisted.toast.mock.calls[0][0]).toBe('已复制主页链接');
});
