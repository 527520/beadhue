'use client';

/**
 * 编辑器的外框件（原型 editor.js topHTML / toolsHTML / zoomHTML）：顶栏的设计名与保存状态、左工具栏（编辑 / 跟拼）、
 * 笔刷大小浮层、底部缩放胶囊（手机为右下角的精简版）。
 */
import { ArrowLeft, Check, CircleAlert, CircleCheck, CloudCheck, CloudOff, CloudUpload, Eraser, Grid2x2, Grid3x3, Hand, Hash, LoaderCircle, PaintBucket, Paintbrush, Pencil, Pipette, Replace, Scan, ZoomIn, ZoomOut } from 'lucide-react';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { cn } from '@/lib/cn';
import { IconButton } from '@/components/ui/icon-button';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { Popover, PopoverContent } from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';
import type { BrushSize } from '@/lib/editor/ops';
import type { PaletteColor } from '@/lib/types';
import type { CloudSaveState, SaveState } from './editor-model';
import { LIMITS } from '@/lib/appInfo';
import { zhCN } from '@/messages/zh-CN';
import { CODES_MIN_CELL, TOOL_KEYS, ZOOM_PRESETS, colorLabel, type EditorTool } from './editor-model';
import { BeadSwatch } from './editor-parts';
import type { StitchTool } from './stitch-model';

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

/** 保存状态；顶栏窄于 1024 时只留图标，手机「…」面板里（labelled）始终带文字。 */
export function SaveChip({ state, cloud, loggedIn, onRetry, labelled = false }: { state: SaveState; cloud: CloudSaveState; loggedIn: boolean; onRetry: () => void; labelled?: boolean }) {
  const s = t.save;
  const chip = cn('inline-flex h-8 items-center gap-1 rounded-full px-2 text-caption whitespace-nowrap text-ink-3 [&>svg]:size-4 [&>svg]:shrink-0', !labelled && 'max-lg:[&>span]:sr-only');
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
      <BrushMenu anchor={brushRef} open={brushOpen} onOpenChange={setBrushOpen} side="right" size={brushSize} onSize={onBrushSize} />
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

// ---------- 笔刷大小 ----------

const menuRowClass = 'flex min-h-9 w-full items-center gap-2.5 rounded-menu-item px-2.5 text-left text-body-sm text-ink hover:bg-bg-muted focus-visible:bg-bg-muted focus-visible:outline-none';

/**
 * 笔刷大小浮层（原型 brushMenu）：桌面在画笔右侧，手机在底部工具栏上方。
 * 手机多一项「连续绘制」：触屏默认精准模式（拖动对准、松手只改最终格），连续插值要在会话内显式开启（D5）。
 */
export function BrushMenu({ anchor, open, onOpenChange, side, size, onSize, continuous }: {
  anchor: RefObject<HTMLButtonElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side: 'right' | 'top';
  size: BrushSize;
  onSize: (size: BrushSize) => void;
  continuous?: { checked: boolean; onChange: (checked: boolean) => void };
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverContent anchor={anchor} side={side} align={side === 'top' ? 'end' : 'start'} className={cn('grid', continuous ? 'w-60' : 'w-50')}>
        <div role="menu" aria-label={t.brushSize} className="grid">
          <span className="px-2.5 pt-2 pb-1 text-caption text-ink-3">{t.brushSize}</span>
          {([1, 2, 3] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={size === option}
              onClick={() => {
                onSize(option);
                onOpenChange(false);
              }}
              className={menuRowClass}
            >
              <span aria-hidden="true" className="grid size-5 place-content-center gap-px" style={{ gridTemplateColumns: `repeat(${option}, 5px)` }}>
                {Array.from({ length: option * option }, (_, index) => <i key={index} className="size-1.25 bg-ink" />)}
              </span>
              <span className="flex-1">{t.brushOption(option)}</span>
              {size === option ? <Check aria-hidden="true" strokeWidth={1.75} className="size-4.5 text-ink" /> : null}
            </button>
          ))}
          {continuous ? (
            <>
              <span aria-hidden="true" className="mx-1 my-1.5 h-px bg-line" />
              <button type="button" role="menuitemcheckbox" aria-checked={continuous.checked} onClick={() => continuous.onChange(!continuous.checked)} className={cn(menuRowClass, 'min-h-11 py-1.5')}>
                <span className="grid flex-1">
                  <span>{t.mobile.continuous}</span>
                  <span className="text-caption font-normal text-ink-3">{continuous.checked ? t.mobile.continuousOn : t.mobile.continuousOff}</span>
                </span>
                {continuous.checked ? <Check aria-hidden="true" strokeWidth={1.75} className="size-4.5 text-ink" /> : null}
              </button>
            </>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------- 跟拼工具栏 ----------

const STITCH_TOOL_ICONS: Record<StitchTool, typeof Hand> = { browse: Hand, mark: CircleCheck };

/** 跟拼的左工具栏：浏览（H）/ 标记（M）（原型 STITCH_TOOLS）。 */
export function StitchToolRail({ tool, onTool }: { tool: StitchTool; onTool: (tool: StitchTool) => void }) {
  return (
    <nav aria-label={t.stitch.tools} className="relative z-15 flex flex-col items-center gap-1 border-r border-line bg-bg py-3">
      {([['browse', 'H'], ['mark', 'M']] as const).map(([id, key]) => {
        const Icon = STITCH_TOOL_ICONS[id];
        return (
          <IconButton key={id} label={t.stitch[id]} tooltip={`${t.stitch[id]} ${key}`} tooltipSide="right" aria-pressed={tool === id} onClick={() => onTool(id)}>
            <Icon aria-hidden="true" strokeWidth={1.75} />
          </IconButton>
        );
      })}
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
  /** 手机：右下角，只有缩放与适配（网格 / 板缝 / 色号在「…」面板里）。 */
  compact?: boolean;
}

export function ZoomPill({ percent, cellPx, onZoomIn, onZoomOut, onFit, onPreset, showGrid, showSeams, showCodes, onToggle, compact = false }: ZoomPillProps) {
  const svg = '[&_svg]:size-4.5';
  return (
    <div
      role="toolbar"
      aria-label={t.view}
      className={cn(
        'absolute z-10 flex items-center gap-0.5 rounded-full bg-bg p-1 shadow-float ring-1 ring-line',
        compact ? 'right-3 bottom-3' : 'bottom-4 left-1/2 -translate-x-1/2',
      )}
    >
      <IconButton size="sm" label={t.zoomOut} tooltip={t.zoomOutTip} tooltipSide="top" onClick={onZoomOut} className={svg}>
        <ZoomOut aria-hidden="true" strokeWidth={1.75} />
      </IconButton>
      <Menu>
        <MenuTrigger aria-label={t.zoomPct(percent)} className={cn('h-8 rounded-full text-caption font-semibold text-ink tabular-nums hover:bg-bg-muted focus-visible:focus-ring', compact ? 'min-w-12' : 'min-w-14')}>
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
      {compact ? null : (
        <>
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
        </>
      )}
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
