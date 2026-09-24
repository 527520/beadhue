'use client';

/* eslint-disable react-hooks/refs -- 跟拼历史要在同一拍的连续点按之间同步读写（与旧 StitchView 相同）。 */

/**
 * 跟拼会话（业务沿用旧 StitchView）：本次会话内的撤销重做、当前行、浏览 / 标记工具。
 * 进度本身由工作台持有并串行写入本机（onChange）；父级给了内容不同的进度（换了图纸尺寸、换设计）即开始新的会话。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  canRedoStitchHistory,
  canUndoStitchHistory,
  commitStitchHistory,
  createStitchHistory,
  redoStitchHistory,
  undoStitchHistory,
  type StitchHistory,
} from '@/lib/progress/stitchHistory';
import { clearProgress, isStitchableCell, setBoardRowDone, toggleCell, type StitchProgress } from '@/lib/progress/stitchProgress';
import type { Pattern } from '@/lib/types';
import {
  boardGrid,
  boardStats,
  firstPendingRow,
  patternStats,
  rowComplete,
  rowIndexAt,
  stitchRows,
  type StitchRow,
  type StitchStats,
  type StitchTool,
} from './stitch-model';

export interface StitchSessionOptions {
  pattern: Pattern;
  boardSize: number;
  /** null：本机存储不可用或还在读取。 */
  progress: StitchProgress | null;
  onChange: (progress: StitchProgress) => void;
  /** 手机默认浏览、桌面默认标记（D39）。 */
  defaultTool: StitchTool;
  /** 当前行换了：让画布把这块板带进视野。 */
  onReveal?: (row: StitchRow) => void;
}

export type CompleteResult = 'advanced' | 'undone' | 'finished' | null;

export interface StitchSession {
  ready: boolean;
  progress: StitchProgress | null;
  rows: readonly StitchRow[];
  rowIndex: number;
  row: StitchRow | null;
  rowDone: boolean;
  stats: StitchStats;
  boards: readonly StitchStats[];
  boardCols: number;
  finished: boolean;
  hasProgress: boolean;
  tool: StitchTool;
  setTool: (tool: StitchTool) => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => boolean;
  redo: () => boolean;
  /** 标记 / 取消一格；不是可拼格返回 false。 */
  toggleAt: (row: number, col: number) => boolean;
  completeRow: () => CompleteResult;
  goRow: (index: number) => void;
  jumpBoard: (board: number) => void;
  jumpPending: () => void;
  clear: () => boolean;
  isDone: (row: number, col: number) => boolean;
}

const EMPTY_STATS: StitchStats = { total: 0, done: 0, percent: 0 };

function sameProgress(a: StitchProgress, b: StitchProgress): boolean {
  if (a.width !== b.width || a.height !== b.height || a.done.length !== b.done.length) return false;
  for (let index = 0; index < a.done.length; index += 1) if (a.done[index] !== b.done[index]) return false;
  return true;
}

type Anchor = { row: number; col: number };
const anchorOf = (row: StitchRow | undefined): Anchor | null => (row ? { row: row.row, col: row.colStart } : null);

export function useStitchSession({ pattern, boardSize, progress, onChange, defaultTool, onReveal }: StitchSessionOptions): StitchSession {
  const [history, setHistory] = useState<StitchHistory | null>(() => (progress ? createStitchHistory(progress) : null));
  const historyRef = useRef(history);
  historyRef.current = history;
  const [tool, setTool] = useState<StitchTool>(defaultTool);
  const rows = useMemo(() => stitchRows(pattern, boardSize), [boardSize, pattern]);
  /** 当前行记成「行首格」：换规格、改图纸后按同一格重新找行（旧 StitchView 的焦点钳制）。 */
  const [anchor, setAnchor] = useState<Anchor | null>(() => (progress ? anchorOf(rows[Math.max(0, firstPendingRow(rows, progress))]) : null));
  const onChangeRef = useRef(onChange);
  const onRevealRef = useRef(onReveal);
  useEffect(() => {
    onChangeRef.current = onChange;
    onRevealRef.current = onReveal;
  });

  // 父级给了内容不同的进度（首次读出、图纸尺寸变化、换设计）：新会话，历史清空，回到下一处未完成。
  // 自己提交后父级回传的是同样内容的新对象，不算新会话。
  const [seen, setSeen] = useState(progress);
  if (progress !== seen) {
    setSeen(progress);
    if (!progress) {
      historyRef.current = null;
      setHistory(null);
    } else if (!history || !sameProgress(progress, history.current)) {
      const next = createStitchHistory(progress);
      historyRef.current = next;
      setHistory(next);
      setAnchor(anchorOf(rows[Math.max(0, firstPendingRow(rows, progress))]));
    }
  }

  const current = history?.current ?? null;
  const found = anchor ? rowIndexAt(rows, anchor.row, anchor.col) : -1;
  const rowIndex = rows.length ? (found >= 0 ? found : Math.max(0, Math.min(rows.length - 1, current ? firstPendingRow(rows, current) : 0))) : -1;
  const row = rowIndex >= 0 ? rows[rowIndex] : null;
  const stats = useMemo(() => (current ? patternStats(pattern, current) : EMPTY_STATS), [current, pattern]);
  const boards = useMemo(() => (current ? boardStats(pattern, current, boardSize) : []), [boardSize, current, pattern]);
  const { cols: boardCols } = boardGrid(pattern.width, pattern.height, boardSize);

  const commit = useCallback((next: StitchProgress): boolean => {
    const base = historyRef.current;
    if (!base || next === base.current) return false;
    const nextHistory = commitStitchHistory(base, next);
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    onChangeRef.current(nextHistory.current);
    return true;
  }, []);

  const step = useCallback((direction: 'undo' | 'redo'): boolean => {
    const base = historyRef.current;
    if (!base) return false;
    const next = direction === 'undo' ? undoStitchHistory(base) : redoStitchHistory(base);
    if (next === base) return false;
    historyRef.current = next;
    setHistory(next);
    onChangeRef.current(next.current);
    return true;
  }, []);

  const goTo = useCallback((index: number) => {
    const target = rows[Math.max(0, Math.min(rows.length - 1, index))];
    if (!target) return;
    setAnchor(anchorOf(target));
    onRevealRef.current?.(target);
  }, [rows]);

  const toggleAt = useCallback((cellRow: number, col: number): boolean => {
    const base = historyRef.current;
    if (!base || !isStitchableCell(pattern.cells[cellRow * pattern.width + col])) return false;
    return commit(toggleCell(base.current, cellRow, col));
  }, [commit, pattern]);

  const completeRow = useCallback((): CompleteResult => {
    const base = historyRef.current;
    if (!base || !row) return null;
    const wasDone = rowComplete(base.current, row);
    const next = setBoardRowDone(base.current, pattern.cells, row.boardRow, row.boardCol, row.local, !wasDone, new Date(), boardSize);
    commit(next);
    if (wasDone) return 'undone';
    const pending = firstPendingRow(rows, next, rowIndex + 1);
    if (pending < 0) return 'finished';
    goTo(pending);
    return 'advanced';
  }, [boardSize, commit, goTo, pattern.cells, row, rowIndex, rows]);

  const jumpBoard = useCallback((board: number) => {
    const inBoard = rows.map((entry, index) => [entry, index] as const).filter(([entry]) => entry.board === board);
    if (!inBoard.length || !current) return;
    const pending = inBoard.find(([entry]) => !rowComplete(current, entry));
    goTo((pending ?? inBoard[0])[1]);
  }, [current, goTo, rows]);

  const jumpPending = useCallback(() => {
    if (!current) return;
    const pending = firstPendingRow(rows, current);
    if (pending >= 0) goTo(pending);
  }, [current, goTo, rows]);

  const clear = useCallback(() => {
    const base = historyRef.current;
    if (!base || !base.current.done.some((value) => value === 1)) return false;
    const changed = commit(clearProgress(base.current));
    if (changed) setAnchor(anchorOf(rows[0]));
    return changed;
  }, [commit, rows]);

  const isDone = useCallback((cellRow: number, col: number) => current?.done[cellRow * pattern.width + col] === 1, [current, pattern.width]);

  return {
    ready: Boolean(current),
    progress: current,
    rows,
    rowIndex,
    row,
    rowDone: current ? rowComplete(current, row) : false,
    stats,
    boards,
    boardCols,
    finished: stats.total > 0 && stats.done === stats.total,
    hasProgress: stats.done > 0,
    tool,
    setTool,
    canUndo: history ? canUndoStitchHistory(history) : false,
    canRedo: history ? canRedoStitchHistory(history) : false,
    undo: useCallback(() => step('undo'), [step]),
    redo: useCallback(() => step('redo'), [step]),
    toggleAt,
    completeRow,
    goRow: goTo,
    jumpBoard,
    jumpPending,
    clear,
    isDone,
  };
}
