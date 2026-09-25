import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const globals = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');
const theme = readFileSync(resolve(process.cwd(), 'src/app/theme.css'), 'utf8');

function token(name: string): string {
  const value = theme.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
  if (!value) throw new Error(`missing color token: ${name}`);
  return value;
}

function contrast(foreground: string, background: string): number {
  const luminance = (hex: string): number => {
    const channels = hex.match(/[0-9a-f]{2}/gi)?.map((part) => Number.parseInt(part, 16) / 255) ?? [];
    const [r, g, b] = channels.map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe('全站样式入口', () => {
  it('globals.css 是唯一的 Tailwind 入口：preflight + theme.css，不再有旧组件类', () => {
    expect(globals).toMatch(/@import "tailwindcss\/preflight\.css" layer\(base\)/);
    expect(globals).toMatch(/@import "\.\/theme\.css"/);
    expect(globals).not.toMatch(/@import "tailwindcss";/);
    expect(globals.split('\n').length).toBeLessThan(300);
    expect(globals).not.toMatch(/\.btn-|\.beadhue-ui|\.admin-|\.notice/);
    expect(globals).toContain('prefers-reduced-motion');
  });
});

describe('颜色令牌对比度（WCAG AA）', () => {
  it('正文在各级底色上、次要文字（ink-3）在所有静置底色上 ≥ 4.5:1', () => {
    for (const ink of ['ink', 'ink-2'] as const) {
      for (const bg of ['bg', 'bg-subtle', 'bg-muted', 'bg-emphasis'] as const) expect(contrast(token(ink), token(bg)), `${ink} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    for (const bg of ['bg', 'bg-subtle', 'bg-muted', 'accent-soft'] as const) expect(contrast(token('ink-3'), token(bg)), `ink-3 on ${bg}`).toBeGreaterThanOrEqual(4.5);
    // bg-emphasis 只用于悬停、按下这类瞬时底，ink-3 在上面不到 4.5:1，不能拿它当次要文字的静置底。
    expect(contrast(token('ink-3'), token('bg-emphasis'))).toBeLessThan(4.5);
  });

  it('主色按钮白字、主色文字在白底与软底上 ≥ 4.5:1', () => {
    expect(contrast(token('on-accent'), token('accent'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('accent'), token('bg'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('accent'), token('accent-soft'))).toBeGreaterThanOrEqual(4.5);
  });

  it('状态色在白底与各自软底上 ≥ 4.5:1', () => {
    for (const name of ['success', 'warning', 'danger'] as const) {
      expect(contrast(token(name), token('bg')), name).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token(name), token(`${name}-soft`)), `${name} on soft`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
