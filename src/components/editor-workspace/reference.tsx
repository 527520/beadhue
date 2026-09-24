'use client';

/**
 * 原图参照（原型 editor/reference.js + BeadHue 几何）：画布右上角的胶囊，点开是可拖动、可缩放、可折叠的浮窗，
 * 单向跟随画布显示同一范围（画布变 → 参照变；拖动参照窗不影响画布）。
 * 没有可靠的原图对应关系时胶囊变成黄色提示，点开说明原因并提供「选择原图」，不猜、不遮挡画布。
 */
import { ChevronDown, ChevronUp, GripVertical, Image as ImageIcon, ImagePlus, TriangleAlert, X } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '@/lib/cn';
import { EDITOR_CANVAS } from '@/lib/render/beadTokens';
import { inverseMatrix, referenceFrame, type OriginalReference } from '@/lib/originals/geometry';
import type { GridCamera, GridViewportSize } from '@/lib/render/gridViewport';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { zhCN } from '@/messages/zh-CN';

export type ReferenceStatus = 'ready' | 'loading' | 'missing' | 'none';
export type MissingReason = 'local' | 'reuse' | 'blank';

export interface ReferenceBox {
  x: number | null;
  y: number | null;
  w: number;
  h: number;
  collapsed: boolean;
}

export const DEFAULT_REFERENCE_BOX: ReferenceBox = { x: null, y: null, w: 288, h: 240, collapsed: false };

const pillClass = 'inline-flex h-control-md items-center gap-2 rounded-full bg-bg pr-4 pl-1 text-body-sm font-semibold whitespace-nowrap text-ink shadow-float ring-1 ring-line transition-shadow duration-state hover:ring-ink-3 focus-visible:focus-ring [&>svg]:size-4 [&>svg]:shrink-0';

function useDpr() {
  return typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1);
}

/** 胶囊里的小圆图：原图裁剪区的中心。 */
function Thumb({ image, original }: { image: CanvasImageSource; original: OriginalReference }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = useDpr();
  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext('2d');
    const width = original.width ?? 0;
    const height = original.height ?? 0;
    if (!canvas || !g || !original.geometry || !width || !height) return;
    const px = Math.round(32 * dpr);
    canvas.width = px;
    canvas.height = px;
    const [a, b, c, d, e, f] = original.geometry;
    const xs = [e, a + e, c + e, a + c + e].map((value) => value * width);
    const ys = [f, b + f, d + f, b + d + f].map((value) => value * height);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const side = Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0);
    const cx = (x0 + Math.max(...xs)) / 2;
    const cy = (y0 + Math.max(...ys)) / 2;
    g.imageSmoothingQuality = 'high';
    try {
      g.drawImage(image, cx - side / 2, cy - side / 2, side, side, 0, 0, px, px);
    } catch {
      // 图片尚未解码完成时忽略，下一次渲染再画。
    }
  }, [dpr, image, original]);
  return <canvas ref={ref} aria-hidden="true" className="size-8 shrink-0 rounded-full bg-bg-muted" />;
}

export interface ReferencePillProps {
  status: ReferenceStatus;
  reason: MissingReason;
  open: boolean;
  image: CanvasImageSource | null;
  original?: OriginalReference;
  onToggle: () => void;
  onChooseSource: () => void;
  onFetchCommunity?: () => void;
  busy?: boolean;
}

export function ReferencePill({ status, reason, open, image, original, onToggle, onChooseSource, onFetchCommunity, busy }: ReferencePillProps) {
  const t = zhCN.editorWorkspace.reference;
  const [explain, setExplain] = useState(false);
  if (status === 'ready' || status === 'loading') {
    if (open && status === 'ready') return null;
    return (
      <button type="button" className={pillClass} aria-expanded={open} aria-label={t.open} onClick={onToggle} disabled={status === 'loading'}>
        {image && original ? <Thumb image={image} original={original} /> : <span className="ml-3 flex"><ImageIcon aria-hidden="true" strokeWidth={1.75} className="size-4" /></span>}
        <span>{status === 'loading' ? t.loading : t.pill}</span>
      </button>
    );
  }
  const warning = status === 'missing' || reason !== 'blank';
  return (
    <Popover open={explain} onOpenChange={setExplain} sheetTitle={warning ? t.missingPill : t.addPill}>
      <PopoverTrigger
        aria-haspopup="dialog"
        className={cn(pillClass, 'pl-3', warning && 'bg-warning-soft text-warning ring-warning/35 hover:ring-warning')}
      >
        {warning ? <TriangleAlert aria-hidden="true" strokeWidth={1.75} /> : <ImagePlus aria-hidden="true" strokeWidth={1.75} />}
        <span>{warning ? t.missingPill : t.addPill}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid max-w-measure justify-items-start gap-2 p-3">
        <h3 className="text-title-3 text-ink">{warning ? t.missingTitle : t.addTitle}</h3>
        <p className="text-body-sm text-ink-3">{warning ? `${t[reason === 'blank' ? 'local' : reason]}${t.follow}` : t.blank}</p>
        <div className="mt-1 flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => { setExplain(false); onChooseSource(); }}>
            <ImageIcon aria-hidden="true" strokeWidth={1.75} />
            {t.choose}
          </Button>
          {onFetchCommunity ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { setExplain(false); onFetchCommunity(); }}>
              {t.fetchCommunity}
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export interface ReferenceWindowProps {
  image: CanvasImageSource;
  original: OriginalReference & { geometry: NonNullable<OriginalReference['geometry']> };
  camera: GridCamera;
  viewport: GridViewportSize;
  patternWidth: number;
  patternHeight: number;
  box: ReferenceBox;
  onBoxChange: (box: ReferenceBox) => void;
  onClose: () => void;
}

const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));

/** 把浮窗限制在画布区内（原型 bindReferenceWindow.place）。 */
function placeBox(box: ReferenceBox, area: GridViewportSize): Required<{ [K in keyof ReferenceBox]: NonNullable<ReferenceBox[K]> }> {
  const w = clamp(box.w, 220, Math.max(220, Math.min(560, area.width - 24)));
  const h = clamp(box.h, 160, Math.max(160, Math.min(520, area.height - 24)));
  const x = clamp(box.x ?? area.width - w - 16, 8, Math.max(8, area.width - w - 8));
  const y = clamp(box.y ?? 16, 8, Math.max(8, area.height - (box.collapsed ? 48 : h) - 8));
  return { x, y, w, h, collapsed: box.collapsed };
}

export function ReferenceWindow({ image, original, camera, viewport, patternWidth, patternHeight, box, onBoxChange, onClose }: ReferenceWindowProps) {
  const t = zhCN.editorWorkspace.reference;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [moving, setMoving] = useState(false);
  const placed = placeBox(box, viewport);
  const dpr = useDpr();
  const bodyHeight = placed.h - 40;

  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g || placed.collapsed || viewport.width <= 0 || viewport.height <= 0) return;
    const W = placed.w;
    const H = bodyHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = EDITOR_CANVAS.subtle;
    g.fillRect(0, 0, W, H);
    const frame = referenceFrame(camera, viewport, { width: W, height: H });
    const px = frame.x + camera.offsetX * frame.scale;
    const py = frame.y + camera.offsetY * frame.scale;
    const pw = patternWidth * camera.cellPx * frame.scale;
    const ph = patternHeight * camera.cellPx * frame.scale;
    g.save();
    g.translate(px, py);
    g.scale(pw, ph);
    g.transform(...inverseMatrix(original.geometry));
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    try {
      g.drawImage(image, 0, 0, 1, 1);
    } catch {
      // 图片尚未可绘制：保留底色。
    }
    g.restore();
    // 图纸以外的原图压淡，只作取景参考。
    g.fillStyle = EDITOR_CANVAS.subtle;
    g.globalAlpha = 0.7;
    g.beginPath();
    g.rect(0, 0, W, H);
    g.rect(px, py, pw, ph);
    g.fill('evenodd');
    g.globalAlpha = 1;
    // 主画布此刻的可见范围。
    g.strokeStyle = EDITOR_CANVAS.accent;
    g.lineWidth = 1.5;
    g.setLineDash([5, 4]);
    g.strokeRect(frame.x + 1, frame.y + 1, viewport.width * frame.scale - 2, viewport.height * frame.scale - 2);
    g.setLineDash([]);
  }, [bodyHeight, camera, dpr, image, original, patternHeight, patternWidth, placed.collapsed, placed.w, viewport]);

  const track = (event: ReactPointerEvent<HTMLElement>, apply: (dx: number, dy: number) => ReferenceBox) => {
    event.preventDefault();
    const target = event.currentTarget;
    const startX = event.clientX;
    const startY = event.clientY;
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // 测试环境没有指针捕获。
    }
    setMoving(true);
    const move = (next: PointerEvent) => onBoxChange(apply(next.clientX - startX, next.clientY - startY));
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      setMoving(false);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  return (
    <section
      role="dialog"
      aria-label={t.title}
      data-camera={JSON.stringify(camera)}
      className="absolute z-5 flex flex-col overflow-hidden rounded-lg bg-bg shadow-dialog ring-1 ring-line"
      style={{ left: placed.x, top: placed.y, width: placed.w, height: placed.collapsed ? undefined : placed.h }}
      onWheel={(event) => event.stopPropagation()}
    >
      <header
        className={cn('flex h-10 shrink-0 touch-none items-center gap-1.5 border-b border-line pr-1 pl-3 text-body-sm font-semibold text-ink select-none', moving ? 'cursor-grabbing' : 'cursor-grab', placed.collapsed && 'border-b-0')}
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest('button')) return;
          const start = placed;
          track(event, (dx, dy) => ({ ...start, x: start.x + dx, y: start.y + dy }));
        }}
      >
        <GripVertical aria-hidden="true" strokeWidth={1.75} className="size-4 shrink-0 text-ink-4" />
        <b className="min-w-0 flex-1 truncate font-semibold">{t.title}</b>
        <IconButton size="sm" label={placed.collapsed ? t.expand : t.collapse} onClick={() => onBoxChange({ ...placed, collapsed: !placed.collapsed })}>
          {placed.collapsed ? <ChevronDown aria-hidden="true" strokeWidth={1.75} /> : <ChevronUp aria-hidden="true" strokeWidth={1.75} />}
        </IconButton>
        <IconButton size="sm" label={t.close} tooltip={t.closeTip} onClick={onClose}>
          <X aria-hidden="true" strokeWidth={1.75} />
        </IconButton>
      </header>
      {placed.collapsed ? null : (
        <div className="relative min-h-0 flex-1">
          <canvas ref={canvasRef} aria-label={t.canvas} role="img" className="absolute inset-0 size-full" />
          <span
            aria-hidden="true"
            className="reference-resize absolute right-0 bottom-0 size-5 cursor-nwse-resize touch-none"
            onPointerDown={(event) => {
              const start = placed;
              track(event, (dx, dy) => ({ ...start, w: start.w + dx, h: start.h + dy }));
            }}
          />
        </div>
      )}
    </section>
  );
}
