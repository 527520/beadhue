// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach } from 'vitest';
import { parseTagIcon } from '@/lib/community/tagIcon';
import { niceScale } from './charts';
import { fmtAgo } from './format';
import { encodePixels, tagIconPattern } from './tag-icon';
import { tableQuery } from './use-admin-table';
import { ReasonDialog, type CommandState } from './overlays';

afterEach(cleanup);
const idle: CommandState = { busy: false, uncertain: false, error: null, locked: false, retry: async () => {} };

describe('后台表格查询串', () => {
  it('空条件不带，多选用逗号拼接，额外参数追加', () => {
    expect(tableQuery('  ', { status: '', tag: [] })).toBe('');
    expect(tableQuery(' 猫 ', { status: 'removed', tag: ['a', 'b'] }, { from: '2026-09-01', to: undefined })).toBe('q=%E7%8C%AB&status=removed&tag=a%2Cb&from=2026-09-01');
  });
});

describe('折线图坐标轴', () => {
  it('取 3 或 4 段、顶端最贴近数据的刻度', () => {
    expect(niceScale(52)).toEqual({ count: 3, step: 20, max: 60 });
    expect(niceScale(9)).toEqual({ count: 3, step: 4, max: 12 });
    expect(niceScale(230)).toEqual({ count: 3, step: 100, max: 300 });
    // 计数图：没有数据或个位数时也只出现整数刻度。
    expect(niceScale(0)).toEqual({ count: 3, step: 1, max: 3 });
    expect(niceScale(3)).toEqual({ count: 3, step: 1, max: 3 });
  });
});

describe('相对时间', () => {
  it('刚刚 / 分钟 / 小时', () => {
    const now = new Date('2026-09-24T06:00:00Z');
    expect(fmtAgo(new Date(now.getTime() - 20_000), now)).toBe('刚刚');
    expect(fmtAgo(new Date(now.getTime() - 12 * 60_000), now)).toBe('12 分钟前');
    expect(fmtAgo(new Date(now.getTime() - 3 * 3600_000), now)).toBe('3 小时前');
  });
});

describe('像素图标编码', () => {
  it('只保留用到的颜色，往返解析一致', () => {
    const cells = Array<string | null>(64).fill(null);
    cells[0] = '#E0473F'; cells[9] = '#3F7FD9'; cells[18] = '#E0473F';
    const encoded = encodePixels(8, cells)!;
    expect(encoded.startsWith('px:8x8:E0473F.3F7FD9:1')).toBe(true);
    const icon = parseTagIcon(encoded);
    expect(icon).toMatchObject({ kind: 'pixels', width: 8, height: 8 });
    const pattern = tagIconPattern(encoded)!;
    expect(pattern.cells[9].hex).toBe('#3F7FD9');
    expect(pattern.cells[1].transparent).toBe(true);
  });
  it('空画布与超过 8 色不编码；内置键可渲染', () => {
    expect(encodePixels(8, Array(64).fill(null))).toBeNull();
    expect(tagIconPattern('cat')?.width).toBe(13);
    expect(tagIconPattern('not-an-icon')).toBeNull();
  });
});

describe('理由弹窗', () => {
  it('理由不足 3 字时在字段下提示，不提交；常用理由一键填入后提交', async () => {
    const confirmed: string[] = [];
    render(<ReasonDialog open onOpenChange={() => {}} title="下架「猫」" label="下架理由" quick={['疑似转载他人图纸']} confirmLabel="确认下架" command={idle} onConfirm={(reason) => { confirmed.push(reason); }} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('下架理由'), '无');
    await user.click(screen.getByRole('button', { name: '确认下架' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('请至少写 3 个字');
    expect(confirmed).toEqual([]);
    await user.click(screen.getByRole('button', { name: '疑似转载他人图纸' }));
    await user.click(screen.getByRole('button', { name: '确认下架' }));
    expect(confirmed).toEqual(['疑似转载他人图纸']);
  });
  it('结果未确认时显示「重试确认」，并禁用最终按钮', () => {
    render(<ReasonDialog open onOpenChange={() => {}} title="驳回" confirmLabel="驳回并通知作者" command={{ ...idle, error: '网络', uncertain: true, locked: true }} onConfirm={() => {}} />);
    expect(screen.getByRole('button', { name: '重试确认' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '驳回并通知作者' })).toBeDisabled();
  });
});

describe('官方草稿图纸编辑', () => {
  it('复用编辑器工具：键盘落笔提交一次、撤销回到原图', async () => {
    const { DraftPatternEditor } = await import('./draft-pattern-editor');
    const red = { hex: '#ff0000', code: 'R1' };
    const blue = { hex: '#0000ff', code: 'B1' };
    const pattern = { width: 2, height: 2, cells: Array.from({ length: 4 }, () => ({ ...red, transparent: false })) };
    const changes: Array<typeof pattern> = [];
    render(<DraftPatternEditor pattern={pattern} palette={[red, blue]} boardSize={29} onPatternChange={(next) => changes.push(next as typeof pattern)} />);
    const user = userEvent.setup();
    expect(screen.getByRole('navigation', { name: '工具' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /B1/ }));
    await user.click(screen.getByRole('button', { name: '油漆桶' }));
    const canvas = screen.getByLabelText(/2 × 2 格/);
    canvas.focus();
    await user.keyboard('{ArrowRight}{Enter}');
    expect(changes).toHaveLength(1);
    expect(changes[0].cells.every((cell) => cell.code === 'B1')).toBe(true);
    await user.click(screen.getByRole('button', { name: '撤销' }));
    expect(changes.at(-1)?.cells.every((cell) => cell.code === 'R1')).toBe(true);
  });
});
