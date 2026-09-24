'use client';

/**
 * 编辑器的外框件（原型 editor.js topHTML / toolsHTML / zoomHTML）：顶栏的设计名与保存状态、左工具栏、底部缩放胶囊。
 */
import { ArrowLeft, Check, CircleAlert, CloudCheck, CloudOff, CloudUpload, Eraser, Grid2x2, Grid3x3, Hand, Hash, LoaderCircle, PaintBucket, Paintbrush, Pencil, Pipette, Replace, Scan, ZoomIn, ZoomOut } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { IconButton } from '@/components/ui/icon-button';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { Popover, PopoverContent } from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';
import type { BrushSize } from '@/lib/editor/ops';
import type { PaletteColor } from '@/lib/types';
import type { CloudSaveState, SaveState } from '@/components/workbench/SaveStatus';
import { LIMITS } from '@/lib/appInfo';
import { zhCN } from '@/messages/zh-CN';
import { CODES_MIN_CELL, TOOL_KEYS, ZOOM_PRESETS, colorLabel, type EditorTool } from './editor-model';
import { BeadSwatch } from './editor-parts';

const t = zhCN.editorWorkspace;

export function VerticalRule({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('mx-2 h-5 w-px shrink-0 bg-line', className)} />;
}

// ---------- 设计名 ----------

/** 设计名：看起来是标题，点一下就能改（输入框按内容自适应宽度）；Enter 确认、Esc 还原。 */
export function DesignName({ name, onRename, onRenamed }: { name: string; onRename: (name: string) => void; onRenamed: () => void }) {
  const before = useRef(name);
  const shown = name || zhCN.project.unnamed;
  return (
    <label className="group relative inline-grid max-w-80 min-w-0 items-center max-lg:max-w-45">
      <span aria-hidden="true" className="invisible col-start-1 row-start-1 truncate px-2 pr-7 text-title-3 whitespace-pre">{shown}</span>
      <input
        value={name}
        size={1}
        maxLength={LIMITS.designNameLength}
        placeholder={zhCN.project.unnamed}
        aria-label={t.nameLabel}
        title={t.rename}
        onFocus={(event) => {
          before.current = name;
          event.currentTarget.select();
        }}
        onChange={(event) => onRename(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            event.stopPropagation();
            onRename(before.current);
            requestAnimationFrame(() => (event.target as HTMLInputElement).blur());
          }
        }}
        onBlur={() => {
          if (name.trim() && name !== before.current) onRenamed();
        }}
        className="col-start-1 row-start-1 h-control-md w-full min-w-0 truncate rounded-md bg-transparent px-2 pr-7 text-title-3 text-ink outline-none placeholder:text-ink-4 hover:bg-bg-muted focus:bg-bg focus:shadow-field-focus focus:ring-1 focus:ring-accent"
      />
      <Pencil aria-hidden="true" strokeWidth={1.75} className="pointer-events-none absolute right-2 size-4 text-ink-3 opacity-0 transition-opacity duration-state group-hover:opacity-100 group-focus-within:opacity-0" />
    </label>
  );
}

// ---------- 保存状态 ----------

export function SaveChip({ state, cloud, loggedIn, onRetry }: { state: SaveState; cloud: CloudSaveState; loggedIn: boolean; onRetry: () => void }) {
  const s = t.save;
  const chip = 'inline-flex h-8 items-center gap-1 rounded-full px-2 text-caption whitespace-nowrap text-ink-3 [&>svg]:size-4 [&>svg]:shrink-0 max-lg:[&>span]:sr-only';
  let body: ReactNode;
  if (state === 'error' || state === 'quota') {
    body = (
      <Tooltip content={state === 'quota' ? s.quotaTip : s.failedTip}>
        <button type="button" onClick={onRetry} className={cn(chip, 'text-danger hover:bg-danger-soft focus-visible:focus-ring')}>
          <CircleAlert aria-hidden="true" strokeWidth={1.75} />
          <span>{s.failed}</span>
        </button>
      </Tooltip>
    );
  } else {
    const [icon, text, tip] =
      state === 'unavailable' ? [CircleAlert, s.unavailable, s.unavailableTip]
        : state === 'saving' || state === 'dirty' ? [LoaderCircle, s.saving, s.saving]
          : !loggedIn ? [CloudOff, s.localOnly, s.guestTip]
            : cloud === 'synced' ? [CloudCheck, s.saved, s.savedTip]
              : cloud === 'syncing' ? [CloudUpload, s.syncing, s.syncingTip]
                : [CloudOff, s.localOnly, s.unsyncedTip];
    const Icon = icon;
    body = (
      <Tooltip content={tip}>
        <span tabIndex={0} className={cn(chip, 'focus-visible:focus-ring', state === 'unavailable' && 'text-danger')}>
          <Icon aria-hidden="true" strokeWidth={1.75} className={Icon === LoaderCircle ? 'animate-spinner' : undefined} />
          <span>{text}</span>
        </span>
      </Tooltip>
    );
  }
  return <span role="status" aria-live="polite" className="flex shrink-0">{body}</span>;
}

// ---------- 左工具栏 ----------

const TOOL_ICONS: Record<EditorTool, typeof Hand> = { hand: Hand, brush: Paintbrush, eraser: Eraser, fill: PaintBucket, pick: Pipette, replace: Replace };

export interface ToolRailProps {
  tool: EditorTool;
  onTool: (tool: EditorTool) => void;
  brushSize: BrushSize;
  onBrushSize: (size: BrushSize) => void;
  color: PaletteColor | null;
  /** 右面板收起时在工具栏底部显示当前色，点开颜色面板。 */
  showColor: boolean;
  onShowColors: () => void;
}

export function ToolRail({ tool, onTool, brushSize, onBrushSize, color, showColor, onShowColors }: ToolRailProps) {
  const brushRef = useRef<HTMLButtonElement>(null);
  const [brushOpen, setBrushOpen] = useState(false);
  const button = (id: EditorTool, key: string) => {
    const Icon = TOOL_ICONS[id];
    const label = t.tool[id];
    return (
      <IconButton
        key={id}
        ref={id === 'brush' ? brushRef : undefined}
        label={label}
        tooltip={`${label} ${key}`}
        tooltipSide="right"
        aria-pressed={tool === id}
        aria-haspopup={id === 'brush' ? 'menu' : undefined}
        onClick={() => {
          if (id === 'brush' && tool === 'brush') setBrushOpen(true);
          else onTool(id);
        }}
        className="relative"
      >
        <Icon aria-hidden="true" strokeWidth={1.75} />
        {id === 'brush' && brushSize > 1 ? (
          <span className="absolute right-0 bottom-0 h-4 min-w-4 rounded-full bg-bg px-0.75 text-caption leading-4 text-ink tabular-nums ring-1 ring-line-strong">{brushSize}</span>
        ) : id === 'brush' ? (
          <span aria-hidden="true" className="absolute right-1.5 bottom-1.5 size-0 border-3 border-transparent border-r-current border-b-current opacity-55" />
        ) : null}
      </IconButton>
    );
  };
  const [hand, ...draw] = TOOL_KEYS;
  return (
    <nav aria-label={t.tools} className="relative z-15 flex flex-col items-center gap-1 border-r border-line bg-bg py-3">
      {button(hand[0], hand[1])}
      <span aria-hidden="true" className="my-1 h-px w-6 bg-line" />
      {draw.map(([id, key]) => button(id, key))}
      <Popover open={brushOpen} onOpenChange={setBrushOpen}>
        <PopoverContent anchor={brushRef} side="right" align="start" className="grid w-50">
          <div role="menu" aria-label={t.brushSize} className="grid">
            <span className="px-2.5 pt-2 pb-1 text-caption text-ink-3">{t.brushSize}</span>
            {([1, 2, 3] as const).map((size) => (
              <button
                key={size}
                type="button"
                role="menuitemradio"
                aria-checked={brushSize === size}
                onClick={() => {
                  onBrushSize(size);
                  setBrushOpen(false);
                }}
                className="flex min-h-9 w-full items-center gap-2.5 rounded-menu-item px-2.5 text-left text-body-sm text-ink hover:bg-bg-muted focus-visible:bg-bg-muted focus-visible:outline-none"
              >
                <span aria-hidden="true" className="grid size-5 place-content-center gap-px" style={{ gridTemplateColumns: `repeat(${size}, 5px)` }}>
                  {Array.from({ length: size * size }, (_, index) => <i key={index} className="size-1.25 bg-ink" />)}
                </span>
                <span className="flex-1">{t.brushOption(size)}</span>
                {brushSize === size ? <Check aria-hidden="true" strokeWidth={1.75} className="size-4.5 text-ink" /> : null}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      {showColor ? (
        <>
          <span className="flex-1" />
          <Tooltip content={t.currentColorTip(colorLabel(color))} side="right">
            <button type="button" aria-label={t.currentColorTool(colorLabel(color))} onClick={onShowColors} className="grid size-control-md place-items-center rounded-full hover:bg-bg-muted focus-visible:focus-ring">
              <BeadSwatch hex={color?.hex} />
            </button>
          </Tooltip>
        </>
      ) : null}
    </nav>
  );
}

// ---------- 缩放胶囊 ----------

export interface ZoomPillProps {
  percent: number;
  cellPx: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onPreset: (percent: number) => void;
  showGrid: boolean;
  showSeams: boolean;
  showCodes: boolean;
  onToggle: (key: 'grid' | 'seams' | 'codes') => void;
}

export function ZoomPill({ percent, cellPx, onZoomIn, onZoomOut, onFit, onPreset, showGrid, showSeams, showCodes, onToggle }: ZoomPillProps) {
  const svg = '[&_svg]:size-4.5';
  return (
    <div role="toolbar" aria-label={t.view} className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-bg p-1 shadow-float ring-1 ring-line">
      <IconButton size="sm" label={t.zoomOut} tooltip={t.zoomOutTip} tooltipSide="top" onClick={onZoomOut} className={svg}>
        <ZoomOut aria-hidden="true" strokeWidth={1.75} />
      </IconButton>
      <Menu>
        <MenuTrigger aria-label={t.zoomPct(percent)} className="h-8 min-w-14 rounded-full text-caption font-semibold text-ink tabular-nums hover:bg-bg-muted focus-visible:focus-ring">
          {percent}%
        </MenuTrigger>
        <MenuContent side="top" align="center">
          <MenuItem icon={<Scan aria-hidden="true" strokeWidth={1.75} />} trail="0" onClick={onFit}>{t.fit}</MenuItem>
          <MenuSeparator />
          {ZOOM_PRESETS.map((value) => (
            <MenuItem key={value} onClick={() => onPreset(value)} trail={percent === value ? <Check aria-hidden="true" strokeWidth={1.75} className="size-4.5 text-ink" /> : undefined}>
              {value}%
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
      <IconButton size="sm" label={t.zoomIn} tooltip={t.zoomInTip} tooltipSide="top" onClick={onZoomIn} className={svg}>
        <ZoomIn aria-hidden="true" strokeWidth={1.75} />
      </IconButton>
      <IconButton size="sm" label={t.fit} tooltip={t.fitTip} tooltipSide="top" onClick={onFit} className={svg}>
        <Scan aria-hidden="true" strokeWidth={1.75} />
      </IconButton>
      <VerticalRule className="mx-1" />
      <IconButton size="sm" label={t.grid} tooltipSide="top" aria-pressed={showGrid} onClick={() => onToggle('grid')} className={svg}>
        <Grid3x3 aria-hidden="true" strokeWidth={1.75} />
      </IconButton>
      <IconButton size="sm" label={t.seams} tooltipSide="top" aria-pressed={showSeams} onClick={() => onToggle('seams')} className={svg}>
        <Grid2x2 aria-hidden="true" strokeWidth={1.75} />
      </IconButton>
      <IconButton size="sm" label={t.codes} tooltip={cellPx >= CODES_MIN_CELL ? t.codes : t.codesHiddenTip} tooltipSide="top" aria-pressed={showCodes} onClick={() => onToggle('codes')} className={svg}>
        <Hash aria-hidden="true" strokeWidth={1.75} />
      </IconButton>
    </div>
  );
}

export function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <IconButton label={t.back} onClick={onBack}>
      <ArrowLeft aria-hidden="true" strokeWidth={1.75} />
    </IconButton>
  );
}
