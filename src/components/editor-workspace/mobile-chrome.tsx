'use client';

/**
 * 手机编辑器的外框件：
 * 顶栏「返回 ｜ 编辑 / 跟拼 ｜ 撤销 重做 ｜ …」，底部工具栏（5 个工具 + 当前色）与最近用色条，
 * 跟拼的进度胶囊、浏览 / 标记切换与「上一行 ｜ 完成本行 ｜ 下一行」，以及底部面板的外壳。
 */
import { Check, ChevronDown, ChevronRight, Ellipsis, Eraser, Hand, PaintBucket, Paintbrush, Pipette, Redo2, Undo2 } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IconButton } from '@/components/ui/icon-button';
import { menuItemClass } from '@/components/ui/menu';
import { SegmentedControl } from '@/components/ui/tabs';
import type { BrushSize } from '@/lib/editor/ops';
import type { PaletteColor, Pattern } from '@/lib/types';
import { zhCN } from '@/messages/zh-CN';
import { colorLabel, sameColor, type EditorMode, type EditorTool } from './editor-model';
import { BeadSwatch } from './editor-parts';
import { RowRuns } from './panel-stitch';
import type { StitchTool } from './stitch-model';
import type { StitchSession } from './use-stitch-session';
import { BackButton, BrushMenu } from './workspace-chrome';

const t = zhCN.editorWorkspace;

/** 底部面板里的菜单项：触屏 44px 高。 */
export const sheetItemClass = cn(menuItemClass, 'min-h-11 text-body hover:bg-bg-muted focus-visible:bg-bg-muted disabled:cursor-not-allowed disabled:text-ink-4 [&:disabled>svg]:text-ink-4');

export interface MobileTopBarProps {
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  onBack: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onMore: () => void;
}

export function MobileTopBar({ mode, onModeChange, onBack, canUndo, canRedo, onUndo, onRedo, onMore }: MobileTopBarProps) {
  return (
    <header className="relative z-20 grid grid-cols-[minmax(0,1fr)_auto_minmax(max-content,1fr)] items-center gap-2 border-b border-line bg-bg px-2">
      <div className="flex min-w-0 items-center">
        <BackButton onBack={onBack} />
      </div>
      <SegmentedControl<EditorMode>
        label={t.mode}
        value={mode}
        onValueChange={onModeChange}
        items={[{ value: 'edit', label: t.modeEdit }, { value: 'stitch', label: t.modeStitch }]}
        className="[&>*]:px-4"
      />
      <div className="flex items-center justify-end">
        <IconButton label={t.undo} tooltip={false} disabled={!canUndo} onClick={onUndo}>
          <Undo2 aria-hidden="true" strokeWidth={1.75} />
        </IconButton>
        <IconButton label={t.redo} tooltip={false} disabled={!canRedo} onClick={onRedo}>
          <Redo2 aria-hidden="true" strokeWidth={1.75} />
        </IconButton>
        <IconButton label={t.more} tooltip={false} aria-haspopup="dialog" onClick={onMore}>
          <Ellipsis aria-hidden="true" strokeWidth={1.75} />
        </IconButton>
      </div>
    </header>
  );
}

const MOBILE_TOOLS: ReadonlyArray<[EditorTool, typeof Hand]> = [
  ['hand', Hand],
  ['brush', Paintbrush],
  ['eraser', Eraser],
  ['fill', PaintBucket],
  ['pick', Pipette],
];

export interface MobileEditBarProps {
  tool: EditorTool;
  onTool: (tool: EditorTool) => void;
  brushSize: BrushSize;
  onBrushSize: (size: BrushSize) => void;
  continuous: boolean;
  onContinuous: (on: boolean) => void;
  color: PaletteColor | null;
  recent: readonly PaletteColor[];
  onPickRecent: (color: PaletteColor) => void;
  onOpenColors: () => void;
}

/** 编辑模式的底部：最近用色条 + 5 个工具与当前色块。 */
export function MobileEditBar({ tool, onTool, brushSize, onBrushSize, continuous, onContinuous, color, recent, onPickRecent, onOpenColors }: MobileEditBarProps) {
  const brushRef = useRef<HTMLButtonElement>(null);
  const [brushOpen, setBrushOpen] = useState(false);
  return (
    <div className="border-t border-line bg-bg pb-safe">
      <div className="scrollbar-none flex h-13 items-center gap-2 overflow-x-auto px-4">
        <span className="mr-1 shrink-0 text-caption text-ink-3">{t.mobile.recent}</span>
        {recent.map((entry) => {
          const pressed = sameColor(entry, color);
          return (
            <button
              key={`${entry.code}-${entry.hex}`}
              type="button"
              aria-pressed={pressed}
              aria-label={colorLabel(entry)}
              onClick={() => onPickRecent(entry)}
              className="grid size-10 shrink-0 place-items-center rounded-full focus-visible:focus-ring"
            >
              <BeadSwatch hex={entry.hex} size="lg" className={pressed ? 'ring-2 ring-ink ring-offset-2 ring-offset-bg' : undefined} />
            </button>
          );
        })}
        <Chip className="ml-auto pr-2" aria-label={t.mobile.allColors} onClick={onOpenColors}>
          {t.mobile.all}
          <ChevronRight aria-hidden="true" strokeWidth={1.75} />
        </Chip>
      </div>
      <div role="toolbar" aria-label={t.tools} className="grid h-16 grid-cols-6 items-center justify-items-center px-2">
        {MOBILE_TOOLS.map(([id, Icon]) => (
          <IconButton
            key={id}
            ref={id === 'brush' ? brushRef : undefined}
            size="lg"
            label={t.tool[id]}
            tooltip={false}
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
            ) : null}
          </IconButton>
        ))}
        <button type="button" aria-label={t.mobile.currentColor(colorLabel(color))} onClick={onOpenColors} className="grid size-12 place-items-center rounded-full focus-visible:focus-ring">
          <BeadSwatch hex={color?.hex} className="size-8 ring-2 ring-ink ring-offset-2 ring-offset-bg" />
        </button>
      </div>
      <BrushMenu
        anchor={brushRef}
        open={brushOpen}
        onOpenChange={setBrushOpen}
        side="top"
        size={brushSize}
        onSize={onBrushSize}
        continuous={{ checked: continuous, onChange: onContinuous }}
      />
    </div>
  );
}

export interface MobileStitchBarProps {
  pattern: Pattern;
  session: StitchSession;
  onComplete: () => void;
}

/** 跟拼模式的底部：当前行颜色序列 + 「上一行 ｜ 完成本行 ｜ 下一行」。 */
export function MobileStitchBar({ pattern, session, onComplete }: MobileStitchBarProps) {
  const s = t.stitch;
  const { row } = session;
  return (
    <div className="border-t border-line bg-bg pb-safe">
      <div className="scrollbar-none flex h-13 items-center gap-2 overflow-x-auto px-4">
        {!session.ready ? (
          <span className="text-caption font-normal text-ink-3">{s.unavailable}</span>
        ) : row ? (
          <>
            <span className="mr-1 shrink-0 text-caption text-ink-3 tabular-nums">{s.rowShort(row.local + 1)}</span>
            <RowRuns pattern={pattern} row={row} strip />
          </>
        ) : (
          <span className="text-caption font-normal text-ink-3">{s.noRows}</span>
        )}
      </div>
      <div className="grid h-16 grid-cols-[1fr_1.4fr_1fr] items-center gap-2 px-3">
        <Button className="h-control-lg w-full px-2" disabled={!session.ready || session.rowIndex <= 0} onClick={() => session.goRow(session.rowIndex - 1)}>
          {s.prev}
        </Button>
        <Button className="h-control-lg w-full px-2" variant={session.rowDone ? 'secondary' : 'primary'} disabled={!session.ready || !row} onClick={onComplete}>
          {session.rowDone ? <Undo2 aria-hidden="true" strokeWidth={1.75} /> : <Check aria-hidden="true" strokeWidth={1.75} />}
          {session.rowDone ? s.undoCompleteShort : s.complete}
        </Button>
        <Button className="h-control-lg w-full px-2" disabled={!session.ready || !row || session.rowIndex >= session.rows.length - 1} onClick={() => session.goRow(session.rowIndex + 1)}>
          {s.next}
        </Button>
      </div>
    </div>
  );
}

/** 跟拼顶部的进度胶囊：点开「跟拼进度」底部面板。 */
export function ProgressCapsule({ session, onOpen }: { session: StitchSession; onOpen: () => void }) {
  const s = t.stitch;
  const { row } = session;
  return (
    <div className="pointer-events-none absolute inset-x-3 top-2 z-10 flex justify-center">
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={onOpen}
        className="pointer-events-auto inline-flex h-9 max-w-full items-center gap-2 rounded-full bg-bg px-3 text-body-sm whitespace-nowrap text-ink-2 shadow-float ring-1 ring-line focus-visible:focus-ring [&>svg]:size-4 [&>svg]:shrink-0"
      >
        <b className="font-bold text-ink tabular-nums">{session.stats.percent}%</b>
        <span className="truncate">{row ? s.capsule(row.board + 1, row.local + 1) : s.noRows}</span>
        <ChevronDown aria-hidden="true" strokeWidth={1.75} />
      </button>
    </div>
  );
}

/** 跟拼手势（浏览 / 标记）：手机浮在画布左下。 */
export function StitchToolSwitch({ tool, onTool, className }: { tool: StitchTool; onTool: (tool: StitchTool) => void; className?: string }) {
  return (
    <SegmentedControl<StitchTool>
      label={t.stitch.gesture}
      value={tool}
      onValueChange={onTool}
      items={[{ value: 'browse', label: t.stitch.browse }, { value: 'mark', label: t.stitch.mark }]}
      className={cn('shadow-float ring-1 ring-line', className)}
    />
  );
}

/** 底部面板外壳（手机上 Dialog 自动变底部面板）：只在打开时挂载内容。 */
export function EditorSheet({ open, onOpenChange, title, children, bodyClassName }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; children: ReactNode; bodyClassName?: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="truncate">{title}</DialogTitle>
          </DialogHeader>
          <DialogBody className={cn('pb-6', bodyClassName)}>{children}</DialogBody>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
