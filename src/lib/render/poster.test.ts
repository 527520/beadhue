// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Pattern } from '@/lib/types';
import { drawPoster, type PosterInput } from './poster';

/** 记录绘制调用的最小 2D 上下文桩（可指定 roundRect 是否可用）。 */
function recorder(options: { roundRect?: boolean } = {}) {
  const calls: Array<[string, ...unknown[]]> = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop === 'measureText') return () => ({ width: 42 });
      if (prop === 'roundRect' && options.roundRect === false) return undefined;
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        calls.push([prop, ...args]);
        return undefined;
      };
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  });
  return { ctx, calls };
}

function makeDoc(ctx: unknown, fonts: { load: () => Promise<unknown> }) {
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return {
    doc: { fonts, createElement: () => canvas } as unknown as Document,
    canvas,
  };
}

const pattern: Pattern = {
  width: 2,
  height: 1,
  cells: [
    { hex: '#FAF4C8', code: 'C1', transparent: false },
    { hex: '#FAF4C8', code: 'C1', transparent: false },
  ],
};

const base: PosterInput = {
  title: '红色小猫', meta: '20 × 10 · 3 色', brand: '豆色绘', brandTag: 'BEADHUE',
  width: 20, height: 10, pattern, imageSrc: 'data:image/png;base64,',
};

describe('drawPoster', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('按格绘制完整图纸，返回 1080×1350 画布（roundRect 分支）', async () => {
    const { ctx, calls } = recorder();
    const { doc, canvas } = makeDoc(ctx, { load: vi.fn().mockResolvedValue([]) });

    const result = await drawPoster(base, doc);

    expect(result).toBe(canvas);
    expect(canvas.width).toBe(1080);
    expect(canvas.height).toBe(1350);
    expect(calls.some(([name]) => name === 'roundRect')).toBe(true);
    expect(calls.some(([name]) => name === 'arc')).toBe(true);
    expect(calls.some(([name]) => name === 'fillText')).toBe(true);
  });

  it('字体加载失败时回退系统字体，仍能出图', async () => {
    const { ctx } = recorder();
    const { doc, canvas } = makeDoc(ctx, { load: vi.fn().mockRejectedValue(new Error('font unavailable')) });

    await expect(drawPoster(base, doc)).resolves.toBe(canvas);
  });

  it('环境没有 roundRect 时退回 rect', async () => {
    const { ctx, calls } = recorder({ roundRect: false });
    const { doc, canvas } = makeDoc(ctx, { load: vi.fn().mockResolvedValue([]) });

    await expect(drawPoster(base, doc)).resolves.toBe(canvas);
    expect(calls.some(([name]) => name === 'roundRect')).toBe(false);
    expect(calls.some(([name]) => name === 'rect')).toBe(true);
  });

  it('没有图纸时加载大图并缩放进舞台', async () => {
    class FakeImage {
      decoding = 'async';
      src = '';
      decode(): Promise<void> {
        return Promise.resolve();
      }
    }
    vi.stubGlobal('Image', FakeImage);
    const { ctx, calls } = recorder();
    const { doc, canvas } = makeDoc(ctx, { load: vi.fn().mockResolvedValue([]) });

    await expect(drawPoster({ ...base, pattern: null }, doc)).resolves.toBe(canvas);
    expect(calls.some(([name]) => name === 'drawImage')).toBe(true);
  });

  it('拿不到 2d 上下文时报错', async () => {
    const doc = {
      fonts: { load: vi.fn().mockResolvedValue([]) },
      createElement: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement,
    } as unknown as Document;

    await expect(drawPoster(base, doc)).rejects.toThrow('canvas unavailable');
  });
});
