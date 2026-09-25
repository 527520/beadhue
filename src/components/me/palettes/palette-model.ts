/**
 * 色板页的数据：内置色板卡片、色带取样、按色系分组与色块搜索。
 * 各品牌的色号分组口径不一，色系一律按 HEX 推导（与色号清单的颜色名同一套规则）。
 */
import { getBuiltinPalette, listBuiltinPalettes, type BuiltinPaletteId } from '@/lib/palettes';
import { describeColorName } from '@/lib/palettes/colorNames';
import { paletteSizes } from '@/components/create/palette-choices';
import { zhCN } from '@/messages/zh-CN';

export const FAMILY_KEYS = ['yellow', 'green', 'blue', 'purple', 'pink', 'red', 'brown', 'neutral'] as const;
export type FamilyKey = (typeof FAMILY_KEYS)[number];

export interface Swatch {
  key: string;
  /** 色号；待核对的为 null。 */
  code: string | null;
  hex: string;
  name: string;
  family: FamilyKey;
  /** 只作资料展示（透明材质、无可用色号、重复色值）。 */
  displayOnly: boolean;
}

export interface BuiltinCard {
  id: BuiltinPaletteId;
  name: string;
  count: number;
  specs: string[];
  strip: string[];
}

export const STRIP_SLOTS = 24;

function hsl(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((value) => value / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h < 0 ? h + 360 : h, s, l];
}

export function colorFamily(hex: string): FamilyKey {
  const [h, s, l] = hsl(hex);
  if (s < 0.12 || l >= 0.95 || l < 0.1) return 'neutral';
  if (h >= 15 && h < 68) return l < 0.45 ? 'brown' : 'yellow';
  if (h >= 68 && h < 160) return 'green';
  if (h >= 160 && h < 255) return 'blue';
  if (h >= 255 && h < 290) return 'purple';
  return l >= 0.72 ? 'pink' : h >= 290 && h < 330 ? 'purple' : 'red';
}

/** 等间距取样，不足时原样返回（品牌色板按色号排序，取前 N 个只会是一片同色系）。 */
export function sampleStrip(colors: readonly string[], slots = STRIP_SLOTS): string[] {
  if (colors.length <= slots) return [...colors];
  return Array.from({ length: slots }, (_, index) => colors[Math.floor((index * colors.length) / slots)]);
}

export function builtinCards(): BuiltinCard[] {
  return listBuiltinPalettes().map((summary) => {
    const full = getBuiltinPalette(summary.id);
    return {
      id: summary.id,
      name: summary.label,
      count: summary.engineColorCount,
      specs: paletteSizes({ kind: 'builtin', brand: summary.id }).split(' / ').filter(Boolean),
      strip: sampleStrip(full.engineColors.map((color) => color.hex)),
    };
  });
}

export function builtinSwatches(id: BuiltinPaletteId): Swatch[] {
  const s = zhCN.me.palettes;
  return getBuiltinPalette(id).colors.map((color, index) => {
    const hex = color.hex.slice(0, 7).toUpperCase();
    const displayOnly = Boolean(color.excludedReason);
    const name = color.excludedReason === 'transparent' ? s.transparent : displayOnly ? s.displayOnly : describeColorName(hex);
    return { key: `${color.code ?? ''}-${hex}-${index}`, code: color.code, hex, name, family: colorFamily(hex), displayOnly };
  });
}

export function customSwatches(colors: ReadonlyArray<{ code: string; hex: string }>): Swatch[] {
  return colors.map((color, index) => {
    const hex = color.hex.toUpperCase();
    return { key: `${color.code}-${hex}-${index}`, code: color.code, hex, name: describeColorName(hex), family: colorFamily(hex), displayOnly: false };
  });
}

/** 搜色号、颜色名或 HEX（带不带 # 都行）。 */
export function filterSwatches(list: readonly Swatch[], query: string, family: FamilyKey | 'all'): Swatch[] {
  const raw = query.trim();
  const q = raw.toLowerCase();
  const hex = q.replace(/^#/u, '');
  return list.filter((swatch) => (family === 'all' || swatch.family === family)
    && (!q || (swatch.code ?? '').toLowerCase().includes(q) || swatch.name.includes(raw) || (hex.length > 0 && swatch.hex.toLowerCase().includes(hex))));
}

/** 亮色块上的对勾用深墨，暗色块用白。 */
export function isLight(hex: string): boolean {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 168;
}
