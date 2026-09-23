// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import TagFilter from './TagFilter';

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
const tags = [
  { id: 'tag-1', name: '花朵', slug: 'flowers', count: 3 },
  { id: 'tag-2', name: '花束', slug: 'bouquets', count: 1 },
  { id: 'tag-3', name: '猫咪', slug: 'cats', count: 7 },
];

it('输入即本地过滤，↑↓ 选择后回车按名称跳转并保留其他筛选项', () => {
  push.mockClear();
  render(<TagFilter tags={tags} query={{ sort: 'featured', author: '爱丽丝' }} activeTag={null} />);
  const input = screen.getByRole('combobox', { name: '按标签筛选' });
  fireEvent.focus(input);
  expect(screen.getAllByRole('option')).toHaveLength(3);
  fireEvent.change(input, { target: { value: '花' } });
  expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['花朵3 件', '花束1 件']);
  expect(input).toHaveAttribute('aria-expanded', 'true');
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
  fireEvent.keyDown(input, { key: 'Enter' });
  // 只换 tag，游标之外的其他筛选参数原样保留。
  expect(push).toHaveBeenCalledWith('/community?sort=featured&author=%E7%88%B1%E4%B8%BD%E4%B8%9D&tag=%E8%8A%B1%E6%9C%B5');
});

it('没有匹配项时给提示，Esc 收起候选，当前标签可清除', () => {
  push.mockClear();
  render(<TagFilter tags={tags} query={{ sort: 'latest' }} activeTag="猫咪" />);
  const input = screen.getByRole('combobox', { name: '按标签筛选' });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: '不存在的标签' } });
  expect(screen.queryAllByRole('option')).toEqual([]);
  expect(screen.getByText('没有匹配的标签')).toBeVisible();
  expect(input).toHaveAttribute('aria-expanded', 'false');
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.queryByText('没有匹配的标签')).toBeNull();
  // 当前标签芯片是服务端可渲染的真实链接：带上除 tag 之外的筛选参数，去掉游标。
  expect(screen.getByRole('link', { name: '取消标签筛选 猫咪' })).toHaveAttribute('href', '/community?sort=latest');
  expect(push).not.toHaveBeenCalled();
});

it('一个标签都没有时整个控件不渲染', () => {
  const { container } = render(<TagFilter tags={[]} query={{ sort: 'latest' }} activeTag={null} />);
  expect(container).toBeEmptyDOMElement();
});
