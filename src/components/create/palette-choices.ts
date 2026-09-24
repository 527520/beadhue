/**
 * 色板与制作规格的选项数据：创作弹窗与编辑器（票 08）共用。
 * 选项值沿用工作台的约定：内置 `builtin:<id>`，云端自定义 `custom:<id>`。
 */
import {
  BOARD_PROFILE_IDS,
  compatibleBoardProfilesForPalette,
  defaultBoardProfileForPalette,
  getBoardProfile,
  type BoardProfileId,
} from '@/lib/boardProfiles';
import { getBuiltinPalette, isBuiltinPaletteId, listBuiltinPalettes } from '@/lib/palettes';
import type { PaletteColor, ProjectPalette } from '@/lib/types';
import { zhCN } from '@/messages/zh-CN';

export interface CloudPalette {
  id: string;
  name: string;
  colors: PaletteColor[];
}

export interface PaletteChoice {
  value: string;
  name: string;
  /** 「291 色 · 5mm」 */
  meta: string;
  /** 色带预览用的少量颜色。 */
  band: readonly string[];
  palette: ProjectPalette;
  colors: readonly PaletteColor[];
}

export interface SpecChoice {
  id: BoardProfileId;
  label: string;
  /** 每块底板格数，或当前色板不支持时的原因。 */
  meta: string;
  disabled: boolean;
}

const BAND_SIZE = 8;

function bandOf(colors: readonly PaletteColor[]): string[] {
  if (colors.length <= BAND_SIZE) return colors.map((color) => color.hex);
  const step = colors.length / BAND_SIZE;
  return Array.from({ length: BAND_SIZE }, (_, index) => colors[Math.floor(index * step + step / 2)].hex);
}

/** 色板适用的豆径，例如「5mm」「2.6mm」「5mm / 2.6mm」。 */
export function paletteSizes(palette: ProjectPalette): string {
  return [...new Set(compatibleBoardProfilesForPalette(palette).map((profile) => `${profile.beadDiameterMm}mm`))].join(' / ');
}

export function buildPaletteChoices(cloud: readonly CloudPalette[] = []): PaletteChoice[] {
  const t = zhCN.create;
  const builtin = listBuiltinPalettes().map((summary): PaletteChoice => {
    const full = getBuiltinPalette(summary.id);
    const palette: ProjectPalette = { kind: 'builtin', brand: summary.id };
    return {
      value: `builtin:${summary.id}`,
      name: summary.label,
      meta: t.paletteMeta(summary.engineColorCount, paletteSizes(palette)),
      band: bandOf(full.engineColors),
      palette,
      colors: full.engineColors,
    };
  });
  const custom = cloud.map((entry): PaletteChoice => {
    const palette: ProjectPalette = {
      kind: 'custom',
      colors: entry.colors.map((color) => ({ code: color.code ?? '', hex: color.hex })),
    };
    return {
      value: `custom:${entry.id}`,
      name: t.myPalette(entry.name),
      meta: t.paletteMeta(entry.colors.length, paletteSizes(palette)),
      band: bandOf(entry.colors),
      palette,
      colors: entry.colors,
    };
  });
  return [...builtin, ...custom];
}

export function findPaletteChoice(choices: readonly PaletteChoice[], value: string): PaletteChoice | undefined {
  return choices.find((choice) => choice.value === value);
}

export function builtinPaletteValue(id: string): string | null {
  return isBuiltinPaletteId(id) ? `builtin:${id}` : null;
}

export function specChoices(palette: ProjectPalette, paletteName: string): SpecChoice[] {
  const compatible = new Set(compatibleBoardProfilesForPalette(palette).map((profile) => profile.id));
  return BOARD_PROFILE_IDS.map((id) => {
    const profile = getBoardProfile(id);
    const disabled = !compatible.has(id);
    return {
      id,
      label: profile.displayName,
      meta: disabled ? zhCN.create.specBlocked(paletteName, paletteSizes(palette)) : zhCN.create.specMeta(profile.boardCols, profile.boardRows),
      disabled,
    };
  });
}

/** 换色板时原子地换到兼容规格；返回新规格与需要给用户的说明（未改动时为空串）。 */
export function fitSpec(choice: PaletteChoice, current: BoardProfileId): { spec: BoardProfileId; note: string } {
  const spec = defaultBoardProfileForPalette(choice.palette, current);
  return {
    spec,
    note: spec === current ? '' : zhCN.create.specAdjusted(choice.name, paletteSizes(choice.palette), getBoardProfile(spec).displayName),
  };
}
