// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach } from 'vitest';
import { parseTagIcon } from '@/lib/community/tagIcon';
import { DimensionTrend } from './analytics';
import { LineChart, niceScale, type ChartDay } from './charts';
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

describe('折线图', () => {
  const days = (count: number): ChartDay[] => Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(2026, 5, 1 + index)).toISOString().slice(0, 10);
    return { key: date, short: date.slice(5), long: date };
  });

  it('一个月以上只标不超过 7 个日期（最近一天必标），圆点只画在当前列', () => {
    const list = days(90);
    const { container } = render(<LineChart days={list} series={[{ label: '访客', tone: 'ink', values: list.map((_, index) => index) }]} label="每日访客" />);
    const labels = screen.queryAllByText(/^\d\d-\d\d$/);
    expect(labels.length).toBeLessThanOrEqual(7);
    expect(labels.at(-1)).toHaveTextContent(list[89].short);
    expect(container.querySelectorAll('i')).toHaveLength(0);
    cleanup();
    const week = days(7);
    const short = render(<LineChart days={week} series={[{ label: '访客', tone: 'ink', values: [1, 2, 3, 4, 5, 6, 7] }]} label="每日访客" />);
    expect(screen.queryAllByText(/^\d\d-\d\d$/)).toHaveLength(7);
    expect(short.container.querySelectorAll('i')).toHaveLength(7);
  });

  it('整张图只占一个 Tab 位（默认最近一天），左右方向键与 Home / End 逐日移动', async () => {
    const list = days(40);
    render(<><LineChart days={list} series={[{ label: '访客', tone: 'ink', values: list.map(() => 1) }]} label="每日访客" /><button type="button">之后</button></>);
    const columns = within(screen.getByRole('group', { name: '每日访客' })).getAllByRole('button');
    expect(columns.filter((column) => column.tabIndex === 0)).toEqual([columns[39]]);
    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement).toBe(columns[39]);
    expect(columns[39]).toHaveAccessibleName(`${list[39].long}：访客 1`);
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(columns[38]);
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(columns[0]);
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(columns[0]);
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(columns[39]);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '之后' }));
  });
});

describe('单一分类每日趋势', () => {
  const options = [{ value: 'desktop', label: '电脑' }, { value: 'mobile', label: '手机' }];

  it('默认第一个分类；切换分类后折线与读屏数值跟着换', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    render(<DimensionTrend dimension="设备类型" options={options} points={[
      { day: '2026-05-01', value: 'desktop', events: 8 }, { day: '2026-05-01', value: 'mobile', events: 10 }, { day: '2026-05-02', value: 'mobile', events: 12 },
    ]} />);
    const region = screen.getByRole('region', { name: '按分类查看每日趋势' });
    expect(within(region).getByRole('group', { name: '「电脑」每日事件数' })).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: '5月1日：事件数 8' })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(within(region).getByRole('combobox', { name: '分类' }));
    await user.click(await screen.findByRole('option', { name: '手机' }));
    expect(await within(region).findByRole('button', { name: '5月2日：事件数 12' })).toBeInTheDocument();
    expect(within(region).queryByRole('button', { name: /事件数 8$/ })).not.toBeInTheDocument();
  });

  it('范围跨年时日期带年份；没有分类数据时给出说明', () => {
    render(<DimensionTrend dimension="设备类型" options={options.slice(0, 1)} points={[
      { day: '2025-12-31', value: 'desktop', events: 3 }, { day: '2026-01-01', value: 'desktop', events: 4 },
    ]} />);
    expect(screen.getByRole('button', { name: '2026年1月1日：事件数 4' })).toBeInTheDocument();
    cleanup();
    render(<DimensionTrend dimension="设备类型" options={[]} points={[]} />);
    expect(screen.getByText('暂无可分类的数据。')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
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
