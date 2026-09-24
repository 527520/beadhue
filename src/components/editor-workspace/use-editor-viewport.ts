'use client';

/**
 * 编辑器画布的相机（原型 editor/viewport.js）：居中适配、按档位缩放、以指针为中心的滚轮缩放、平移。
 * 只改视图，永不写图纸；事件处理里要读同一拍的写入时用 readCamera()。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { screenPointToGridCell, type GridCamera, type GridViewportSize } from '@/lib/render/gridViewport';
import { BASE_CELL, clampEditorCamera, fitEditorCamera, revealCell, stepZoom, zoomEditorCameraAt } from './editor-model';

/** jsdom 等测不到尺寸的环境用这个视窗（与旧工作台的有界视窗一致）。 */
const FALLBACK: GridViewportSize = { width: 640, height: 520 };

export interface EditorViewport {
  wrapRef: React.RefObject<HTMLDivElement | null>;
  size: GridViewportSize;
  camera: GridCamera;
  readCamera: () => GridCamera;
  fit: () => void;
  zoomAt: (cellPx: number, x: number, y: number) => void;
  zoomStep: (dir: 1 | -1, x?: number, y?: number) => void;
  zoomToPercent: (percent: number) => void;
  panBy: (dx: number, dy: number) => void;
  /** 两指缩放：从起始相机直接换算到新相机。 */
  applyCamera: (camera: GridCamera) => void;
  reveal: (row: number, col: number) => void;
  localPoint: (clientX: number, clientY: number) => { x: number; y: number };
  cellAt: (clientX: number, clientY: number) => { row: number; col: number } | null;
}

export function useEditorViewport(patternWidth: number, patternHeight: number): EditorViewport {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<GridViewportSize>(FALLBACK);
  const [camera, setCameraState] = useState<GridCamera>(() => fitEditorCamera(patternWidth, patternHeight, FALLBACK));
  const cameraRef = useRef(camera);
  const sizeRef = useRef(size);
  /** 用户动过视图后，窗口尺寸变化只平移保持居中，不再重新适配。 */
  const touchedRef = useRef(false);
  const measuredRef = useRef(false);
  const dimsRef = useRef({ w: patternWidth, h: patternHeight });

  const commit = useCallback((next: GridCamera, touched: boolean) => {
    const { w, h } = dimsRef.current;
    const clamped = clampEditorCamera(next, w, h, sizeRef.current);
    cameraRef.current = clamped;
    if (touched) touchedRef.current = true;
    setCameraState(clamped);
  }, []);

  const fit = useCallback(() => {
    const { w, h } = dimsRef.current;
    touchedRef.current = false;
    const next = fitEditorCamera(w, h, sizeRef.current);
    cameraRef.current = next;
    setCameraState(next);
  }, []);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const apply = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      const previous = sizeRef.current;
      const next = { width: Math.floor(width), height: Math.floor(height) };
      if (measuredRef.current && previous.width === next.width && previous.height === next.height) return;
      sizeRef.current = next;
      setSize(next);
      if (!measuredRef.current || !touchedRef.current) {
        measuredRef.current = true;
        fit();
        return;
      }
      const current = cameraRef.current;
      commit({ ...current, offsetX: current.offsetX + (next.width - previous.width) / 2, offsetY: current.offsetY + (next.height - previous.height) / 2 }, false);
    };
    apply(element.clientWidth, element.clientHeight);
    const observer = new ResizeObserver(([entry]) => apply(entry?.contentRect.width ?? 0, entry?.contentRect.height ?? 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, [commit, fit]);

  useEffect(() => {
    if (dimsRef.current.w === patternWidth && dimsRef.current.h === patternHeight) return;
    dimsRef.current = { w: patternWidth, h: patternHeight };
    fit();
  }, [fit, patternHeight, patternWidth]);

  const readCamera = useCallback(() => cameraRef.current, []);
  const zoomAt = useCallback((cellPx: number, x: number, y: number) => commit(zoomEditorCameraAt(cameraRef.current, cellPx, x, y), true), [commit]);
  const zoomStep = useCallback((dir: 1 | -1, x = sizeRef.current.width / 2, y = sizeRef.current.height / 2) => {
    zoomAt(stepZoom(cameraRef.current.cellPx, dir), x, y);
  }, [zoomAt]);
  const zoomToPercent = useCallback((percent: number) => {
    zoomAt((BASE_CELL * percent) / 100, sizeRef.current.width / 2, sizeRef.current.height / 2);
  }, [zoomAt]);
  const panBy = useCallback((dx: number, dy: number) => {
    const current = cameraRef.current;
    commit({ ...current, offsetX: current.offsetX + dx, offsetY: current.offsetY + dy }, true);
  }, [commit]);
  const applyCamera = useCallback((next: GridCamera) => commit(next, true), [commit]);
  const reveal = useCallback((row: number, col: number) => {
    const next = revealCell(cameraRef.current, row, col, sizeRef.current);
    if (next !== cameraRef.current) commit(next, true);
  }, [commit]);
  const localPoint = useCallback((clientX: number, clientY: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  }, []);
  const cellAt = useCallback((clientX: number, clientY: number) => {
    const point = localPoint(clientX, clientY);
    const { w, h } = dimsRef.current;
    return screenPointToGridCell(point.x, point.y, cameraRef.current, w, h);
  }, [localPoint]);

  return { wrapRef, size, camera, readCamera, fit, zoomAt, zoomStep, zoomToPercent, panBy, applyCamera, reveal, localPoint, cellAt };
}
