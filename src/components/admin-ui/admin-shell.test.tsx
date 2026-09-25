// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { AdminShell } from './admin-shell';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin', useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/components/account/useAuthStatus', () => ({
  useAuthStatus: () => ({ kind: 'user', email: 'mod@example.test', role: 'moderator' }),
  notifyAuthStatusChanged: vi.fn(),
}));
vi.mock('@/components/ui/use-media-query', async (original) => ({ ...(await original<object>()), useMediaQuery: () => true }));

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());

const scopesFor = (role: 'admin' | 'moderator') => {
  const view = render(<AdminShell role={role}><p>内容</p></AdminShell>);
  fireEvent.change(screen.getByRole('searchbox', { name: '搜索作品、用户或评论' }), { target: { value: '草莓' } });
  const items = within(screen.getByRole('menu', { name: '搜索范围' })).getAllByRole('menuitem').map((item) => item.textContent);
  view.unmount();
  return items;
};

it('顶栏搜索范围与侧栏同一口径：审核员没有人员和运行日志', () => {
  expect(scopesFor('admin')).toEqual(['在作品中搜索「草莓」回车', '在人员中搜索「草莓」', '在评论中搜索「草莓」', '在运行日志中搜索「草莓」']);
  expect(scopesFor('moderator')).toEqual(['在作品中搜索「草莓」回车', '在评论中搜索「草莓」']);
});
