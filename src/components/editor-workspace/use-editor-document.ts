'use client';

/* eslint-disable react-hooks/refs -- 编辑事务的格子与历史必须在高频指针事件之间同步读写。 */

/**
 * 编辑文档：图纸格子副本、撤销重做、工具与当前色（沿用旧 PixelEditorCanvas 的编辑事务，界面层另写）。
 * 一次按下到抬起只形成一条可撤销笔迹；父组件传入新图纸（重新生成、换色板、导入）即开始新的事务边界。
 * 每次提交都把完整图纸交给 onPatternChange（工作台的 commitManualEdit + 自动保存）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditHistory } from '@/lib/editor/history';
import {
  applyBrush,
  applyErase,
  applyTransform,
  clearAll,
  floodFill,
  replaceByCode,
  rollbackSnapshots,
  type BrushSize,
  type EditSnapshot,
  type ToolId,
  type TransformOp,
} from '@/lib/editor/ops';
import { createEditorState, refreshStats, type EditorState } from '@/lib/editor/state';
import { transformOriginal, type OriginalReference } from '@/lib/originals/geometry';
import type { PaletteColor, Pattern, PatternCell } from '@/lib/types';
import { sameColor, type EditorTool } from './editor-model';

export interface EditorDocumentOptions {
  pattern: Pattern;
  /** 可用色（当前色板按套装档位裁剪后的带色号颜色）。 */
  palette: readonly PaletteColor[];
  original?: OriginalReference;
  onOriginalChange?: (original: OriginalReference) => void;
  onPatternChange: (pattern: Pattern) => void;
}

export interface EditorDocument {
  /** 当前格子（事件里直接读，渲染靠 version 触发）。 */
  readonly state: React.RefObject<EditorState>;
  version: number;
  width: number;
  height: number;
  tool: EditorTool;
  setTool: (tool: EditorTool) => void;
  /** 吸管取色后回到的上一个上色工具。 */
  previousPaintTool: EditorTool;
  brushSize: BrushSize;
  setBrushSize: (size: BrushSize) => void;
  color: PaletteColor | null;
  setColor: (color: PaletteColor | null) => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => boolean;
  redo: () => boolean;
  cellAt: (row: number, col: number) => PatternCell | undefined;
  /** 画笔 / 橡皮在一格落笔：直接改格子并返回快照（笔迹进行中不提交）。 */
  paintCell: (row: number, col: number) => EditSnapshot[];
  /** 结束一条笔迹：一次提交为一步撤销。 */
  commitStroke: (snapshots: EditSnapshot[]) => number;
  rollback: (snapshots: EditSnapshot[]) => void;
  fillAt: (row: number, col: number) => number;
  /** 吸管：返回拾取到的颜色；空格返回 null 并保留当前色。 */
  pickAt: (row: number, col: number) => PaletteColor | null;
  replaceCode: (fromCode: string, target: PaletteColor | null) => number;
  transform: (op: TransformOp) => void;
  clear: () => number;
  /** 画布需要重绘（笔迹进行中）。 */
  touch: () => void;
}

function mostUsedColor(state: EditorState, palette: readonly PaletteColor[]): PaletteColor | null {
  const top = state.stats[0];
  if (top) return palette.find((color) => sameColor(color, { hex: top.hex, code: top.code })) ?? { hex: top.hex, code: top.code };
  return palette[0] ?? null;
}

export function useEditorDocument({ pattern, palette, original, onOriginalChange, onPatternChange }: EditorDocumentOptions): EditorDocument {
  const available = useMemo(() => palette.filter((color) => color.code !== null && color.code.trim().length > 0), [palette]);
  const stateRef = useRef<EditorState>(createEditorState(pattern));
  const historyRef = useRef(new EditHistory());
  const lastEmittedRef = useRef<Pattern | null>(null);
  const originalRef = useRef(original);
  const onPatternChangeRef = useRef(onPatternChange);
  const onOriginalChangeRef = useRef(onOriginalChange);
  const [version, setVersion] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [tool, setToolState] = useState<EditorTool>('brush');
  const [previousPaintTool, setPreviousPaintTool] = useState<EditorTool>('brush');
  const [brushSize, setBrushSize] = useState<BrushSize>(1);
  const [color, setColorState] = useState<PaletteColor | null>(() => mostUsedColor(stateRef.current, available));

  useEffect(() => {
    originalRef.current = original;
    onPatternChangeRef.current = onPatternChange;
    onOriginalChangeRef.current = onOriginalChange;
  }, [onOriginalChange, onPatternChange, original]);

  useEffect(() => {
    if (pattern === lastEmittedRef.current) return;
    // 外部换了图纸：新事务边界，旧历史不能作用到新格子上。
    stateRef.current = createEditorState(pattern);
    historyRef.current = new EditHistory();
    setCanUndo(false);
    setCanRedo(false);
    setColorState((current) => (current && available.some((entry) => sameColor(entry, current)) ? current : mostUsedColor(stateRef.current, available)));
    setVersion((value) => value + 1);
  }, [available, pattern]);

  const emit = useCallback(() => {
    setCanUndo(historyRef.current.canUndo);
    setCanRedo(historyRef.current.canRedo);
    setVersion((value) => value + 1);
    const { width, height, cells } = stateRef.current;
    const next: Pattern = { width, height, cells: cells.map((cell) => ({ ...cell })) };
    lastEmittedRef.current = next;
    onPatternChangeRef.current(next);
  }, []);

  const commit = useCallback((label: ToolId, snapshots: EditSnapshot[]): number => {
    if (snapshots.length === 0) return 0;
    historyRef.current.push({ label, snapshots });
    refreshStats(stateRef.current);
    emit();
    return snapshots.length;
  }, [emit]);

  const setTool = useCallback((next: EditorTool) => {
    if (next === 'brush' || next === 'fill' || next === 'replace' || next === 'eraser') setPreviousPaintTool(next);
    setToolState(next);
  }, []);

  const cellAt = useCallback((row: number, col: number) => stateRef.current.cells[row * stateRef.current.width + col], []);

  const paintCell = useCallback((row: number, col: number): EditSnapshot[] => {
    const state = stateRef.current;
    if (tool === 'eraser') return applyErase(state.cells, state.width, state.height, row, col, brushSize);
    if (tool === 'brush' && color) return applyBrush(state.cells, state.width, state.height, row, col, brushSize, color);
    return [];
  }, [brushSize, color, tool]);

  const commitStroke = useCallback((snapshots: EditSnapshot[]) => commit(tool === 'eraser' ? 'eraser' : 'brush', snapshots), [commit, tool]);

  const rollback = useCallback((snapshots: EditSnapshot[]) => {
    rollbackSnapshots(stateRef.current.cells, snapshots);
    setVersion((value) => value + 1);
  }, []);

  const fillAt = useCallback((row: number, col: number) => {
    const state = stateRef.current;
    return commit('fill', floodFill(state.cells, state.width, state.height, row, col, color));
  }, [color, commit]);

  const pickAt = useCallback((row: number, col: number): PaletteColor | null => {
    const cell = cellAt(row, col);
    if (!cell || cell.transparent || !cell.hex || !cell.code) return null;
    const picked = { hex: cell.hex, code: cell.code };
    setColorState(picked);
    return picked;
  }, [cellAt]);

  const replaceCode = useCallback((fromCode: string, target: PaletteColor | null) => commit('replace', replaceByCode(stateRef.current.cells, fromCode, target)), [commit]);

  const clear = useCallback(() => commit('clear', clearAll(stateRef.current.cells)), [commit]);

  const transform = useCallback((op: TransformOp) => {
    const state = stateRef.current;
    const beforeCells = state.cells.slice();
    const beforeDims = { width: state.width, height: state.height };
    const next = applyTransform(state.cells, state.width, state.height, op);
    state.cells = next.cells;
    state.width = next.width;
    state.height = next.height;
    // 原图对应关系随图纸一起变换，原图参照在旋转 / 镜像后仍然可靠（BeadHue 几何）。
    const beforeOriginal = originalRef.current;
    const afterOriginal = beforeOriginal?.geometry ? { ...beforeOriginal, geometry: transformOriginal(beforeOriginal.geometry, op) } : undefined;
    if (afterOriginal) {
      originalRef.current = afterOriginal;
      onOriginalChangeRef.current?.(afterOriginal);
    }
    historyRef.current.push({
      ...(beforeOriginal && afterOriginal ? { original: { before: beforeOriginal, after: afterOriginal } } : {}),
      label: 'transform',
      snapshots: beforeCells.map((cell, index) => ({ index, before: cell, after: state.cells[index] })),
      dims: { before: beforeDims, after: { width: next.width, height: next.height } },
    });
    refreshStats(state);
    emit();
  }, [emit]);

  const step = useCallback((direction: 'undo' | 'redo'): boolean => {
    const history = historyRef.current;
    const entry = direction === 'undo' ? history.undo(stateRef.current.cells) : history.redo(stateRef.current.cells);
    if (!entry) return false;
    const side = direction === 'undo' ? 'before' : 'after';
    if (entry.original) {
      originalRef.current = entry.original[side];
      onOriginalChangeRef.current?.(entry.original[side]);
    }
    if (entry.dims) {
      stateRef.current.width = entry.dims[side].width;
      stateRef.current.height = entry.dims[side].height;
    }
    refreshStats(stateRef.current);
    emit();
    return true;
  }, [emit]);
  const undo = useCallback(() => step('undo'), [step]);
  const redo = useCallback(() => step('redo'), [step]);
  const touch = useCallback(() => setVersion((value) => value + 1), []);

  return {
    state: stateRef,
    version,
    width: stateRef.current.width,
    height: stateRef.current.height,
    tool,
    setTool,
    previousPaintTool,
    brushSize,
    setBrushSize,
    color,
    setColor: setColorState,
    canUndo,
    canRedo,
    undo,
    redo,
    cellAt,
    paintCell,
    commitStroke,
    rollback,
    fillAt,
    pickAt,
    replaceCode,
    transform,
    clear,
    touch,
  };
}
