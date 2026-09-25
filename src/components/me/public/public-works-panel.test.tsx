// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OwnItem } from './own-works-model';
import { PublicWorksPanel } from './public-works-panel';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/me/public' }));

const item = (patch: Partial<OwnItem>): OwnItem => ({
  workId: 'w-1', workVersion: 3, kind: 'rejected', title: '心动爱心', thumbnailUrl: '/t.png', width: 24, height: 24,
  note: '2 天前提交', reason: '标题含联系方式', likes: 0, comments: 0, reuses: 0, publicHref: null,
  latest: { id: 'r-1', version: 2, status: 'rejected' }, sourceDesignId: 'd-1', editHref: '/app?id=d-1&publish=1&workId=w-1', ...patch,
});

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ workId: 'w-1', version: 4, lifecycleStatus: 'withdrawn' }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

it('没公开过的未通过投稿：菜单里「删除投稿记录」，确认说明不会影响设计，发出整件撤回', async () => {
  const user = userEvent.setup();
  render(<PublicWorksPanel items={[item({})]} guest={false} />);
  await user.click(screen.getByRole('button', { name: '「心动爱心」的更多操作' }));
  expect(screen.queryByRole('menuitem', { name: '撤回公开' })).toBeNull();
  await user.click(screen.getByRole('menuitem', { name: '删除投稿记录' }));
  const dialog = screen.getByRole('dialog', { name: '删除这条投稿记录？' });
  expect(dialog).toHaveTextContent('设计本身不受影响');
  await user.click(within(dialog).getByRole('button', { name: '删除投稿记录' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('/api/community/works/w-1/withdraw');
  expect(JSON.parse(String((init as RequestInit).body))).toEqual({ expectedVersion: 3 });
  await waitFor(() => expect(router.refresh).toHaveBeenCalled());
});

it('已公开的作品仍是「撤回公开」，不出现「删除投稿记录」', async () => {
  const user = userEvent.setup();
  render(<PublicWorksPanel items={[item({ kind: 'published', note: null, reason: null, publicHref: '/community/w-1', latest: null })]} guest={false} />);
  await user.click(screen.getByRole('button', { name: '「心动爱心」的更多操作' }));
  expect(screen.getByRole('menuitem', { name: '撤回公开' })).toBeVisible();
  expect(screen.queryByRole('menuitem', { name: '删除投稿记录' })).toBeNull();
});
