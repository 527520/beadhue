"use client";
import { zhCN } from "@/messages/zh-CN";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import Icon from "@/components/ui/Icon";
import {
  inverseMatrix,
  referenceFrame,
  type OriginalReference,
} from "@/lib/originals/geometry";
import type { GridCamera, GridViewportSize } from "@/lib/render/gridViewport";

interface Props {
  image: CanvasImageSource | null;
  original?: OriginalReference;
  camera: GridCamera;
  viewport: GridViewportSize;
  width: number;
  height: number;
}
/** Camera is read-only here: expanding or dragging the reference never moves the editor. */
export default function OriginalReferenceWindow({
  image,
  original,
  camera,
  viewport,
  width,
  height,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [size, setSize] = useState({ width: 220, height: 125 });
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0].contentRect;
      setSize({ width: box.width, height: box.height });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(size.width * dpr));
    canvas.height = Math.max(1, Math.round(size.height * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    if (
      !image ||
      !original?.geometry ||
      viewport.width <= 0 ||
      viewport.height <= 0
    )
      return;
    const frame = referenceFrame(camera, viewport, size);
    ctx.save();
    ctx.translate(frame.x, frame.y);
    ctx.scale(frame.scale, frame.scale);
    ctx.beginPath();
    ctx.rect(0, 0, viewport.width, viewport.height);
    ctx.clip();
    ctx.translate(camera.offsetX, camera.offsetY);
    ctx.scale(camera.cellPx * width, camera.cellPx * height);
    ctx.beginPath();
    ctx.rect(0, 0, 1, 1);
    ctx.clip();
    ctx.transform(...inverseMatrix(original.geometry));
    ctx.drawImage(image, 0, 0, 1, 1);
    ctx.restore();
  }, [camera, viewport, size, image, original, width, height]);
  const start = (event: PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    const panel = panelRef.current;
    if (!panel || expanded) return;
    const parent = panel.offsetParent?.getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    if (!parent) return;
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      left: box.left - parent.left,
      top: box.top - parent.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    const panel = panelRef.current;
    if (!panel) return;
    const parent = panel.offsetParent as HTMLElement;
    setPosition({
      left: Math.max(
        0,
        Math.min(
          parent.clientWidth - panel.offsetWidth,
          drag.current.left + event.clientX - drag.current.x,
        ),
      ),
      top: Math.max(
        0,
        Math.min(
          parent.clientHeight - panel.offsetHeight,
          drag.current.top + event.clientY - drag.current.y,
        ),
      ),
    });
  };
  const end = () => {
    if (drag.current && window.matchMedia("(max-width:600px)").matches) {
      const panel = panelRef.current;
      if (panel) {
        const parent = panel.offsetParent as HTMLElement;
        setPosition((p) =>
          p
            ? {
                ...p,
                left:
                  p.left + panel.offsetWidth / 2 < parent.clientWidth / 2
                    ? 8
                    : Math.max(8, parent.clientWidth - panel.offsetWidth - 8),
              }
            : p,
        );
      }
    }
    drag.current = null;
  };
  return (
    <aside
      ref={panelRef}
      className={`reference${expanded ? " expanded" : ""}${collapsed ? " collapsed" : ""}`}
      data-camera={JSON.stringify(camera)}
      data-viewport={JSON.stringify(viewport)}
      aria-label={zhCN.beadhue.referenceTitle}
      style={
        position && !expanded
          ? { left: position.left, top: position.top, right: "auto" }
          : undefined
      }
      onWheel={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div
        className="reference-head"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <strong>{zhCN.beadhue.referenceFollowing}</strong>
        <span>
          <button
            type="button"
            aria-label={
              expanded
                ? zhCN.beadhue.shrinkOriginal
                : zhCN.beadhue.expandOriginal
            }
            onClick={() => {
              setExpanded((v) => !v);
              setCollapsed(false);
            }}
          >
            <Icon name={expanded ? "fit" : "zoom-in"} size={14} />
          </button>
          <button
            type="button"
            aria-label={
              collapsed
                ? zhCN.beadhue.unfoldOriginal
                : zhCN.beadhue.foldOriginal
            }
            onClick={() => setCollapsed((v) => !v)}
          >
            <Icon name={collapsed ? "chevron-down" : "minus"} size={14} />
          </button>
        </span>
      </div>
      <div className="reference-body">
        <canvas ref={canvasRef} aria-label={zhCN.beadhue.alignedOriginal} />
        {(!original?.geometry || !image) && (
          <p className="reference-unavailable">
            {!original?.geometry
              ? zhCN.beadhue.originalGeometryMissing
              : zhCN.beadhue.originalNotLoaded}
          </p>
        )}
      </div>
      <div className="reference-caption">{zhCN.beadhue.referenceHint}</div>
    </aside>
  );
}
