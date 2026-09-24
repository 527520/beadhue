'use client';

/**
 * 右面板「颜色」（原型 editor/panels.js colorsPanel）：当前色、色板选择、图纸用色（颗数、点选即用、替换、高亮）、全部颜色搜索。
 */
import { Eye, Replace, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import { PalettePicker } from '@/components/create/choice-pickers';
import type { PaletteChoice } from '@/components/create/palette-choices';
import { IconButton } from '@/components/ui/icon-button';
import { menuItemClass } from '@/components/ui/menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';
import type { PaletteColor, PatternStatsItem } from '@/lib/types';
import { zhCN } from '@/messages/zh-CN';
import { colorLabel, colorName, formatCount, matchesColorQuery, sameColor } from './editor-model';
import { BeadSwatch, PanelSection, SectionTitle } from './editor-parts';

export interface ColorsPanelProps {
  color: PaletteColor | null;
  onColor: (color: PaletteColor) => void;
  palette: readonly PaletteColor[];
  paletteChoices: readonly PaletteChoice[];
  paletteValue: string;
  onPalette: (value: string) => void;
  paletteDisabled?: boolean;
  paletteNotice?: string | null;
  stats: readonly PatternStatsItem[];
  highlight: PaletteColor | null;
  onHighlight: (color: PaletteColor | null) => void;
  onReplace: (fromCode: string, target: PaletteColor | null) => void;
  disabled?: boolean;
}

function CurrentColor({ color }: { color: PaletteColor | null }) {
  const t = zhCN.editorWorkspace.colors;
  return (
    <div className="flex items-center gap-3" aria-live="polite">
      <BeadSwatch hex={color?.hex} size="xl" />
      <div className="grid min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2 text-title-3 text-ink">
          <b className="font-mono">{color?.code ?? '—'}</b>
          <span className="truncate">{color ? colorName(color.hex) : zhCN.editorWorkspace.emptyCell}</span>
        </div>
        <span className="mt-0.5 font-mono text-caption text-ink-3">{color?.hex ?? ''}</span>
      </div>
      <span className="text-caption text-ink-3">{t.current}</span>
    </div>
  );
}

function ReplaceMenu({ from, color, palette, onReplace, disabled }: { from: PatternStatsItem; color: PaletteColor | null; palette: readonly PaletteColor[]; onReplace: ColorsPanelProps['onReplace']; disabled?: boolean }) {
  const t = zhCN.editorWorkspace.colors;
  const [open, setOpen] = useState(false);
  const label = colorLabel(from);
  const pick = (target: PaletteColor | null) => {
    setOpen(false);
    onReplace(from.code, target);
  };
  const others = palette.filter((entry) => !sameColor(entry, from));
  return (
    <Popover open={open} onOpenChange={setOpen} sheetTitle={t.replaceFrom(label)}>
      <Tooltip content={t.replace}>
        <PopoverTrigger disabled={disabled} aria-label={t.replaceAria(label)} className="inline-grid size-control-sm place-items-center rounded-full text-ink hover:bg-bg-emphasis focus-visible:focus-ring disabled:text-ink-4 [&>svg]:size-4">
          <Replace aria-hidden="true" strokeWidth={1.75} />
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="end" className="grid w-75 gap-0.5">
        <p className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 text-body-sm text-ink-2">
          <BeadSwatch hex={from.hex} size="sm" />
          {t.replaceFrom(label)}
        </p>
        {color && !sameColor(color, from) ? (
          <button type="button" className={cn(menuItemClass, 'hover:bg-bg-muted')} onClick={() => pick(color)}>
            <BeadSwatch hex={color.hex} size="sm" />
            {t.replaceCurrent(colorLabel(color))}
          </button>
        ) : null}
        <button type="button" className={cn(menuItemClass, 'hover:bg-bg-muted')} onClick={() => pick(null)}>
          <BeadSwatch hex={null} size="sm" />
          {t.replaceClear}
        </button>
        <div className="mx-1 my-1.5 h-px bg-line" />
        <span className="px-2.5 pb-1 text-caption text-ink-3">{t.replaceOther}</span>
        <div className="grid max-h-popover-list grid-cols-[repeat(auto-fill,minmax(24px,1fr))] gap-1.5 overflow-y-auto px-1.5 pb-1.5">
          {others.map((entry) => (
            <Tooltip key={`${entry.code}-${entry.hex}`} content={colorLabel(entry)} side="top">
              <button type="button" aria-label={colorLabel(entry)} onClick={() => pick(entry)} className="aspect-square rounded-full transition-transform duration-press hover:scale-108 focus-visible:focus-ring">
                <BeadSwatch hex={entry.hex} className="size-full" />
              </button>
            </Tooltip>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ColorsPanel({ color, onColor, palette, paletteChoices, paletteValue, onPalette, paletteDisabled, paletteNotice, stats, highlight, onHighlight, onReplace, disabled }: ColorsPanelProps) {
  const t = zhCN.editorWorkspace.colors;
  const [query, setQuery] = useState('');
  const matches = useMemo(() => palette.filter((entry) => matchesColorQuery(entry, query)), [palette, query]);
  return (
    <>
      <PanelSection>
        <CurrentColor color={color} />
        <PalettePicker choices={paletteChoices} value={paletteValue} onChange={onPalette} disabled={paletteDisabled || disabled} label={t.palette} />
        {paletteNotice ? <p className="text-caption font-normal text-ink-3">{paletteNotice}</p> : null}
      </PanelSection>
      <PanelSection>
        <SectionTitle count={stats.length}>{t.used}</SectionTitle>
        {stats.length === 0 ? (
          <p className="text-body-sm text-ink-3">{t.empty}</p>
        ) : (
          <ul className="-mx-2 grid gap-0.5">
            {stats.map((item) => {
              const entry = { hex: item.hex, code: item.code };
              const label = colorLabel(entry);
              const current = sameColor(color, entry);
              const lit = sameColor(highlight, entry);
              return (
                <li key={`${item.code}-${item.hex}`} className="group relative rounded-md">
                  <button
                    type="button"
                    aria-pressed={current}
                    aria-label={t.useAria(label, item.count)}
                    onClick={() => onColor(entry)}
                    className={cn(
                      'grid h-9 w-full grid-cols-[auto_40px_minmax(0,1fr)_auto] items-center gap-2 rounded-md pr-3 pl-2 text-left text-body-sm text-ink-2 hover:bg-bg-muted focus-visible:focus-ring group-focus-within:bg-bg-muted',
                      current && 'bg-bg-muted font-semibold text-ink',
                    )}
                  >
                    <BeadSwatch hex={item.hex} size="sm" className={current ? 'ring-2 ring-ink ring-offset-2 ring-offset-bg' : undefined} />
                    <span className="truncate font-mono text-caption text-ink">{item.code}</span>
                    <span className="truncate">{colorName(item.hex)}</span>
                    <span className={cn('text-ink-3 tabular-nums group-focus-within:invisible group-hover:invisible', lit && 'invisible')}>{formatCount(item.count)}</span>
                  </button>
                  <span className={cn('absolute top-0.5 right-0.5 hidden rounded-md bg-bg-muted group-focus-within:flex group-hover:flex', lit && 'flex')}>
                    <ReplaceMenu from={item} color={color} palette={palette} onReplace={onReplace} disabled={disabled} />
                    <IconButton
                      size="sm"
                      label={t.highlightAria(label)}
                      tooltip={lit ? t.unhighlight : t.highlight}
                      aria-pressed={lit}
                      className="hover:bg-bg-emphasis [&_svg]:size-4"
                      onClick={() => onHighlight(lit ? null : entry)}
                    >
                      <Eye aria-hidden="true" strokeWidth={1.75} />
                    </IconButton>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </PanelSection>
      <PanelSection>
        <SectionTitle>{t.all}</SectionTitle>
        <label className="flex h-control-md items-center gap-2 rounded-md border border-line-strong px-3 text-ink-3 transition-[border-color,box-shadow] duration-state focus-within:border-accent focus-within:shadow-field-focus [&>svg]:size-4">
          <Search aria-hidden="true" strokeWidth={1.75} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.search}
            aria-label={t.search}
            className="h-full min-w-0 flex-1 bg-transparent text-body-sm text-ink outline-none placeholder:text-ink-4"
          />
        </label>
        {matches.length === 0 ? (
          <p className="text-body-sm text-ink-3">{t.noMatch(query)}</p>
        ) : (
          <div role="group" aria-label={t.all} className="grid grid-cols-[repeat(auto-fill,minmax(28px,1fr))] gap-2">
            {matches.map((entry) => {
              const pressed = sameColor(color, entry);
              return (
                <Tooltip key={`${entry.code}-${entry.hex}`} content={colorLabel(entry)} side="top">
                  <button
                    type="button"
                    aria-label={colorLabel(entry)}
                    aria-pressed={pressed}
                    onClick={() => onColor(entry)}
                    className={cn('relative aspect-square rounded-full transition-transform duration-press hover:scale-108 focus-visible:focus-ring', pressed && 'ring-2 ring-ink ring-offset-2 ring-offset-bg')}
                  >
                    <BeadSwatch hex={entry.hex} className="size-full" />
                  </button>
                </Tooltip>
              );
            })}
          </div>
        )}
      </PanelSection>
    </>
  );
}
