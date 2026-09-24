'use client';

import { Eraser } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { motifPattern } from '@/app/dev/ui/motifs';
import { cn } from '@/lib/cn';
import { parseTagIcon, TAG_ICON_KEYS } from '@/lib/community/tagIcon';
import { BEAD_SAMPLE_COLORS } from '@/lib/render/beadTokens';
import type { Pattern } from '@/lib/types';
import { zhCN } from '@/messages/zh-CN';
import { PixelIcon } from '@/components/ui/bead-image';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormAlert } from '@/components/ui/field';
import { SegmentedControl } from '@/components/ui/tabs';

const t = zhCN.adminUi.tags.pixels;

/** 标签图标取值 → 像素图案：内置键用原型同名图案（13 格），px: 编码按格还原。 */
export function tagIconPattern(value: string | null | undefined): Pattern | null {
  const icon = parseTagIcon(value);
  if (!icon) return null;
  if (icon.kind === 'builtin') return motifPattern(icon.key, 13);
  return { width: icon.width, height: icon.height, cells: icon.cells.map((index) => (index === null ? { hex: null, code: null, transparent: true } : { hex: icon.palette[index], code: null, transparent: false })) };
}

/** 类目像素小图标；没有图标时画一块浅底占位。 */
export function TagIcon({ value, className, alt }: { value: string | null | undefined; className?: string; alt?: string }) {
  const pattern = useMemo(() => tagIconPattern(value), [value]);
  if (!pattern) return <span aria-hidden="true" className={cn('size-6 rounded-sm bg-bg-muted', className)} />;
  return <PixelIcon pattern={pattern} alt={alt} className={cn('size-6', className)} />;
}

export const BUILTIN_ICONS = TAG_ICON_KEYS;

/** 编辑器的 8 种豆色（取自豆色数据，编码时只保留用到的颜色）。 */
const PALETTE = (['K', 'R', 'O', 'Y', 'G', 'B', 'V', 'P'] as const).map((key) => BEAD_SAMPLE_COLORS[key]);
const SIZES = [8, 12, 16] as const;

/** 像素格 → `px:<宽>x<高>:<HEX>…:<格>`（lib/community/tagIcon 的紧凑编码）。 */
export function encodePixels(size: number, cells: Array<string | null>): string | null {
  const used = [...new Set(cells.filter((cell): cell is string => Boolean(cell)))];
  if (!used.length || used.length > 8) return null;
  const body = cells.map((cell) => (cell ? String(used.indexOf(cell) + 1) : '.')).join('');
  return `px:${size}x${size}:${used.map((hex) => hex.replace('#', '').toUpperCase()).join('.')}:${body}`;
}

function decode(value: string | null | undefined): { size: number; cells: Array<string | null> } {
  const icon = parseTagIcon(value);
  if (icon?.kind === 'pixels' && icon.width === icon.height && (SIZES as readonly number[]).includes(icon.width)) {
    return { size: icon.width, cells: icon.cells.map((index) => (index === null ? null : icon.palette[index])) };
  }
  return { size: 12, cells: Array(144).fill(null) };
}

/** 像素图标编辑器（ticket 10：标签 icon 可自定义）：点按 / 拖动涂色，橡皮，8 / 12 / 16 格。 */
export function PixelEditorDialog({ open, onOpenChange, value, onApply }: { open: boolean; onOpenChange: (open: boolean) => void; value: string | null; onApply: (value: string) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <PixelEditor value={value} onApply={(next) => { onApply(next); onOpenChange(false); }} onCancel={() => onOpenChange(false)} /> : null}
    </Dialog>
  );
}

function PixelEditor({ value, onApply, onCancel }: { value: string | null; onApply: (value: string) => void; onCancel: () => void }) {
  const initial = useMemo(() => decode(value), [value]);
  const [size, setSize] = useState(initial.size);
  const [cells, setCells] = useState<Array<string | null>>(initial.cells);
  const [color, setColor] = useState<string | null>(PALETTE[1]);
  const [error, setError] = useState(false);
  const painting = useRef(false);
  const paint = (index: number) => setCells((current) => (current[index] === color ? current : current.map((cell, i) => (i === index ? color : cell))));
  const resize = (next: number) => {
    setSize(next);
    setCells(Array.from({ length: next * next }, (_, index) => {
      const x = index % next; const y = Math.floor(index / next);
      return x < size && y < size ? cells[y * size + x] : null;
    }));
  };
  const preview = encodePixels(size, cells);
  return (
    <DialogContent size="md" aria-label={t.title}>
      <DialogHeader><DialogTitle>{t.title}</DialogTitle></DialogHeader>
      <DialogBody className="grid gap-4">
        <p className="text-body-sm text-ink-3">{t.hint}</p>
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl label={t.size} value={String(size)} onValueChange={(next) => resize(Number(next))} items={SIZES.map((n) => ({ value: String(n), label: t.sizeOption(n) }))} />
          <div role="radiogroup" aria-label={t.color} className="flex flex-wrap items-center gap-1.5">
            {PALETTE.map((hex, index) => (
              <button key={hex} type="button" role="radio" aria-checked={color === hex} aria-label={`${t.color} ${index + 1}`} onClick={() => setColor(hex)}
                className="size-7 rounded-full inset-ring-1 inset-ring-ink/10 focus-visible:focus-ring aria-checked:ring-2 aria-checked:ring-ink aria-checked:ring-offset-2" style={{ backgroundColor: hex }} />
            ))}
            <button type="button" role="radio" aria-checked={color === null} aria-label={t.eraser} onClick={() => setColor(null)}
              className="grid size-7 place-items-center rounded-full bg-bg-muted text-ink-2 focus-visible:focus-ring aria-checked:ring-2 aria-checked:ring-ink aria-checked:ring-offset-2 [&>svg]:size-4">
              <Eraser aria-hidden="true" strokeWidth={1.75} />
            </button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setCells(Array(size * size).fill(null))}>{t.clear}</Button>
        </div>
        <div className="flex items-start gap-5 max-md:flex-col">
          <div role="grid" aria-label={t.grid} className="grid aspect-square w-full max-w-80 touch-none gap-px rounded-md bg-line p-px select-none"
            style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
            onPointerUp={() => { painting.current = false; }} onPointerLeave={() => { painting.current = false; }}>
            {cells.map((cell, index) => (
              <button key={index} type="button" tabIndex={index === 0 ? 0 : -1} aria-label={t.cell((index % size) + 1, Math.floor(index / size) + 1)}
                onPointerDown={(event) => { event.preventDefault(); painting.current = true; paint(index); setError(false); }}
                onPointerEnter={() => { if (painting.current) paint(index); }}
                onKeyDown={(event) => {
                  const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: size, ArrowUp: -size };
                  if (event.key in moves) { event.preventDefault(); (event.currentTarget.parentElement?.children[Math.min(cells.length - 1, Math.max(0, index + moves[event.key]))] as HTMLElement | undefined)?.focus(); }
                  if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); paint(index); }
                }}
                className={cn('aspect-square focus-visible:relative focus-visible:z-1 focus-visible:focus-ring', !cell && 'bg-bg')}
                style={cell ? { backgroundColor: cell } : undefined} />
            ))}
          </div>
          <div className="grid justify-items-center gap-2 rounded-md bg-bg-subtle p-4">
            {preview ? <TagIcon value={preview} className="size-12" /> : <span className="size-12 rounded-sm bg-bg-muted" />}
          </div>
        </div>
        {error ? <FormAlert>{t.empty}</FormAlert> : null}
      </DialogBody>
      <DialogFooter>
        <Button onClick={onCancel}>{zhCN.adminUi.tags.form.cancel}</Button>
        <Button variant="primary" onClick={() => { if (preview) onApply(preview); else setError(true); }}>{t.apply}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
