// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Button } from './button';
import { IconButton } from './icon-button';
import { LikeButton } from './like-button';
import { Chip, RemovableChip } from './chip';
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './dialog';
import { Select } from './select';
import { Tooltip } from './tooltip';
import { Field } from './field';
import { Input } from './input';
import { Badge } from './badge';
import { Avatar, avatarColor } from './avatar';
import { EmptyState } from './empty-state';
import { Kbd } from './kbd';
import { pageItems, Pagination } from './pagination';
import { SegmentedControl } from './tabs';
import { cn } from '@/lib/cn';

const originalWidth = window.innerWidth;
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
});

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
}

describe('Button', () => {
  it('按变体与尺寸输出令牌类，默认 type=button', () => {
    render(<><Button variant="primary" size="lg">生成</Button><Button variant="danger-outline" size="sm">删除</Button></>);
    const primary = screen.getByRole('button', { name: '生成' });
    expect(primary).toHaveAttribute('type', 'button');
    expect(primary.className).toMatch(/bg-accent/);
    expect(primary.className).toMatch(/h-control-lg/);
    expect(screen.getByRole('button', { name: '删除' }).className).toMatch(/text-danger/);
  });

  it('禁用时不可点、用 --bg-muted 底而不是半透明', async () => {
    const onClick = vi.fn();
    render(<Button variant="primary" disabled onClick={onClick}>生成</Button>);
    const button = screen.getByRole('button', { name: '生成' });
    expect(button).toBeDisabled();
    expect(button.className).toMatch(/disabled:bg-bg-muted/);
    expect(button.className).not.toMatch(/opacity/);
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('loading：aria-busy、出现旋转环、文字仍在（宽度不变）', () => {
    render(<Button variant="primary" loading>保存</Button>);
    const button = screen.getByRole('button', { name: '保存' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('[data-slot="button-spinner"]')).not.toBeNull();
    expect(button.className).toMatch(/text-transparent/);
  });
});

describe('IconButton / LikeButton / Chip', () => {
  it('图标按钮必须带可访问名称，按下态用 aria-pressed', () => {
    render(<IconButton label="画笔" aria-pressed tooltip={false}><svg /></IconButton>);
    const button = screen.getByRole('button', { name: '画笔' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('LikeButton 切换 aria-pressed 与可访问名称', async () => {
    function Harness() {
      const [on, setOn] = useState(false);
      return <LikeButton title="橘猫团子" pressed={on} onPressedChange={setOn} />;
    }
    render(<Harness />);
    const off = screen.getByRole('button', { name: '喜欢「橘猫团子」' });
    expect(off).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(off);
    const on = screen.getByRole('button', { name: '取消喜欢「橘猫团子」' });
    expect(on).toHaveAttribute('aria-pressed', 'true');
    expect(on.querySelector('svg')?.getAttribute('class')).toMatch(/animate-bead-pop/);
  });

  it('芯片选中同步 aria-pressed，计数与可移除', async () => {
    const onRemove = vi.fn();
    render(<><Chip selected count={8}>水果</Chip><RemovableChip onRemove={onRemove}>夏天</RemovableChip></>);
    expect(screen.getByRole('button', { name: /水果\s*8/ })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: '移除：夏天' }));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});

function DemoDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<button type="button" />}>打开</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>重命名设计</DialogTitle></DialogHeader>
        <DialogBody><input aria-label="名称" defaultValue="橘猫" /></DialogBody>
        <DialogFooter><DialogClose render={<button type="button" />}>取消</DialogClose></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

describe('Dialog', () => {
  it('桌面：居中弹窗，焦点圈定在弹窗内，Esc 关闭并把焦点还给触发器', async () => {
    setWidth(1440);
    const user = userEvent.setup();
    render(<DemoDialog />);
    const trigger = screen.getByRole('button', { name: '打开' });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: '重命名设计' });
    expect(dialog).toHaveAttribute('data-variant', 'dialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    // 焦点圈定：弹窗外的内容被标记为 inert + aria-hidden，Tab 无法到达（真实浏览器的 Tab 回绕另由 Playwright 检查）。
    const outside = trigger.closest('[data-base-ui-inert]');
    expect(outside).not.toBeNull();
    expect(outside).toHaveAttribute('aria-hidden', 'true');
    await user.tab();
    expect(document.activeElement).not.toBe(trigger);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('手机宽度：同一个组件变成带拖动条的底部面板', async () => {
    setWidth(390);
    render(<DemoDialog />);
    await userEvent.click(screen.getByRole('button', { name: '打开' }));
    const sheet = await screen.findByRole('dialog', { name: '重命名设计' });
    expect(sheet).toHaveAttribute('data-variant', 'sheet');
    expect(sheet.querySelector('[data-slot="sheet-handle"]')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '关闭' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('Select', () => {
  it('键盘打开、方向键移动、回车选中', async () => {
    setWidth(1440);
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<Select label="色板" defaultValue="a" onValueChange={onValueChange} options={[{ value: 'a', label: 'MARD' }, { value: 'b', label: 'COCO' }, { value: 'c', label: 'Perler' }]} />);
    const trigger = screen.getByRole('combobox', { name: '色板' });
    expect(trigger).toHaveTextContent('MARD');
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    await screen.findByRole('listbox');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(onValueChange).toHaveBeenCalledWith('b'));
    await waitFor(() => expect(trigger).toHaveTextContent('COCO'));
  });

  it('手机宽度用底部面板列出选项', async () => {
    setWidth(390);
    const onValueChange = vi.fn();
    render(<Select label="色板" options={[{ value: 'a', label: 'MARD' }, { value: 'b', label: 'COCO' }]} onValueChange={onValueChange} placeholder="选择" />);
    await userEvent.click(screen.getByRole('button', { name: '色板' }));
    await userEvent.click(await screen.findByRole('option', { name: 'COCO' }));
    expect(onValueChange).toHaveBeenCalledWith('b');
  });
});

describe('Tooltip', () => {
  const trigger = () => <Tooltip content="撤销"><button type="button">撤销按钮</button></Tooltip>;

  it('悬停延迟后出现', async () => {
    render(trigger());
    await userEvent.hover(screen.getByRole('button'));
    expect(await screen.findByText('撤销', {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it('触屏（hover: none）不出现', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: query === '(hover: none)', media: query, onchange: null,
      addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
    }) as MediaQueryList);
    render(trigger());
    const button = screen.getByRole('button');
    fireEvent.pointerEnter(button, { pointerType: 'mouse' });
    fireEvent.mouseMove(button);
    act(() => { button.focus(); });
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(screen.queryByText('撤销')).toBeNull();
  });
});

describe('其它基础组件', () => {
  it('Field 把错误挂在字段下并标记 aria-invalid', () => {
    render(<Field label="邮箱" error="缺少域名"><Input defaultValue="lu@example" /></Field>);
    const input = screen.getByLabelText('邮箱');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('缺少域名')).toBeInTheDocument();
  });

  it('Badge / Kbd / Avatar / EmptyState 渲染', () => {
    render(<><Badge tone="featured">精选</Badge><Kbd>/</Kbd><Avatar id="lu" name="小鹿" /><EmptyState title="还没有设计" description="上传一张图片" /></>);
    expect(screen.getByText('精选').className).toMatch(/bg-featured/);
    expect(screen.getByText('小')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '还没有设计' })).toBeInTheDocument();
    expect(avatarColor('lu')).toBe(avatarColor('lu'));
  });

  it('分页页码：首尾常驻、省略号；窄屏上一页 / n/m / 下一页', async () => {
    expect(pageItems(1, 7)).toEqual([1, 2, 3, 'gap', 7]);
    expect(pageItems(5, 9)).toEqual([1, 'gap', 4, 5, 6, 'gap', 9]);
    expect(pageItems(3, 4)).toEqual([1, 2, 3, 4]);
    const onPageChange = vi.fn();
    render(<Pagination variant="compact" page={1} pageCount={7} total={128} pageSize={20} onPageChange={onPageChange} />);
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled();
    expect(screen.getByText('1 / 7')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('分段控件只切换模式值', async () => {
    const onValueChange = vi.fn();
    render(<SegmentedControl label="模式" value="edit" onValueChange={onValueChange} items={[{ value: 'edit', label: '编辑' }, { value: 'stitch', label: '跟拼' }]} />);
    await userEvent.click(screen.getByRole('button', { name: '跟拼' }));
    expect(onValueChange).toHaveBeenCalledWith('stitch');
  });

  it('cn 让自定义字阶与文字颜色共存、后者覆盖前者', () => {
    expect(cn('text-title-1 text-ink', 'text-ink-3')).toBe('text-title-1 text-ink-3');
    expect(cn('border-control border-line-strong')).toBe('border-control border-line-strong');
  });
});
