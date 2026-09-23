import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { Pattern, PatternCell } from '@/lib/types';
import { encodeRgbPng, type RgbImage } from './png';
import { rasterizePattern, renderPatternThumbnail, ThumbnailCache } from './thumbnail';
import { thumbnailCellSize, thumbnailPixelSize } from './thumbnailSize';

const cell = (hex: string | null, extra: Partial<PatternCell> = {}): PatternCell => ({ hex, code: hex ? 'C1' : null, transparent: hex === null && !extra.external, external: false, ...extra } as PatternCell);
const pattern = (width: number, height: number, fill: (x: number, y: number) => PatternCell): Pattern => ({
  width, height, cells: Array.from({ length: width * height }, (_, index) => fill(index % width, Math.floor(index / width))),
} as Pattern);
const pixelOf = (image: RgbImage) => (x: number, y: number) => Array.from(image.data.subarray((y * image.width + x) * 3, (y * image.width + x) * 3 + 3));

describe('thumbnail sizing', () => {
  it('scales the cell so the longest edge approaches the target while staying inside bounds', () => {
    expect(thumbnailCellSize(29, 29)).toBe(16);
    expect(thumbnailCellSize(116, 134)).toBe(5);
    expect(thumbnailCellSize(200, 200)).toBe(3);
    expect(thumbnailCellSize(400, 10)).toBe(2);
    expect(thumbnailPixelSize(116, 134)).toEqual({ width: 580, height: 670 });
    expect(thumbnailCellSize(29, 29, 'large')).toBe(28);
  });
});

describe('rasterizePattern（D67 豆粒风格）', () => {
  it('每格一颗带孔的圆豆：孔是豆色向白混 66%，豆身是原色，格角是白色钉板底', () => {
    const image = rasterizePattern(pattern(1, 1, () => cell('#FF0000')));
    expect(thumbnailCellSize(1, 1)).toBe(16);
    expect([image.width, image.height]).toEqual([16, 16]);
    const pixel = pixelOf(image);
    expect(pixel(7, 7)).toEqual([255, 168, 168]);
    expect(pixel(12, 7)).toEqual([255, 0, 0]);
    // 没有格线：格角保持纯白（旧实现在这里画深色格线）。
    expect(pixel(0, 0)).toEqual([255, 255, 255]);
    expect(pixel(15, 15)).toEqual([255, 255, 255]);
  });

  it('每格 ≥10px 时豆边有 10% 深色描边，不足 10px 时没有', () => {
    const large = rasterizePattern(pattern(1, 1, () => cell('#FF0000')));
    const reds = (image: RgbImage, cellPx: number) => Array.from({ length: cellPx * cellPx }, (_, index) => image.data[((Math.floor(index / cellPx)) * image.width + (index % cellPx)) * 3]);
    // 描边色 = 豆色向黑混 10%（R 230），只有它能把红色通道压到 255 以下。
    expect(reds(large, 16).some((value) => value < 255)).toBe(true);
    const small = rasterizePattern(pattern(80, 1, () => cell('#FF0000')));
    expect(thumbnailCellSize(80, 1)).toBe(9);
    expect(reds(small, 9).every((value) => value === 255)).toBe(true);
    // 边缘像素是钉板白与豆色的抗锯齿混合，不是硬边。
    const rim = pixelOf(large)(15, 7);
    expect(rim[1]).toBeGreaterThan(0);
    expect(rim[1]).toBeLessThan(255);
  });

  it('透明格与背景外部格只画淡钉点，每格不足 4px 时连钉点也不画', () => {
    const empty = rasterizePattern(pattern(2, 1, (x) => (x === 0 ? cell(null) : cell('#00FF00', { external: true }))));
    const cellPx = thumbnailCellSize(2, 1);
    const pixel = pixelOf(empty);
    expect(pixel(7, 7)).toEqual([0xeb, 0xeb, 0xef]);
    expect(pixel(cellPx + 7, 7)).toEqual([0xeb, 0xeb, 0xef]);
    expect(pixel(0, 0)).toEqual([255, 255, 255]);
    const tiny = rasterizePattern(pattern(200, 200, (x, y) => (x === 0 && y === 0 ? cell('#FF0000') : cell(null))));
    expect(thumbnailCellSize(200, 200)).toBe(3);
    const tinyPixel = pixelOf(tiny);
    // 3px 的格子：豆没有孔（中心是原色），空格整格纯白。
    expect(tinyPixel(1, 1)).toEqual([255, 0, 0]);
    expect(tinyPixel(4, 1)).toEqual([255, 255, 255]);
  });

  it('没有板缝：跨底板边界的相邻格与板内格完全一样', () => {
    const image = rasterizePattern(pattern(60, 1, () => cell('#3366CC')));
    const cellPx = thumbnailCellSize(60, 1);
    const tile = (x: number) => Array.from({ length: cellPx }, (_, row) => Array.from(image.data.subarray((row * image.width + x * cellPx) * 3, (row * image.width + (x + 1) * cellPx) * 3)).join(',')).join('|');
    for (const boundary of [28, 29, 30]) expect(tile(boundary)).toBe(tile(0));
  });

  it('大图按 large 尺寸渲染，同一输入输出完全相同的 PNG', () => {
    const source = pattern(29, 29, (x, y) => cell((x + y) % 2 ? '#112233' : '#FFEEDD'));
    expect(rasterizePattern(source, { size: 'large' }).width).toBe(29 * 28);
    expect(renderPatternThumbnail(source).equals(renderPatternThumbnail(source))).toBe(true);
  });
});

describe('encodeRgbPng', () => {
  it('produces a valid PNG whose IDAT decodes to filter-0 scanlines', () => {
    const png = encodeRgbPng({ width: 2, height: 1, data: new Uint8Array([1, 2, 3, 4, 5, 6]) });
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.toString('latin1', 12, 16)).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(2);
    expect(png.readUInt32BE(20)).toBe(1);
    const idatLength = png.readUInt32BE(33);
    expect(png.toString('latin1', 37, 41)).toBe('IDAT');
    const raw = inflateSync(png.subarray(41, 41 + idatLength));
    expect(Array.from(raw)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(png.toString('latin1', png.length - 8, png.length - 4)).toBe('IEND');
  });

  it('renders a full pattern to PNG bytes', () => {
    const png = renderPatternThumbnail(pattern(29, 29, (x, y) => cell((x + y) % 2 ? '#112233' : '#FFEEDD')));
    expect(png.length).toBeGreaterThan(100);
    expect(png.toString('latin1', 1, 4)).toBe('PNG');
  });
});

describe('ThumbnailCache', () => {
  it('evicts the least recently used entries once the byte budget is exceeded', () => {
    const cache = new ThumbnailCache(10);
    cache.set('a', Buffer.alloc(4));
    cache.set('b', Buffer.alloc(4));
    expect(cache.get('a')).toBeDefined();
    cache.set('c', Buffer.alloc(4));
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBeDefined();
    expect(cache.get('c')).toBeDefined();
    expect(cache.size).toBe(2);
  });
});
