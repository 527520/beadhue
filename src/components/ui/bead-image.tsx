'use client';

import { useEffect, useRef, useState } from 'react';
import type { Pattern } from '@/lib/types';
import { cn } from '@/lib/cn';
import { PIXEL_ICON_OPTIONS, paintPatternCanvas, type PatternCanvasOptions } from '@/lib/render/beads';

export interface BeadImageProps extends PatternCanvasOptions {
  pattern: Pattern;
  /** 可访问名称；不传则视为装饰图（aria-hidden）。 */
  alt?: string;
  className?: string;
  /** 进入视口才绘制（列表默认开启）。 */
  lazy?: boolean;
}

/**
 * 客户端豆粒渲染：按容器实际尺寸与 DPR 绘制，尺寸变化时重绘；懒绘制用 IntersectionObserver。
 * 尺寸由 className 决定（例如 size-full / aspect-square）。
 */
export function BeadImage({ pattern, alt, className, lazy = true, ...options }: BeadImageProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(() => !lazy || typeof IntersectionObserver === 'undefined');
  const optionsKey = JSON.stringify(options);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || visible) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '200px' });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !visible) return;
    const paint = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) paintPatternCanvas(canvas, pattern, { width: rect.width, height: rect.height }, JSON.parse(optionsKey) as PatternCanvasOptions);
    };
    paint();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(paint);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [pattern, optionsKey, visible]);

  return (
    <canvas
      ref={ref}
      data-slot="bead-image"
      role={alt ? 'img' : undefined}
      aria-label={alt}
      aria-hidden={alt ? undefined : true}
      className={cn('block', className)}
    />
  );
}

/** 8–16 格的像素小图标（类目条）：方格平铺、透明底、像素化缩放。 */
export function PixelIcon({ pattern, className, alt }: { pattern: Pattern; className?: string; alt?: string }) {
  return <BeadImage pattern={pattern} alt={alt} lazy={false} className={cn('size-7 [image-rendering:pixelated]', className)} {...PIXEL_ICON_OPTIONS} />;
}
