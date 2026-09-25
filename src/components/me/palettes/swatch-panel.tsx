'use client';

import { Check } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { zhCN } from '@/messages/zh-CN';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchField } from '@/components/ui/search-field';
import { FAMILY_KEYS, filterSwatches, isLight, type FamilyKey, type Swatch } from './palette-model';

const s = zhCN.me.palettes;

/** 色带：12 列豆粒，不足 24 颗时补空钉。 */
export function PaletteStrip({ colors, slots = 24 }: { colors: readonly string[]; slots?: number }) {
  return (
    <div aria-hidden="true" className="grid grid-cols-12 gap-1 rounded-md bg-bg-subtle p-3">
      {colors.slice(0, slots).map((hex, index) => (
        <i key={index} className="relative aspect-square rounded-full inset-ring-1 inset-ring-ink/10 after:absolute after:inset-bead-hole after:rounded-full after:bg-bg/66 after:content-['']" style={{ backgroundColor: hex }} />
      ))}
      {Array.from({ length: Math.max(0, slots - colors.length) }, (_, index) => (
        <i key={`hole-${index}`} className="relative aspect-square after:absolute after:inset-peg-hole after:rounded-full after:bg-line-strong after:content-['']" />
      ))}
    </div>
  );
}

function SwatchBody({ swatch, selectable }: { swatch: Swatch; selectable: boolean }) {
  return (
    <>
      <span className={cn('grid aspect-4/3 place-items-center rounded-md inset-ring-1 inset-ring-ink/8 transition-shadow duration-state', isLight(swatch.hex) ? 'text-ink' : 'text-on-ink')} style={{ backgroundColor: swatch.hex }}>
        {selectable ? <Check aria-hidden="true" strokeWidth={2.5} className="size-5.5 scale-60 opacity-0 transition-[opacity,scale] duration-state group-aria-pressed/swatch:scale-100 group-aria-pressed/swatch:opacity-100" /> : null}
      </span>
      <span className="flex min-w-0 items-baseline gap-1 text-caption text-ink-2">
        <b className="shrink-0 font-mono font-semibold text-ink">{swatch.code ?? s.unidentified}</b>
        <span className="truncate font-normal">{swatch.name}</span>
      </span>
      <span className="font-mono text-caption font-normal text-ink-3">{swatch.hex}</span>
    </>
  );
}

export interface SwatchPanelProps {
  swatches: readonly Swatch[];
  label: string;
  /** 可选模式：点色块切换选中（新建 / 编辑色板）。 */
  selected?: ReadonlySet<string>;
  onToggle?: (swatch: Swatch) => void;
  keyOf?: (swatch: Swatch) => string;
  /** 色块网格之前的内容（其他颜色等）。 */
  footer?: ReactNode;
}

/** 可搜索的色块面板：搜色号 / 名称 / HEX，按色系筛选；工具行吸顶。 */
export function SwatchPanel({ swatches, label, selected, onToggle, keyOf = (swatch) => swatch.key, footer }: SwatchPanelProps) {
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState<FamilyKey | 'all'>('all');
  const families = useMemo(() => FAMILY_KEYS.filter((key) => swatches.some((swatch) => swatch.family === key)), [swatches]);
  const shown = filterSwatches(swatches, query, family);
  const selectable = Boolean(onToggle);
  return (
    <div className="grid gap-3">
      <div className="sticky -top-1 z-1 -mx-6 grid gap-3 bg-bg px-6 pt-2 pb-3 max-md:-mx-5 max-md:px-5">
        <SearchField value={query} onValueChange={setQuery} placeholder={s.searchLabel} aria-label={s.searchLabel} autoComplete="off" wrapperClassName="h-control-md pl-4" className="text-body-sm" />
        {families.length > 1 ? (
          <div role="group" aria-label={s.familyGroup} className="-mx-6 flex gap-2 overflow-x-auto px-6 [scrollbar-width:none] max-md:-mx-5 max-md:px-5 [&::-webkit-scrollbar]:hidden">
            <Chip selected={family === 'all'} onClick={() => setFamily('all')}>{s.allFamilies}</Chip>
            {families.map((key) => <Chip key={key} selected={family === key} onClick={() => setFamily(key)}>{s.families[key]}</Chip>)}
          </div>
        ) : null}
      </div>
      {footer}
      {shown.length ? (
        <ul aria-label={label} className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-x-3 gap-y-4 pt-1 max-md:grid-cols-[repeat(auto-fill,minmax(88px,1fr))]">
          {shown.map((swatch) => (
            <li key={swatch.key} className="min-w-0">
              {selectable ? (
                <button type="button" aria-pressed={selected?.has(keyOf(swatch)) ?? false} aria-label={`${swatch.code ?? s.unidentified} ${swatch.name}`} onClick={() => onToggle?.(swatch)} className="group/swatch grid w-full min-w-0 gap-1 rounded-md text-left focus-visible:focus-ring [&>span:first-child]:hover:ring-2 [&>span:first-child]:hover:ring-line-strong [&>span:first-child]:hover:ring-offset-2 aria-pressed:[&>span:first-child]:ring-2 aria-pressed:[&>span:first-child]:ring-ink aria-pressed:[&>span:first-child]:ring-offset-2">
                  <SwatchBody swatch={swatch} selectable />
                </button>
              ) : (
                <div className="grid min-w-0 gap-1" title={swatch.displayOnly ? s.displayOnly : undefined}>
                  <SwatchBody swatch={swatch} selectable={false} />
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact kind="search" title={s.noSwatch(query.trim())} description={s.noSwatchText} actions={<Button onClick={() => { setQuery(''); setFamily('all'); }}>{s.clearSearch}</Button>} />
      )}
    </div>
  );
}
