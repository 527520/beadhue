'use client';

import { Grid2x2, Grid3x3, Hash, Maximize2, Minimize2, Scan, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Pattern } from '@/lib/types';
import { cn } from '@/lib/cn';
import { drawPattern, devicePixelRatioCap, type BeadMode } from '@/lib/render/beads';
import { BEAD_TOKENS, VIEWER_TOKENS } from '@/lib/render/beadTokens';
import {
  CANVAS_FONT_MONO, CANVAS_FONT_SANS, CODE_MIN, CODE_ZOOM, boardCount, clampOffset, cropPattern, drawBoardSeams, drawCellCodes,
  drawGridLines, gridVisible, nextZoomStop, visibleBox, zoomLimits, type GridSetting,
} from '@/lib/render/viewer';
import { zhCN } from '@/messages/zh-CN';
import { Tooltip } from '@/components/ui/tooltip';
import { useIsMobile } from '@/components/ui/use-media-query';

const t = zhCN.detail.viewer;
/** 舞台宽度 ≥600 时工具显示文字，更窄只留图标。 */
const WIDE_STAGE = 600;

export interface ViewSettings {
  mode: BeadMode;
  grid: GridSetting;
  codes: boolean;
  seams: boolean;
  /** 打开色号时自动切到方格；关色号时切回豆粒。 */
  autoFlat: boolean;
}
export const DEFAULT_VIEW: ViewSettings = { mode: 'bead', grid: 'auto', codes: false, seams: false, autoFlat: false };

/** 登录后有完整图纸；未登录只有服务端豆粒大图（D53 / D67）。 */
export type ViewerSource = { kind: 'pattern'; pattern: Pattern } | { kind: 'image'; src: string; imageCell: number };

export interface PatternViewerProps {
  source: ViewerSource;
  width: number;
  height: number;
  boardCols: number;
  boardRows: number;
  title: string;
  colorCount: number;
  view: ViewSettings;
  onViewChange: (next: ViewSettings) => void;
  full?: boolean;
  onFull?: () => void;
  onExit?: () => void;
  /** 未登录点了锁住的色号 / 方格。 */
  onLocked?: () => void;
  onSingleBoard?: () => void;
  className?: string;
}

interface ToolbarState { pct: number; canOut: boolean; canIn: boolean; gridOn: boolean; wide: boolean; hint: string }

interface Controller {
  fit(): void;
  step(dir: 1 | -1): void;
  zoomTo(cell: number): void;
  cell(): number;
  schedule(): void;
}

const toolClass = cn(
  'inline-flex h-control-sm shrink-0 items-center justify-center rounded-full text-footnote leading-none font-semibold text-ink-2 select-none',
  'transition-colors duration-state ease-standard hover:bg-bg-muted focus-visible:focus-ring',
  'aria-pressed:bg-ink aria-pressed:text-on-ink aria-pressed:hover:bg-ink',
  'aria-disabled:cursor-not-allowed aria-disabled:text-ink-4 aria-disabled:hover:bg-transparent',
);
const iconToolClass = cn(toolClass, 'size-control-sm [&_svg]:size-4.5');

function Sep() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-line max-md:hidden" />;
}

function Tip({ content, show, children }: { content: ReactNode; show: boolean; children: React.ReactElement }) {
  return <Tooltip content={content} side="top" disabled={!show}>{children}</Tooltip>;
}

/** 开关类工具（网格、色号、板块）：宽舞台显示文字，窄舞台只留图标；锁住时仍可点，点了说明原因。 */
function ToggleTool({ label, icon, pressed, onClick, lock, desk, wide }: { label: string; icon: ReactNode; pressed: boolean; onClick: () => void; lock?: string; desk?: boolean; wide: boolean }) {
  return (
    <Tip content={lock ?? label} show={Boolean(lock) || !wide}>
      <button
        type="button"
        aria-pressed={pressed}
        aria-label={label}
        aria-disabled={lock ? true : undefined}
        onClick={onClick}
        className={cn(toolClass, wide ? 'px-3' : 'w-control-sm [&_svg]:size-4.5', desk && 'max-md:hidden')}
      >
        {wide ? label : icon}
      </button>
    </Tip>
  );
}

function IconTool({ label, icon, onClick, disabled, desk }: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean; desk?: boolean }) {
  return (
    <Tip content={label} show>
      <button type="button" aria-label={label} aria-disabled={disabled || undefined} onClick={() => { if (!disabled) onClick(); }} className={cn(iconToolClass, desk && 'max-md:hidden')}>
        {icon}
      </button>
    </Tip>
  );
}

/**
 * 图纸查看器：中性舞台、豆粒 / 方格、按钮 / 滚轮 / 双指 / 双击 / 键盘缩放平移，
 * 放大到每格 ≥14px 自动出现网格，方格且每格 ≥18px 才画色号；工具条浮在舞台内。页面与全屏共用显示偏好。
 */
export function PatternViewer(props: PatternViewerProps) {
  const { source, width, height, boardCols, boardRows, title, colorCount, view, onViewChange, full = false, onFull, onExit, onLocked, onSingleBoard, className } = props;
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const controller = useRef<Controller | null>(null);
  const viewRef = useRef(view);
  const mobile = useIsMobile();
  const compactRef = useRef(false);
  useEffect(() => {
    compactRef.current = mobile && !full;
    controller.current?.schedule();
  }, [mobile, full]);
  const keysId = useId();
  const guest = source.kind === 'image';
  const boards = boardCount(width, height, boardCols, boardRows);
  const [bar, setBar] = useState<ToolbarState>({ pct: 100, canOut: true, canIn: true, gridOn: false, wide: true, hint: '' });

  useEffect(() => {
    viewRef.current = view;
    controller.current?.schedule();
  }, [view]);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const toolbar = toolbarRef.current;
    const g = canvas?.getContext('2d');
    if (!stage || !canvas || !toolbar || !g) return;
    const pattern = source.kind === 'pattern' ? source.pattern : null;
    const image = source.kind === 'image' ? new Image() : null;
    const imageCell = source.kind === 'image' ? source.imageCell : undefined;
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    let W = 0; let H = 0; let dpr = 1; let fitCell = 1; let cell = 1; let ox = 0; let oy = 0;
    let atFit = true; let frame = 0; let flashText = ''; let flashTimer = 0; let wheelHinted = false; let reserve = true;

    const area = (withToolbar = reserve) => {
      const pad = compactRef.current ? 12 : 24;
      const bottom = withToolbar ? H - toolbar.offsetTop + (compactRef.current ? 8 : 12) : pad;
      return { x: pad, y: pad, w: Math.max(1, W - pad * 2), h: Math.max(1, H - pad - bottom) };
    };
    // 手机迷你工具条在右下角，只有会压住豆子时才给它让出位置；游客看的是整张图片、判断不了哪里有豆，一律让出。
    const coversBeads = (a: ReturnType<typeof area>) => {
      if (!pattern) return true;
      const size = Math.min(a.w / width, a.h / height);
      const x = a.x + (a.w - width * size) / 2;
      const y = a.y + (a.h - height * size) / 2;
      const c0 = Math.max(0, Math.floor((toolbar.offsetLeft - 4 - x) / size));
      const c1 = Math.min(width - 1, Math.floor((toolbar.offsetLeft + toolbar.offsetWidth + 4 - x) / size));
      const r0 = Math.max(0, Math.floor((toolbar.offsetTop - 4 - y) / size));
      const r1 = Math.min(height - 1, Math.floor((toolbar.offsetTop + toolbar.offsetHeight + 4 - y) / size));
      for (let row = r0; row <= r1; row += 1) {
        for (let col = c0; col <= c1; col += 1) {
          const item = pattern.cells[row * width + col];
          if (item && !item.transparent && !item.external && item.hex) return true;
        }
      }
      return false;
    };
    const measure = () => {
      W = stage.clientWidth;
      H = stage.clientHeight;
      dpr = devicePixelRatioCap();
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
      reserve = !compactRef.current || coversBeads(area(false));
      const a = area();
      fitCell = Math.max(0.5, Math.min(a.w / width, a.h / height));
    };
    const limits = () => zoomLimits(fitCell, imageCell);
    const pannable = () => { const a = area(); return width * cell > a.w + 0.5 || height * cell > a.h + 0.5; };
    const clamp = () => { ({ x: ox, y: oy } = clampOffset({ x: ox, y: oy }, { w: width * cell, h: height * cell }, area())); };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
    const zoomAt = (next: number, px?: number, py?: number) => {
      const a = area();
      const cx = px ?? a.x + a.w / 2;
      const cy = py ?? a.y + a.h / 2;
      const { min, max } = limits();
      const target = Math.min(max, Math.max(min, next));
      ox = cx - ((cx - ox) * target) / cell;
      oy = cy - ((cy - oy) * target) / cell;
      cell = target;
      atFit = Math.abs(cell - fitCell) < 0.001;
      clamp();
      schedule();
    };
    const fit = () => { cell = fitCell; atFit = true; clamp(); schedule(); };
    const sync = () => {
      const current = viewRef.current;
      const { min, max } = limits();
      const codesOn = current.codes && current.mode === 'flat' && !guest;
      const next: ToolbarState = {
        pct: Math.round((cell / fitCell) * 100),
        canOut: cell > min + 0.001,
        canIn: cell < max - 0.001,
        gridOn: gridVisible(current.grid, cell),
        wide: W >= WIDE_STAGE,
        hint: flashText || (codesOn && cell < CODE_MIN ? t.zoomForCodes : ''),
      };
      setBar((prev) => (Object.keys(next) as Array<keyof ToolbarState>).every((key) => prev[key] === next[key]) ? prev : next);
      const canPan = pannable();
      stage.dataset.pannable = canPan ? 'true' : 'false';
      stage.style.touchAction = canPan ? 'none' : 'pan-y';
    };
    function draw() {
      frame = 0;
      const current = viewRef.current;
      g!.setTransform(dpr, 0, 0, dpr, 0, 0);
      g!.clearRect(0, 0, W, H);
      const box = visibleBox({ width, height }, ox, oy, cell, W, H);
      if (box.c1 > box.c0 && box.r1 > box.r0) {
        g!.save();
        g!.shadowColor = VIEWER_TOKENS.boardShadow;
        g!.shadowBlur = 20;
        g!.shadowOffsetY = 4;
        g!.fillStyle = BEAD_TOKENS.board;
        g!.fillRect(ox, oy, width * cell, height * cell);
        g!.restore();
        if (pattern) {
          drawPattern(g!, cropPattern(pattern, box), { x: ox + box.c0 * cell, y: oy + box.r0 * cell, cell, mode: current.mode });
        } else if (image?.complete && image.naturalWidth) {
          g!.imageSmoothingEnabled = true;
          g!.imageSmoothingQuality = 'high';
          g!.drawImage(image, ox, oy, width * cell, height * cell);
        }
        if (gridVisible(current.grid, cell)) drawGridLines(g!, { x: ox, y: oy, cell, box, alpha: current.mode === 'bead' || !pattern ? 0.06 : 0.16, dpr });
        if (current.seams && boards > 1) drawBoardSeams(g!, { width, height, cols: boardCols, rows: boardRows, x: ox, y: oy, cell, font: CANVAS_FONT_SANS });
        if (pattern && current.codes && current.mode === 'flat' && cell >= CODE_MIN) drawCellCodes(g!, pattern, { x: ox, y: oy, cell, box, font: CANVAS_FONT_MONO });
      }
      sync();
    }
    const flash = (text: string) => {
      flashText = text;
      window.clearTimeout(flashTimer);
      flashTimer = window.setTimeout(() => { flashText = ''; sync(); }, 1800);
      sync();
    };

    // 拖动平移、双指缩放。
    const pointers = new Map<number, { x: number; y: number }>();
    let drag: { x: number; y: number; ox: number; oy: number } | null = null;
    let pinch: { dist: number; cell: number; mid: { x: number; y: number } } | null = null;
    const local = (event: { clientX: number; clientY: number }) => { const rect = stage.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
    const middle = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const begin = () => {
      const points = [...pointers.values()];
      if (points.length >= 2) {
        const [a, b] = points;
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, cell, mid: middle(a, b) };
        drag = null;
      } else if (points.length === 1) {
        drag = { ...points[0], ox, oy };
        pinch = null;
      } else {
        drag = null;
        pinch = null;
      }
    };
    const onDown = (event: PointerEvent) => {
      if ((event.target as Element).closest('[data-viewer-toolbar]') || (event.pointerType === 'mouse' && event.button !== 0)) return;
      stage.setPointerCapture?.(event.pointerId);
      pointers.set(event.pointerId, local(event));
      begin();
    };
    const onMove = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, local(event));
      const points = [...pointers.values()];
      if (pinch && points.length >= 2) {
        const [a, b] = points;
        const mid = middle(a, b);
        ox += mid.x - pinch.mid.x;
        oy += mid.y - pinch.mid.y;
        pinch.mid = mid;
        zoomAt(pinch.cell * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.dist), mid.x, mid.y);
      } else if (drag) {
        const [point] = points;
        ox = drag.ox + point.x - drag.x;
        oy = drag.oy + point.y - drag.y;
        if (Math.hypot(point.x - drag.x, point.y - drag.y) > 3) stage.dataset.panning = 'true';
        clamp();
        schedule();
      }
    };
    const onUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      delete stage.dataset.panning;
      begin();
    };
    // 滚轮：按住 Ctrl / ⌘（含触控板双指捏合）缩放；页面里普通滚动交还给页面，全屏里用来平移。
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const point = local(event);
        zoomAt(cell * Math.exp(-Math.max(-60, Math.min(60, event.deltaY)) * 0.01), point.x, point.y);
        return;
      }
      if (full && pannable()) {
        event.preventDefault();
        ox -= event.deltaX;
        oy -= event.deltaY;
        clamp();
        schedule();
        return;
      }
      if (!wheelHinted) { wheelHinted = true; flash(t.wheelHint(mac ? '⌘' : 'Ctrl')); }
    };
    const onDblClick = (event: MouseEvent) => {
      if ((event.target as Element).closest('[data-viewer-toolbar]')) return;
      const point = local(event);
      if (cell >= limits().max - 0.001) fit(); else zoomAt(cell * 2, point.x, point.y);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.target !== stage) return;
      const pan = ({ ArrowLeft: [48, 0], ArrowRight: [-48, 0], ArrowUp: [0, 48], ArrowDown: [0, -48] } as Record<string, [number, number]>)[event.key];
      if (pan) { event.preventDefault(); ox += pan[0]; oy += pan[1]; clamp(); schedule(); return; }
      const step = (dir: 1 | -1) => { const next = nextZoomStop(cell, fitCell, dir); if (next) zoomAt(next); };
      if (event.key === '+' || event.key === '=') { event.preventDefault(); step(1); }
      if (event.key === '-' || event.key === '_') { event.preventDefault(); step(-1); }
      if (event.key === '0') { event.preventDefault(); fit(); }
    };
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('dblclick', onDblClick);
    stage.addEventListener('keydown', onKey);

    // 尺寸变化：原本适配就重新适配，否则保持视野中心那一格不动。
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      const before = area();
      const cx = (before.x + before.w / 2 - ox) / cell;
      const cy = (before.y + before.h / 2 - oy) / cell;
      measure();
      if (atFit) cell = fitCell;
      else {
        const { min, max } = limits();
        cell = Math.min(max, Math.max(min, cell));
        const a = area();
        ox = a.x + a.w / 2 - cx * cell;
        oy = a.y + a.h / 2 - cy * cell;
      }
      clamp();
      draw();
    });
    measure();
    fit();
    draw();
    observer?.observe(stage);
    if (image && source.kind === 'image') {
      image.decoding = 'async';
      image.onload = () => schedule();
      image.src = source.src;
    }
    controller.current = {
      fit,
      step: (dir) => { const next = nextZoomStop(cell, fitCell, dir); if (next) zoomAt(next); },
      zoomTo: (next) => zoomAt(next),
      cell: () => cell,
      schedule,
    };
    return () => {
      observer?.disconnect();
      cancelAnimationFrame(frame);
      window.clearTimeout(flashTimer);
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerup', onUp);
      stage.removeEventListener('pointercancel', onUp);
      stage.removeEventListener('wheel', onWheel);
      stage.removeEventListener('dblclick', onDblClick);
      stage.removeEventListener('keydown', onKey);
      if (image) image.onload = null;
      controller.current = null;
    };
  }, [source, width, height, boardCols, boardRows, boards, full, guest, mobile]);

  const setView = (patch: Partial<ViewSettings>) => onViewChange({ ...view, ...patch });
  const toggleCodes = () => {
    if (guest) { onLocked?.(); return; }
    if (!view.codes) {
      // 色号只画在方格上：从豆粒切过去，并放大到读得清的格宽。
      setView({ codes: true, ...(view.mode !== 'flat' ? { mode: 'flat', autoFlat: true } : {}) });
      if ((controller.current?.cell() ?? CODE_ZOOM) < CODE_ZOOM) controller.current?.zoomTo(CODE_ZOOM);
    } else {
      setView({ codes: false, ...(view.autoFlat ? { mode: 'bead', autoFlat: false } : {}) });
    }
  };
  const setMode = (mode: BeadMode) => {
    if (mode === 'flat' && guest) { onLocked?.(); return; }
    setView({ mode, autoFlat: false, ...(mode === 'bead' ? { codes: false } : {}) });
  };
  const zoomOut = () => controller.current?.step(-1);
  const zoomIn = () => controller.current?.step(1);
  const fitView = () => controller.current?.fit();
  const toggleSeams = () => (boards > 1 ? setView({ seams: !view.seams }) : onSingleBoard?.());
  const iconProps = { 'aria-hidden': true, strokeWidth: 1.75 } as const;
  const codesPressed = view.codes && !guest;

  return (
    <div
      ref={stageRef}
      tabIndex={0}
      role="region"
      aria-label={t.region}
      aria-describedby={keysId}
      data-slot="pattern-viewer"
      className={cn(
        'relative w-full touch-pan-y overflow-hidden bg-bg-subtle outline-none select-none focus-visible:focus-ring data-[pannable=true]:cursor-grab data-[panning=true]:cursor-grabbing',
        full ? 'min-h-0 flex-1 rounded-lg' : 'aspect-square rounded-xl md:max-h-viewer-stage md:min-h-100 max-md:rounded-none',
        className,
      )}
    >
      <canvas ref={canvasRef} role="img" aria-label={t.canvas(title, width, height, colorCount)} className="absolute inset-0 size-full" />
      <p className="sr-only" id={keysId}>{t.keys}</p>
      {bar.hint ? (
        <p role="status" className="pointer-events-none absolute top-3 left-1/2 z-2 max-w-inset-bar -translate-x-1/2 truncate rounded-full bg-bg px-3 py-1 text-caption text-ink-2 shadow-float ring-1 ring-line animate-fade-in">
          {bar.hint}
        </p>
      ) : null}
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label={t.toolbar}
        data-viewer-toolbar=""
        className={cn(
          'absolute z-2 flex items-center gap-0.5 rounded-full bg-bg p-1 whitespace-nowrap shadow-float ring-1 ring-line',
          full ? 'bottom-4 left-1/2 -translate-x-1/2' : 'bottom-4 left-1/2 -translate-x-1/2 max-md:right-3 max-md:bottom-3 max-md:left-auto max-md:translate-x-0',
        )}
      >
        <IconTool label={t.zoomOut} icon={<ZoomOut {...iconProps} />} onClick={zoomOut} disabled={!bar.canOut} />
        <output className="min-w-11 text-center text-caption text-ink-2 tabular-nums max-md:hidden">{bar.pct}%</output>
        <IconTool label={t.zoomIn} icon={<ZoomIn {...iconProps} />} onClick={zoomIn} disabled={!bar.canIn} />
        <IconTool label={t.fit} icon={<Scan {...iconProps} />} onClick={fitView} />
        <Sep />
        <ToggleTool label={t.grid} icon={<Grid3x3 {...iconProps} />} pressed={bar.gridOn} onClick={() => setView({ grid: bar.gridOn ? 'off' : 'on' })} wide={bar.wide} />
        <ToggleTool label={t.codes} icon={<Hash {...iconProps} />} pressed={codesPressed} onClick={toggleCodes} lock={guest ? t.codesLocked : undefined} wide={bar.wide} />
        <ToggleTool label={t.seams} icon={<Grid2x2 {...iconProps} />} pressed={view.seams && boards > 1} onClick={toggleSeams} lock={boards > 1 ? undefined : t.singleBoard} desk wide={bar.wide} />
        <Sep />
        <div role="group" aria-label={t.mode} className="inline-flex gap-0.5 rounded-full bg-bg-muted p-0.5 max-md:hidden">
          {(['bead', 'flat'] as const).map((mode) => {
            const locked = mode === 'flat' && guest;
            const button = (
              <button
                key={mode}
                type="button"
                aria-pressed={view.mode === mode}
                aria-disabled={locked || undefined}
                onClick={() => setMode(mode)}
                className={cn(
                  'inline-flex h-7 items-center rounded-full px-3 text-footnote leading-none font-semibold text-ink-3 transition-[background-color,color,box-shadow] duration-state ease-standard hover:text-ink focus-visible:focus-ring',
                  'aria-pressed:bg-bg aria-pressed:text-ink aria-pressed:shadow-seg aria-disabled:cursor-not-allowed aria-disabled:text-ink-4 aria-disabled:hover:text-ink-4',
                )}
              >
                {mode === 'bead' ? t.bead : t.flat}
              </button>
            );
            return locked ? <Tip key={mode} content={t.flatLocked} show>{button}</Tip> : button;
          })}
        </div>
        <Sep />
        {full
          ? <IconTool label={t.exit} icon={<Minimize2 {...iconProps} />} onClick={() => onExit?.()} desk />
          : <IconTool label={t.full} icon={<Maximize2 {...iconProps} />} onClick={() => onFull?.()} desk />}
      </div>
    </div>
  );
}
