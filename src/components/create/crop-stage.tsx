'use client';

/**
 * 取景舞台：原图等比居中，框外压暗，取景框可拖动、四角等比缩放、方向键移动。
 * 图像来自解码器的有界预览缓冲（最长边 512），坐标一律换算回原图自然像素。
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '@/lib/cn';
import type { Rect } from '@/lib/crop/layout';
import type { DecodedImage } from '@/lib/image/decode';
import { zhCN } from '@/messages/zh-CN';
import { moveCrop, resizeCrop, type CropHandle } from './create-model';

const STAGE_PAD = 12;
const HANDLES: Array<{ id: CropHandle; place: string; corner: string }> = [
  { id: 'nw', place: '-top-2 -left-2 cursor-nwse-resize', corner: 'top-1.25 left-1.25 border-t-4 border-l-4' },
  { id: 'ne', place: '-top-2 -right-2 cursor-nesw-resize', corner: 'top-1.25 right-1.25 border-t-4 border-r-4' },
  { id: 'sw', place: '-bottom-2 -left-2 cursor-nesw-resize', corner: 'bottom-1.25 left-1.25 border-b-4 border-l-4' },
  { id: 'se', place: '-right-2 -bottom-2 cursor-nwse-resize', corner: 'right-1.25 bottom-1.25 border-r-4 border-b-4' },
];

function paintPreview(canvas: HTMLCanvasElement, image: DecodedImage): void {
  if (typeof ImageData === 'undefined') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = image.width;
  canvas.height = image.height;
  const length = image.width * image.height * 4;
  const bytes = new Uint8ClampedArray(length);
  bytes.set(image.data.subarray(0, length));
  ctx.putImageData(new ImageData(bytes, image.width, image.height), 0, 0);
}

export interface CropStageProps {
  image: DecodedImage;
  crop: Rect;
  onChange: (crop: Rect) => void;
  /** 拖动结束（松手 / 按键）后回调，用于刷新依赖整数选区的提示。 */
  onCommit?: () => void;
  disabled?: boolean;
}

export function CropStage({ image, crop, onChange, onCommit, disabled }: CropStageProps) {
  const natW = image.naturalWidth ?? image.width;
  const natH = image.naturalHeight ?? image.height;
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x: number; y: number; k: number } | null>(null);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const sw = stage.clientWidth;
      const sh = stage.clientHeight;
      if (!sw || !sh) return;
      const k = Math.min((sw - STAGE_PAD * 2) / natW, (sh - STAGE_PAD * 2) / natH);
      setBox({ k, x: (sw - natW * k) / 2, y: (sh - natH * k) / 2 });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [natW, natH]);

  useEffect(() => {
    if (canvasRef.current) paintPreview(canvasRef.current, image);
  }, [image]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const frame = frameRef.current;
    if (!frame || !box || disabled || event.button !== 0) return;
    event.preventDefault();
    frame.setPointerCapture(event.pointerId);
    frame.focus({ preventScroll: true });
    const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-handle]')?.dataset.handle as CropHandle | undefined;
    const start = { px: event.clientX, py: event.clientY, crop: { ...crop } };
    const k = box.k;
    const move = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      const dx = (e.clientX - start.px) / k;
      const dy = (e.clientY - start.py) / k;
      onChange(handle ? resizeCrop(start.crop, handle, dx, dy, natW, natH) : moveCrop(start.crop, dx, dy, natW, natH));
    };
    const up = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      frame.removeEventListener('pointermove', move);
      frame.removeEventListener('pointerup', up);
      frame.removeEventListener('pointercancel', up);
      onCommit?.();
    };
    frame.addEventListener('pointermove', move);
    frame.addEventListener('pointerup', up);
    frame.addEventListener('pointercancel', up);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = (event.shiftKey ? 0.05 : 0.01) * Math.max(natW, natH);
    const delta = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[event.key];
    if (!delta || disabled) return;
    event.preventDefault();
    onChange(moveCrop(crop, delta[0], delta[1], natW, natH));
    onCommit?.();
  };

  const place = (rect: Rect) =>
    box ? { left: box.x + rect.x * box.k, top: box.y + rect.y * box.k, width: rect.width * box.k, height: rect.height * box.k } : undefined;
  const imageBox = place({ x: 0, y: 0, width: natW, height: natH });

  return (
    <div
      ref={stageRef}
      data-base-ui-swipe-ignore=""
      className="relative h-crop-stage touch-none overflow-hidden rounded-lg bg-bg-subtle select-none"
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={zhCN.create.cropImageAlt}
        className={cn('pointer-events-none absolute block', !box && 'invisible')}
        style={imageBox}
      />
      {box ? (
        <>
          <div aria-hidden="true" className="pointer-events-none absolute overflow-hidden" style={imageBox}>
            <span className="absolute crop-hole" style={{ left: crop.x * box.k, top: crop.y * box.k, width: crop.width * box.k, height: crop.height * box.k }} />
          </div>
          <div
            ref={frameRef}
            role="group"
            tabIndex={disabled ? -1 : 0}
            aria-label={zhCN.create.frameAria}
            aria-disabled={disabled || undefined}
            onPointerDown={handlePointerDown}
            onKeyDown={handleKeyDown}
            className="absolute cursor-move touch-none inset-ring-2 inset-ring-bg outline-none focus-visible:inset-ring-accent"
            style={place(crop)}
          >
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/3 right-1/3 border-x border-bg/45" />
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/3 bottom-1/3 border-y border-bg/45" />
            {HANDLES.map((handle) => (
              <span key={handle.id} data-handle={handle.id} aria-hidden="true" className={cn('absolute z-1 size-8', handle.place)}>
                <span className={cn('absolute size-4.5 border-bg', handle.corner)} />
              </span>
            ))}
          </div>
        </>
      ) : null}
      <p role="status" className="sr-only">
        {zhCN.create.cropStatus(Math.round(crop.width), Math.round(crop.height))}
      </p>
    </div>
  );
}
