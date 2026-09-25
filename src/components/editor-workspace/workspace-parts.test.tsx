// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { ColorsPanel } from './panel-colors';
import { BrushMenu } from './workspace-chrome';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

it('颜色面板：色板库入口带当前设计编号，点击先交给编辑器保存再离开', () => {
  const onNavigate = vi.fn();
  render(
    <ColorsPanel color={null} onColor={() => {}} palette={[]} paletteChoices={[]} paletteValue="builtin:MARD" onPalette={() => {}} stats={[]}
      highlight={null} onHighlight={() => {}} onReplace={() => {}} library={{ href: '/palettes?designId=d-1', onNavigate }} />,
  );
  const link = screen.getByRole('link', { name: '查看完整色板库' });
  expect(link).toHaveAttribute('href', '/palettes?designId=d-1');
  fireEvent.click(link);
  expect(onNavigate).toHaveBeenCalledWith(expect.anything(), '/palettes?designId=d-1');
});

it('笔刷大小菜单：上下方向键在选项间移动，首尾循环，Home / End 到两端', () => {
  const anchor = createRef<HTMLButtonElement>();
  render(<><button ref={anchor}>画笔</button><BrushMenu anchor={anchor} open onOpenChange={() => {}} side="right" size={1} onSize={() => {}} /></>);
  const items = screen.getAllByRole('menuitemradio');
  items[0].focus();
  fireEvent.keyDown(items[0], { key: 'ArrowDown' });
  expect(document.activeElement).toBe(items[1]);
  fireEvent.keyDown(items[1], { key: 'End' });
  expect(document.activeElement).toBe(items[2]);
  fireEvent.keyDown(items[2], { key: 'ArrowDown' });
  expect(document.activeElement).toBe(items[0]);
  fireEvent.keyDown(items[0], { key: 'ArrowUp' });
  expect(document.activeElement).toBe(items[2]);
  fireEvent.keyDown(items[2], { key: 'Home' });
  expect(document.activeElement).toBe(items[0]);
});
