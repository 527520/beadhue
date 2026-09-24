'use client';

/* eslint-disable react-hooks/refs -- 指针手势与相机必须在高频事件之间同步读写。 */

/**
 * 编辑画布（原型 editor/viewport.js）：方格渲染 + 网格 / 板缝 / 色号、悬停落点预览、颜色高亮，
 * 以及手势分层——平移、滚轮与双指缩放只改视图；画笔 / 橡皮一次按下到抬起是一条笔迹；
 * 油漆桶、吸管、替换是轻点，拖动超过阈值即转为平移，绝不写图（D5 / D8）。
 */
import { useCallback, useEffect, useRef, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { cn } from '@/lib/cn';
import { BEAD_TOKENS, EDITOR_CANVAS } from '@/lib/render/beadTokens';
import { luminance } from '@/lib/render/beads';
import { visibleGridRange, type GridCamera } from '@/lib/render/gridViewport';
import { rasterizeGridLine, type EditSnapshot } from '@/lib/editor/ops';
import type { PaletteColor } from '@/lib/types';
import { zhCN } from '@/messages/zh-CN';
import { CODES_MIN_CELL, sameColor } from './editor-model';
import type { EditorDocument } from './use-editor-document';
import type { EditorViewport } from './use-editor-viewport';

const MOVE_THRESHOLD_PX = 8;
const MOUSE_THRESHOLD_PX = 4;
const MAX_DPR = 2;

type Cell = { row: number; col: number };
type Point = { x: number; y: number };
type Gesture =
  | { kind: 'idle' }
  | { kind: 'pan'; pointerId: number; lastX: number; lastY: number }
  | { kind: 'stroke'; pointerId: number; last: Cell; snapshots: EditSnapshot[] }
  /** 触屏画笔精准模式：拖动只对准，松手才改最终格（D5）。 */
  | { kind: 'aim'; pointerId: number; hit: Cell | null }
  /** 油漆桶 / 吸管 / 替换：轻点；移动超过阈值转为平移。 */
  | { kind: 'tap'; pointerId: number; startX: number; startY: number; lastX: number; lastY: number; threshold: number; start: Cell }
  | { kind: 'pinch'; ids: [number, number]; startDistance: number; startCenter: Point; startCamera: GridCamera };

export interface EditorCanvasProps {
  doc: EditorDocument;
  viewport: EditorViewport;
  showGrid: boolean;
  showSeams: boolean;
  showCodes: boolean;
  boardSize: number;
  highlight: PaletteColor | null;
  /** 生成中：只能看，不能改。 */
  locked: boolean;
  /** 按住空格：临时平移。 */
  spaceHeld: boolean;
  cursor: Cell | null;
  onCursorChange: (cell: Cell | null, source: 'keyboard' | 'pointer') => void;
  onHover: (cell: Cell | null) => void;
  /** 轻点类工具（油漆桶 / 吸管 / 替换）落在某格。 */
  onTap: (cell: Cell) => void;
  /** 键盘回车：对光标格执行当前工具。 */
  onApply: (cell: Cell) => void;
  describedBy?: string;
  /** 进入编辑器时把焦点放在画布上：键盘用户直接落在图纸上（D-1）。 */
  autoFocus?: boolean;
}

function distance(a: Point, b: Point): number {
  return Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function EditorCanvas({
  doc,
  viewport,
  showGrid,
  showSeams,
  showCodes,
  boardSize,
  highlight,
  locked,
  spaceHeld,
  cursor,
  onCursorChange,
  onHover,
  onTap,
  onApply,
  describedBy,
  autoFocus,
}: EditorCanvasProps) {
  const t = zhCN.editorWorkspace;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<Gesture>({ kind: 'idle' });
  const hoverRef = useRef<Cell | null>(null);
  const wheelRef = useRef(0);
  const frameRef = useRef(0);
  const { camera, size } = viewport;
  const { width: W, height: H } = doc;

  const draw = useCallback(() => {
    frameRef.current = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window === 'undefined' ? 1 : Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.floor(size.width));
    const height = Math.max(1, Math.floor(size.height));
    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const g = canvas.getContext('2d');
    if (!g) return;
    const state = doc.state.current;
    const cam = viewport.readCamera();
    const { cellPx: cell, offsetX: ox, offsetY: oy } = cam;
    const pw = state.width * cell;
    const ph = state.height * cell;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
    g.save();
    g.shadowColor = EDITOR_CANVAS.frame;
    g.shadowBlur = 18;
    g.shadowOffsetY = 2;
    g.fillStyle = BEAD_TOKENS.board;
    g.fillRect(ox, oy, pw, ph);
    g.restore();

    const range = visibleGridRange(cam, state.width, state.height, { width, height });
    const at = (row: number, col: number) => state.cells[row * state.width + col];
    for (let row = range.rowStart; row < range.rowEnd; row += 1) {
      for (let col = range.colStart; col < range.colEnd; col += 1) {
        const item = at(row, col);
        if (!item || item.transparent || !item.hex) continue;
        g.fillStyle = item.hex;
        g.fillRect(ox + col * cell, oy + row * cell, cell, cell);
      }
    }
    if (showGrid && cell >= 5) {
      g.strokeStyle = BEAD_TOKENS.grid;
      g.lineWidth = 1;
      g.beginPath();
      for (let col = range.colStart; col <= range.colEnd; col += 1) {
        const x = Math.round(ox + col * cell) + 0.5;
        g.moveTo(x, oy + range.rowStart * cell);
        g.lineTo(x, oy + range.rowEnd * cell);
      }
      for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
        const y = Math.round(oy + row * cell) + 0.5;
        g.moveTo(ox + range.colStart * cell, y);
        g.lineTo(ox + range.colEnd * cell, y);
      }
      g.stroke();
    }
    if (showSeams && boardSize > 0) {
      g.strokeStyle = BEAD_TOKENS.seam;
      g.lineWidth = Math.max(1.5, Math.min(3, cell * 0.08));
      g.beginPath();
      for (let col = boardSize; col < state.width; col += boardSize) {
        g.moveTo(ox + col * cell, oy);
        g.lineTo(ox + col * cell, oy + ph);
      }
      for (let row = boardSize; row < state.height; row += boardSize) {
        g.moveTo(ox, oy + row * cell);
        g.lineTo(ox + pw, oy + row * cell);
      }
      g.stroke();
    }
    if (showCodes && cell >= CODES_MIN_CELL) {
      g.font = `600 ${Math.max(8, Math.min(15, Math.round(cell * 0.34)))}px ui-monospace, Menlo, monospace`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (let row = range.rowStart; row < range.rowEnd; row += 1) {
        for (let col = range.colStart; col < range.colEnd; col += 1) {
          const item = at(row, col);
          if (!item || item.transparent || !item.hex || !item.code) continue;
          g.fillStyle = luminance(item.hex) > 0.45 ? BEAD_TOKENS.codeOnLight : BEAD_TOKENS.codeOnDark;
          g.fillText(item.code, ox + (col + 0.5) * cell, oy + (row + 0.5) * cell + 0.5, Math.max(1, cell - 2));
        }
      }
    }
    if (highlight) {
      g.fillStyle = EDITOR_CANVAS.paper;
      g.globalAlpha = 0.8;
      g.beginPath();
      const matches: Cell[] = [];
      for (let row = range.rowStart; row < range.rowEnd; row += 1) {
        for (let col = range.colStart; col < range.colEnd; col += 1) {
          const item = at(row, col);
          const hit = item && !item.transparent && item.hex && sameColor({ hex: item.hex, code: item.code }, highlight);
          if (hit) matches.push({ row, col });
          else g.rect(ox + col * cell, oy + row * cell, cell, cell);
        }
      }
      g.fill();
      g.globalAlpha = 1;
      if (cell >= 6) {
        g.strokeStyle = EDITOR_CANVAS.ink;
        g.lineWidth = Math.max(1, Math.min(2, cell * 0.12));
        g.beginPath();
        for (const { row, col } of matches) g.rect(ox + col * cell + 0.5, oy + row * cell + 0.5, cell - 1, cell - 1);
        g.stroke();
      }
    }
    const marker = hoverRef.current ?? cursor;
    if (marker && marker.row < state.height && marker.col < state.width) {
      const paints = !locked && !spaceHeld && (doc.tool === 'brush' || doc.tool === 'eraser');
      const sizeCells = paints ? doc.brushSize : 1;
      const start = -Math.floor((sizeCells - 1) / 2);
      const col = Math.max(0, Math.min(state.width - 1, marker.col + start));
      const row = Math.max(0, Math.min(state.height - 1, marker.row + start));
      const w = Math.min(sizeCells, state.width - col) * cell;
      const h = Math.min(sizeCells, state.height - row) * cell;
      const x = ox + col * cell;
      const y = oy + row * cell;
      if (paints) {
        g.fillStyle = doc.tool === 'brush' && doc.color ? doc.color.hex : BEAD_TOKENS.board;
        g.globalAlpha = 0.55;
        g.fillRect(x, y, w, h);
        g.globalAlpha = 1;
      }
      if (doc.tool !== 'hand' || !hoverRef.current) {
        g.lineWidth = 3;
        g.strokeStyle = EDITOR_CANVAS.paper;
        g.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
        g.lineWidth = 1.5;
        g.strokeStyle = EDITOR_CANVAS.ink;
        g.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
      }
    }
    g.strokeStyle = EDITOR_CANVAS.frame;
    g.lineWidth = 1;
    g.strokeRect(Math.round(ox) - 0.5, Math.round(oy) - 0.5, Math.round(pw) + 1, Math.round(ph) + 1);
  }, [boardSize, cursor, doc, highlight, locked, showCodes, showGrid, showSeams, size, spaceHeld, viewport]);

  const requestDraw = useCallback(() => {
    if (frameRef.current) return;
    if (typeof requestAnimationFrame === 'undefined') {
      draw();
      return;
    }
    frameRef.current = requestAnimationFrame(draw);
  }, [draw]);

  useEffect(() => {
    draw();
  }, [draw, camera, doc.version]);
  useEffect(() => () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
  }, []);
  useEffect(() => {
    if (autoFocus) canvasRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const setHover = useCallback((cell: Cell | null) => {
    const current = hoverRef.current;
    if ((!cell && !current) || (cell && current && cell.row === current.row && cell.col === current.col)) return;
    hoverRef.current = cell;
    onHover(cell);
    requestDraw();
  }, [onHover, requestDraw]);

  const cancelGesture = useCallback(() => {
    const gesture = gestureRef.current;
    if (gesture.kind === 'stroke') doc.rollback(gesture.snapshots);
    gestureRef.current = { kind: 'idle' };
  }, [doc]);

  const startPinch = useCallback(() => {
    const entries = [...pointersRef.current.entries()];
    if (entries.length < 2) return;
    cancelGesture();
    const [[firstId, first], [secondId, second]] = entries;
    gestureRef.current = { kind: 'pinch', ids: [firstId, secondId], startDistance: distance(first, second), startCenter: midpoint(first, second), startCamera: viewport.readCamera() };
    setHover(null);
  }, [cancelGesture, setHover, viewport]);

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // jsdom 与旧浏览器没有指针捕获。
    }
    const point = viewport.localPoint(event.clientX, event.clientY);
    pointersRef.current.set(event.pointerId, point);
    if (pointersRef.current.size >= 2) {
      startPinch();
      return;
    }
    const hit = viewport.cellAt(event.clientX, event.clientY);
    const touch = event.pointerType !== 'mouse';
    if (doc.tool === 'hand' || spaceHeld || event.button === 1 || locked) {
      gestureRef.current = { kind: 'pan', pointerId: event.pointerId, lastX: point.x, lastY: point.y };
      return;
    }
    if (!hit) {
      gestureRef.current = { kind: 'pan', pointerId: event.pointerId, lastX: point.x, lastY: point.y };
      return;
    }
    onCursorChange(hit, 'pointer');
    if (doc.tool === 'brush' || doc.tool === 'eraser') {
      if (event.pointerType === 'touch') {
        gestureRef.current = { kind: 'aim', pointerId: event.pointerId, hit };
        setHover(hit);
        return;
      }
      const snapshots = doc.paintCell(hit.row, hit.col);
      gestureRef.current = { kind: 'stroke', pointerId: event.pointerId, last: hit, snapshots };
      if (snapshots.length) doc.touch();
      setHover(hit);
      return;
    }
    gestureRef.current = { kind: 'tap', pointerId: event.pointerId, startX: point.x, startY: point.y, lastX: point.x, lastY: point.y, threshold: touch ? MOVE_THRESHOLD_PX : MOUSE_THRESHOLD_PX, start: hit };
    setHover(hit);
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const point = viewport.localPoint(event.clientX, event.clientY);
    if (!pointersRef.current.has(event.pointerId)) {
      if (event.pointerType === 'mouse') setHover(viewport.cellAt(event.clientX, event.clientY));
      return;
    }
    pointersRef.current.set(event.pointerId, point);
    if (pointersRef.current.size >= 2 && gestureRef.current.kind !== 'pinch') startPinch();
    const gesture = gestureRef.current;
    if (gesture.kind === 'pinch') {
      const first = pointersRef.current.get(gesture.ids[0]);
      const second = pointersRef.current.get(gesture.ids[1]);
      if (!first || !second) return;
      const center = midpoint(first, second);
      const start = gesture.startCamera;
      const next = Math.max(1, Math.min(80, (start.cellPx * distance(first, second)) / gesture.startDistance));
      const k = next / start.cellPx;
      viewport.applyCamera({
        cellPx: next,
        offsetX: center.x - (gesture.startCenter.x - start.offsetX) * k,
        offsetY: center.y - (gesture.startCenter.y - start.offsetY) * k,
      });
      return;
    }
    if ('pointerId' in gesture && gesture.pointerId !== event.pointerId) return;
    if (gesture.kind === 'pan') {
      viewport.panBy(point.x - gesture.lastX, point.y - gesture.lastY);
      gesture.lastX = point.x;
      gesture.lastY = point.y;
      return;
    }
    const hit = viewport.cellAt(event.clientX, event.clientY);
    if (gesture.kind === 'tap') {
      if (Math.hypot(point.x - gesture.startX, point.y - gesture.startY) > gesture.threshold) {
        viewport.panBy(point.x - gesture.lastX, point.y - gesture.lastY);
        gestureRef.current = { kind: 'pan', pointerId: gesture.pointerId, lastX: point.x, lastY: point.y };
        setHover(null);
        return;
      }
      gesture.lastX = point.x;
      gesture.lastY = point.y;
      return;
    }
    if (gesture.kind === 'aim') {
      gesture.hit = hit;
      setHover(hit);
      return;
    }
    if (gesture.kind === 'stroke') {
      if (!hit) {
        // 拖出图纸：这条笔迹作废（与旧编辑器一致，避免越界拖动留下半截改动）。
        cancelGesture();
        setHover(null);
        return;
      }
      if (hit.row === gesture.last.row && hit.col === gesture.last.col) return;
      for (const cell of rasterizeGridLine(gesture.last.row, gesture.last.col, hit.row, hit.col).slice(1)) {
        gesture.snapshots.push(...doc.paintCell(cell.row, cell.col));
      }
      gesture.last = hit;
      onCursorChange(hit, 'pointer');
      setHover(hit);
      doc.touch();
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(event.pointerId);
    const gesture = gestureRef.current;
    if (gesture.kind === 'pinch') {
      if (pointersRef.current.size < 2) gestureRef.current = { kind: 'idle' };
      return;
    }
    if (gesture.kind === 'idle' || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = { kind: 'idle' };
    const hit = viewport.cellAt(event.clientX, event.clientY);
    if (gesture.kind === 'stroke') {
      if (!hit) {
        doc.rollback(gesture.snapshots);
        return;
      }
      doc.commitStroke(gesture.snapshots);
    } else if (gesture.kind === 'aim') {
      const target = gesture.hit;
      if (!target) return;
      doc.commitStroke(doc.paintCell(target.row, target.col));
    } else if (gesture.kind === 'tap') {
      if (hit && hit.row === gesture.start.row && hit.col === gesture.start.col) onTap(hit);
    }
    if (event.pointerType !== 'mouse') setHover(null);
  };

  const onPointerCancel = (event: PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(event.pointerId);
    cancelGesture();
    setHover(null);
  };

  const onWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    const point = viewport.localPoint(event.clientX, event.clientY);
    wheelRef.current += event.deltaY * (event.deltaMode === 1 ? 16 : 1) * (event.ctrlKey ? 4 : 1);
    if (Math.abs(wheelRef.current) < 40) return;
    viewport.zoomStep(wheelRef.current > 0 ? -1 : 1, point.x, point.y);
    wheelRef.current = 0;
  };

  // 滚轮必须阻止页面默认行为（React 的 onWheel 是被动监听，preventDefault 无效）。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const block = (event: globalThis.WheelEvent) => event.preventDefault();
    canvas.addEventListener('wheel', block, { passive: false });
    return () => canvas.removeEventListener('wheel', block);
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      const base = cursor ?? { row: 0, col: 0 };
      const next = {
        row: Math.max(0, Math.min(H - 1, base.row + move[0])),
        col: Math.max(0, Math.min(W - 1, base.col + move[1])),
      };
      hoverRef.current = null;
      onCursorChange(next, 'keyboard');
      viewport.reveal(next.row, next.col);
      return;
    }
    if (event.key === 'Enter' && cursor && !locked && doc.tool !== 'hand') {
      event.preventDefault();
      onApply(cursor);
    }
  };

  const cursorClass = spaceHeld || doc.tool === 'hand' || locked ? 'cursor-grab' : doc.tool === 'pick' ? 'cursor-copy' : 'cursor-crosshair';

  return (
    <div
      ref={viewport.wrapRef}
      data-camera={JSON.stringify(camera)}
      data-viewport={JSON.stringify(size)}
      className="absolute inset-0 overflow-hidden"
    >
      <canvas
        ref={canvasRef}
        tabIndex={0}
        aria-label={t.canvasAria(W, H)}
        aria-describedby={describedBy}
        aria-busy={locked || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={() => { if (!pointersRef.current.size) setHover(null); }}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        onBlur={() => { if (!pointersRef.current.size) setHover(null); }}
        className={cn('absolute inset-0 block touch-none outline-none focus-visible:inset-ring-2 focus-visible:inset-ring-accent', cursorClass)}
      />
    </div>
  );
}
