// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { resetAuthStatusCache } from '@/components/account/useAuthStatus';
import { ArticlePage, ArticleSection } from './article';
import { ConsentPreferences } from './consent-preferences';
import { HelpSteps } from './help-steps';
import { ShareView, type ShareViewProps } from './share-view';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }), usePathname: () => '/s/x' }));

const fetchMock = vi.fn();
beforeEach(() => {
  resetAuthStatusCache();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  document.cookie = 'beadhue_analytics_consent=; max-age=0; path=/';
});
afterEach(() => vi.unstubAllGlobals());

const share: ShareViewProps = {
  name: '橘猫团子',
  pattern: { width: 2, height: 1, cells: [{ hex: '#E0473F', code: 'F5', transparent: false }, { hex: '#FFFFFF', code: 'H1', transparent: false }] },
  colorCount: 7,
  beadCount: 498,
  colorUsage: Array.from({ length: 7 }, (_, index) => ({ code: `A${index}`, name: `色${index}`, hex: '#E0473F', count: 100 - index })),
  beadSize: '5mm',
  boards: 4,
  boardCols: 29,
  boardRows: 29,
  paletteLabel: 'MARD 291 色',
  sharedAt: '2026-09-24T02:00:00.000Z',
  sharedLabel: '2026年9月24日',
};

it('分享页：只读徽标、标题、统计与完整色号清单；没有点赞、讨论与作者', () => {
  render(<ShareView {...share} />);
  expect(screen.getByRole('heading', { level: 1, name: '橘猫团子' })).toBeVisible();
  expect(screen.getByText('只读分享')).toBeVisible();
  expect(screen.getByText('分享于 2026年9月24日')).toHaveAttribute('dateTime', share.sharedAt);
  const card = screen.getByRole('complementary', { name: '图纸信息' });
  expect(within(card).getByText('5mm 豆 · 需要 4 块 29×29 底板')).toBeVisible();
  expect(within(card).getByText('A0')).toBeVisible();
  expect(within(card).getByRole('button', { name: '查看全部 7 色' })).toBeVisible();
  expect(within(card).getByRole('link', { name: '做我自己的图纸' })).toHaveAttribute('href', '/app');
  expect(within(card).getByRole('link', { name: '发现更多图纸' })).toHaveAttribute('href', '/');
  expect(screen.queryByRole('button', { name: /喜欢/ })).toBeNull();
  expect(screen.queryByLabelText('发表评论')).toBeNull();
  // 分享的是完整图纸：色号与方格不锁。
  expect(screen.getByRole('button', { name: '色号' })).not.toHaveAttribute('aria-disabled');
  expect(screen.getByRole('button', { name: '方格' })).not.toHaveAttribute('aria-disabled');
});

it('文章版式：目录锚点指向各节，三项以下不显示目录', () => {
  const toc = [{ id: 'a', title: '一' }, { id: 'b', title: '二' }, { id: 'c', title: '三' }];
  const { unmount } = render(
    <ArticlePage title="规范" lead="导语" toc={toc}>
      {toc.map((item) => <ArticleSection key={item.id} id={item.id} title={item.title}><p>正文</p></ArticleSection>)}
    </ArticlePage>,
  );
  expect(screen.getByRole('heading', { level: 1, name: '规范' })).toBeVisible();
  const nav = screen.getByRole('navigation', { name: '本页目录' });
  expect(within(nav).getByRole('link', { name: '二' })).toHaveAttribute('href', '#b');
  expect(screen.getByRole('region', { name: '二' })).toHaveAttribute('id', 'b');
  unmount();
  render(<ArticlePage title="短" toc={toc.slice(0, 2)}><p>正文</p></ArticlePage>);
  expect(screen.queryByRole('navigation', { name: '本页目录' })).toBeNull();
});

it('帮助页三步：每步一张豆粒示例图，唯一主按钮开始制作', () => {
  render(<HelpSteps />);
  expect(screen.getAllByRole('listitem')).toHaveLength(3);
  expect(screen.getByRole('img', { name: '拼好熨平的成品' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '开始制作' })).toHaveAttribute('href', '/app');
});

it('统计偏好：未选择时拒绝与同意两个按钮同权重，选择后写入偏好接口', async () => {
  render(<ConsentPreferences />);
  expect(await screen.findByText('当前状态：尚未选择')).toBeVisible();
  const reject = screen.getByRole('button', { name: '拒绝' });
  const agree = screen.getByRole('button', { name: '同意匿名统计' });
  expect(reject.className).toBe(agree.className);
  fireEvent.click(reject);
  await vi.waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/analytics/consent' && JSON.parse(String(init.body)).status === 'denied')).toBe(true));
  expect(await screen.findByText('当前状态：已拒绝')).toBeVisible();
});
