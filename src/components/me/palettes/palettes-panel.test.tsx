// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MeProvider } from '../me-context';
import { builtinCards, colorFamily, filterSwatches, builtinSwatches, sampleStrip } from './palette-model';
import { PalettesPanel } from './palettes-panel';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/me/palettes' }));

afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('色板数据', () => {
  it('13 套内置色板；色带等间距取 24 颗；色系按 HEX 推导', () => {
    const cards = builtinCards();
    expect(cards).toHaveLength(13);
    expect(cards[0].strip).toHaveLength(24);
    expect(sampleStrip(['#000000', '#FFFFFF'])).toEqual(['#000000', '#FFFFFF']);
    expect([colorFamily('#FFFFFF'), colorFamily('#E0473F'), colorFamily('#3F7FD9'), colorFamily('#47A35B'), colorFamily('#6B4423'), colorFamily('#FFC0CB')]).toEqual(['neutral', 'red', 'blue', 'green', 'brown', 'pink']);
    const swatches = builtinSwatches('MARD');
    expect(filterSwatches(swatches, 'a01', 'all')[0].code).toBe('A01');
    expect(filterSwatches(swatches, '#faf4c8', 'all').map((swatch) => swatch.code)).toContain('A01');
  });
});

const viewer = { name: '豆豆', email: 'u@e.com', username: '豆豆', avatarId: 'x', avatarColor: null, publicAuthorId: 'x', verified: true, passwordChangedAt: null };
const provide = (children: React.ReactNode) => <MeProvider value={{ viewer, stats: null, designCount: null, setDesignCount: () => undefined, refreshStats: () => undefined }}>{children}</MeProvider>;

describe('色板页', () => {
  it('公开页只有内置部分；卡片打开可搜索的色块弹窗，带 designId 时可用于当前图纸', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/palettes?designId=11111111-2222-4333-8444-555555555555');
    render(<PalettesPanel mode="public" />);
    expect(screen.queryByRole('heading', { name: '我的色板' })).toBeNull();
    expect(await screen.findByRole('link', { name: /返回原图纸/ })).toHaveAttribute('href', '/app?id=11111111-2222-4333-8444-555555555555');
    await user.click(screen.getByRole('button', { name: /^查看「MARD 豆色绘经典」全部/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('searchbox', { name: '搜索色号、名称或 HEX' }), 'A01');
    expect(within(within(dialog).getByRole('list')).getAllByRole('listitem')).toHaveLength(1);
    expect(within(dialog).getByRole('link', { name: '用于当前图纸' })).toHaveAttribute('href', '/app?id=11111111-2222-4333-8444-555555555555&palette=builtin%3AMARD');
  });

  it('默认色板：MARD 带「默认」徽标；在查看弹窗里把 COCO 设为默认后徽标与说明跟着换（游客存本机）', async () => {
    const user = userEvent.setup();
    window.localStorage.removeItem('beadhue:default-palette');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })));
    render(<PalettesPanel mode="public" />);
    const card = (name: RegExp) => screen.getByRole('button', { name }).closest('li')!;
    await waitFor(() => expect(within(card(/^查看「MARD 豆色绘经典」/)).getByText('默认')).toBeVisible());
    await user.click(screen.getByRole('button', { name: /^查看「COCO 豆色绘经典」/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '设为默认色板' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(within(card(/^查看「COCO 豆色绘经典」/)).getByText('默认')).toBeVisible();
    expect(within(card(/^查看「MARD 豆色绘经典」/)).queryByText('默认')).toBeNull();
    expect(window.localStorage.getItem('beadhue:default-palette')).toBe('COCO');
    await user.click(screen.getByRole('button', { name: /^查看「COCO 豆色绘经典」/ }));
    expect(within(await screen.findByRole('dialog')).getByRole('button', { name: '当前默认' })).toBeDisabled();
    window.localStorage.removeItem('beadhue:default-palette');
  });

  it('登录后新建色板：点选颜色才可保存，保存后出现在我的色板', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as { name: string; colors: unknown[] };
        return new Response(JSON.stringify({ id: url.split('/').pop(), name: body.name, colors: body.colors, updatedAt: new Date().toISOString(), revision: 1 }), { status: 200 });
      }
      return new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(provide(<PalettesPanel />));
    expect(await screen.findByText('还没有自己的色板')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '新建色板' }));
    const dialog = await screen.findByRole('dialog', { name: '新建色板' });
    const save = within(dialog).getByRole('button', { name: '保存' });
    expect(save).toBeDisabled();
    await user.type(within(dialog).getByLabelText('名称'), '夏日水果');
    await user.click(within(dialog).getAllByRole('button', { pressed: false }).find((button) => /^A01 /.test(button.getAttribute('aria-label') ?? ''))!);
    expect(within(dialog).getByText('已选 1 色')).toBeVisible();
    await user.click(save);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('heading', { name: '夏日水果' })).toBeVisible();
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')!;
    expect(JSON.parse(String(put[1]!.body))).toMatchObject({ name: '夏日水果', colors: [{ code: 'A01', hex: '#FAF4C8' }], baseRevision: 0 });
  });

  it('新建色板可导入颜色：坏行整批拒绝并给行号；当前色板里有的直接选中，其余加到「其他颜色」', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as { name: string; colors: unknown[] };
        return new Response(JSON.stringify({ id: url.split('/').pop(), name: body.name, colors: body.colors, updatedAt: new Date().toISOString(), revision: 1 }), { status: 200 });
      }
      return new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(provide(<PalettesPanel />));
    await user.click(await screen.findByRole('button', { name: '新建色板' }));
    const editor = await screen.findByRole('dialog', { name: '新建色板' });
    await user.type(within(editor).getByLabelText('名称'), '导入测试');
    await user.click(within(editor).getByRole('button', { name: '导入颜色…' }));
    const importer = await screen.findByRole('dialog', { name: '导入颜色' });
    const list = within(importer).getByLabelText('颜色列表');
    await user.type(list, '#faf4c8{Enter}oops');
    await user.click(within(importer).getByRole('button', { name: '导入' }));
    expect(within(importer).getByRole('alert')).toHaveTextContent('第 2 行：颜色必须是 #RRGGBB');
    await user.clear(list);
    await user.type(list, '#faf4c8{Enter}#123456');
    await user.click(within(importer).getByRole('button', { name: '导入' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '导入颜色' })).toBeNull());
    expect(within(editor).getByText('已选 2 色')).toBeVisible();
    expect(within(editor).getByText('其他颜色（1）')).toBeVisible();
    expect(within(editor).getByRole('button', { name: /^C001 / })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(editor).getByRole('button', { name: '保存' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')!;
    expect(JSON.parse(String(put[1]!.body))).toMatchObject({ name: '导入测试', colors: [{ code: 'A01', hex: '#FAF4C8' }, { code: 'C001', hex: '#123456' }] });
  });
});
