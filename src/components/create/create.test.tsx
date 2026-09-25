// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { zhCN } from '@/messages/zh-CN';
import { DEFAULT_GENERATION_PARAMS } from '@/lib/types';
import type { DecodedImage } from '@/lib/image/decode';
import { relativeTime } from '@/lib/format';
import { boardsOf, centeredCrop, moveCrop, patternHeight, ratioAspect, resizeCrop, roundCrop } from './create-model';
import { buildPaletteChoices, fitSpec, specChoices } from './palette-choices';
import { CreateEntry } from './create-entry';
import { NewDrawingDialog } from './new-drawing-dialog';
import { BlankCanvasDialog } from './blank-canvas-dialog';

const t = zhCN.create;

describe('创作几何与尺寸', () => {
  it('按底板取景让行数凑整块底板，1:1 与原图比例正确', () => {
    expect(ratioAspect('square', 320, 200, 58, 29)).toBe(1);
    expect(ratioAspect('original', 320, 200, 58, 29)).toBeCloseTo(0.625);
    // 58 宽 = 2 块 29 板；320×200 → 1 行板 → 高宽比 1/2
    expect(ratioAspect('board', 320, 200, 58, 29)).toBe(0.5);
    expect(centeredCrop(1, 320, 200)).toEqual({ x: 60, y: 0, width: 200, height: 200 });
    expect(boardsOf(58, 36, 29)).toEqual({ cols: 2, rows: 2, total: 4 });
    expect(patternHeight(100, { width: 320, height: 200 })).toBe(63);
  });

  it('移动钳在原图内，拖角保持比例并守住最小边', () => {
    const start = { x: 0, y: 0, width: 160, height: 100 };
    expect(moveCrop(start, 500, 500, 320, 200)).toEqual({ x: 160, y: 100, width: 160, height: 100 });
    const grown = resizeCrop(start, 'se', 80, 0, 320, 200);
    expect(grown.width / grown.height).toBeCloseTo(1.6);
    expect(grown.width).toBeCloseTo(240);
    const shrunk = resizeCrop(start, 'se', -1000, -1000, 320, 200);
    expect(shrunk.height).toBeGreaterThanOrEqual(30 - 1e-9);
    expect(roundCrop({ x: -1, y: 0.4, width: 400, height: 99.6 }, 320, 200)).toEqual({ x: 0, y: 0, width: 320, height: 100 });
  });

  it('相对时间：分钟 / 小时 / 天', () => {
    const now = Date.parse('2026-09-24T12:00:00Z');
    expect(relativeTime('2026-09-24T11:59:40Z', now)).toBe('刚刚');
    expect(relativeTime('2026-09-24T10:00:00Z', now)).toBe('2 小时前');
    expect(relativeTime('2026-09-21T12:00:00Z', now)).toBe('3 天前');
  });

  it('色板选项含 13 套内置色板；Mini 专用色板原子切到 2.6mm 并给出说明，不兼容规格禁用', () => {
    const choices = buildPaletteChoices();
    expect(choices).toHaveLength(13);
    const artkal = choices.find((choice) => choice.name.startsWith('优肯 Artkal C'))!;
    expect(fitSpec(artkal, '5mm-29')).toEqual({ spec: '2.6mm-50', note: expect.stringContaining('已改为 2.6mm · 50×50') });
    expect(specChoices(artkal.palette, artkal.name).find((spec) => spec.id === '5mm-29')).toMatchObject({ disabled: true, meta: expect.stringContaining('只支持 2.6mm') });
  });
});

describe('创作入口', () => {
  const base = { onImage: vi.fn(), onBlank: vi.fn(), onImport: vi.fn(), existingNames: [], storage: null };

  it('一个 h1、唯一主按钮、并列次入口与四张示例', () => {
    render(<CreateEntry {...base} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(t.title);
    expect(screen.getByRole('button', { name: t.choose })).toBeTruthy();
    expect(screen.getByRole('button', { name: new RegExp(t.blankTitle) })).toBeTruthy();
    expect(screen.getByRole('button', { name: new RegExp(t.importTitle) })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^用示例/ })).toHaveLength(4);
    expect(screen.getByText(t.privacy)).toBeTruthy();
  });

  it('非图片文件在落区内说明原因，不进入解码', async () => {
    const onImage = vi.fn();
    render(<CreateEntry {...base} onImage={onImage} />);
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText(zhCN.upload.inputLabel), { target: { files: [file] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(t.notImage('notes.txt'));
    expect(onImage).not.toHaveBeenCalled();
  });

  it('重选原图时只保留落区与返回按钮', () => {
    const onBack = vi.fn();
    render(<CreateEntry {...base} reselect={{ backLabel: '返回原图纸', onBack }} />);
    expect(screen.queryByRole('button', { name: new RegExp(t.blankTitle) })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '返回原图纸' }));
    expect(onBack).toHaveBeenCalled();
  });
});

const image: DecodedImage = { data: new Uint8ClampedArray(32 * 20 * 4).fill(200), width: 32, height: 20, naturalWidth: 320, naturalHeight: 200, mime: 'image/png' };

describe('新建图纸弹窗', () => {
  const props = {
    image,
    params: DEFAULT_GENERATION_PARAMS,
    paletteValue: 'builtin:MARD',
    boardProfile: '5mm-29' as const,
    paletteChoices: buildPaletteChoices(),
    colorRange: { min: 2, max: 64 },
    working: false,
    progress: null,
    onCancelGeneration: vi.fn(),
    onClose: vi.fn(),
  };

  it('默认宽度不在芯片里时选中「自定义」；换芯片、1:1 后按设置生成', async () => {
    const onGenerate = vi.fn();
    render(<NewDrawingDialog {...props} onGenerate={onGenerate} />);
    const dialog = screen.getByRole('dialog', { name: t.newTitle });
    expect(within(dialog).getByRole('button', { name: t.custom })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByText(/100 × 63 格 · 4 × 3 块板/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: t.widthChip(2, 58) }));
    fireEvent.click(within(dialog).getByRole('button', { name: t.ratioSquare }));
    expect(within(dialog).getByText(/58 × 58 格 · 2 × 2 块板（共 4 块）/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: t.generate }));
    expect(onGenerate).toHaveBeenCalledWith({
      rect: { x: 60, y: 0, width: 200, height: 200 },
      width: 58,
      colors: 40,
      paletteValue: 'builtin:MARD',
      boardProfile: '5mm-29',
      removeBackground: false,
    });
  });

  it('结果预览给出尺寸、颗数与颜色数', async () => {
    render(<NewDrawingDialog {...props} onGenerate={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/5mm · 约 [\d,]+ 颗 · \d+ 色/)).toBeTruthy(), { timeout: 3000 });
  });

  it('生成中「取消」停止生成而不关闭', () => {
    const onCancelGeneration = vi.fn();
    const onClose = vi.fn();
    render(<NewDrawingDialog {...props} working progress={40} onGenerate={vi.fn()} onCancelGeneration={onCancelGeneration} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: t.cancel }));
    expect(onCancelGeneration).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: t.generate })).toHaveAttribute('aria-busy', 'true');
  });
});

describe('空白画布弹窗', () => {
  it('自定义宽高钳在 20–200', () => {
    const onCreate = vi.fn();
    render(<BlankCanvasDialog paletteChoices={buildPaletteChoices()} paletteValue="builtin:MARD" boardProfile="5mm-29" onCreate={onCreate} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: t.custom }));
    const w = screen.getByRole('spinbutton', { name: t.blankWidthAria });
    fireEvent.change(w, { target: { value: '500' } });
    fireEvent.blur(w);
    fireEvent.click(screen.getByRole('button', { name: t.createCanvas }));
    expect(onCreate).toHaveBeenCalledWith({ width: 200, height: 58, paletteValue: 'builtin:MARD', boardProfile: '5mm-29' });
  });
});
