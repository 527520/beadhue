// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import TagWorkPicker from './TagWorkPicker';
vi.mock('@/components/community/CommunityThumbnail', () => ({ default: () => <span>缩略图</span> }));
const work = { id: 'work-one', title: '红色小猫', version: 1, lifecycleStatus: 'active', commentsLocked: false, featured: false, isPublic: true, displayName: '豆友', preview: {}, thumbnail: { revisionId: 'revision-one', width: 10, height: 10 } };
beforeEach(() => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [work], total: 1, page: 1, size: 10, totalPages: 1 })))));
it('lists candidate works that do not carry the tag yet and batch-applies it', async () => {
  const onTagged = vi.fn();
  render(<TagWorkPicker tag={{ id: 'tag-star', name: '星星人' }} onTagged={onTagged} />);
  // 默认只请求「还没有这个标签」的作品：URL 必须带 tagState=missing。
  await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/api/admin/community/tags/tag-star/works'))).toBe(true));
  expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('tagState=missing');
  await screen.findByText('红色小猫');
  expect(screen.getByText('缩略图')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: /红色小猫/ }));
  expect(screen.getByRole('button', { name: '为 1 件作品打上「星星人」' })).toBeEnabled();
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ tags: [], works: [{ workId: 'work-one', version: 2, added: 1 }] })));
  fireEvent.click(screen.getByRole('button', { name: '为 1 件作品打上「星星人」' }));
  await waitFor(() => expect(onTagged).toHaveBeenCalled());
  const write = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'POST')!;
  expect(String(write[0])).toBe('/api/admin/community/works/tags');
  expect(JSON.parse(String(write[1]?.body))).toEqual({ workIds: ['work-one'], tags: ['星星人'] });
});
it('shows the empty state when every work already carries the tag', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0, page: 1, size: 10, totalPages: 1 }))));
  render(<TagWorkPicker tag={{ id: 'tag-star', name: '星星人' }} onTagged={() => undefined} />);
  await screen.findByText('没有可以打标的作品了（都已经带上这个标签）。');
});
