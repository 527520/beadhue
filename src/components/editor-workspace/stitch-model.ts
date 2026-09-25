/**
 * 跟拼的纯数据。
 * 进度的写入规则沿用 lib/progress/stitchProgress（可拼格判定、整行标记、清空），这里只做界面需要的派生：
 * 板块顺序的行列表、整图 / 每块板 / 每行的完成度、行内颜色序列、下一处未完成。
 */
import { getBoardRect, isStitchableCell, type BoardRect, type StitchProgress } from '@/lib/progress/stitchProgress';
import type { Pattern, PatternCell } from '@/lib/types';

export type StitchTool = 'browse' | 'mark';

/** 一块板里的一行（只收有可拼格的行），按板块顺序、板内自上而下排列。 */
export interface StitchRow {
  /** 板块序号（0 起，横向优先）。 */
  board: number;
  boardRow: number;
  boardCol: number;
  /** 板内第几行（0 起）。 */
  local: number;
  /** 在整张图纸里的行号。 */
  row: number;
  colStart: number;
  colEnd: number;
  /** 这一行里可拼格的格索引。 */
  cells: number[];
}

export interface StitchStats {
  total: number;
  done: number;
  /** 0–100 取整（向下取整，拼完之前不会显示 100%）。 */
  percent: number;
}

export interface RowRun {
  /** null 表示留空（透明 / 背景外 / 无色）。 */
  cell: Pick<PatternCell, 'hex' | 'code'> | null;
  count: number;
}

export function boardGrid(width: number, height: number, boardSize: number): { cols: number; rows: number; count: number } {
  const cols = Math.max(1, Math.ceil(width / boardSize));
  const rows = Math.max(1, Math.ceil(height / boardSize));
  return { cols, rows, count: cols * rows };
}

export function boardRectAt(width: number, height: number, boardSize: number, index: number): BoardRect | null {
  const { cols } = boardGrid(width, height, boardSize);
  return getBoardRect(width, height, Math.floor(index / cols), index % cols, boardSize);
}

export function stitchRows(pattern: Pattern, boardSize: number): StitchRow[] {
  const rows: StitchRow[] = [];
  const { cols, count } = boardGrid(pattern.width, pattern.height, boardSize);
  for (let board = 0; board < count; board += 1) {
    const boardRow = Math.floor(board / cols);
    const boardCol = board % cols;
    const rect = getBoardRect(pattern.width, pattern.height, boardRow, boardCol, boardSize);
    if (!rect) continue;
    for (let row = rect.rowStart; row < rect.rowEndExclusive; row += 1) {
      const cells: number[] = [];
      for (let col = rect.colStart; col < rect.colEndExclusive; col += 1) {
        const index = row * pattern.width + col;
        if (isStitchableCell(pattern.cells[index])) cells.push(index);
      }
      if (cells.length) rows.push({ board, boardRow, boardCol, local: row - rect.rowStart, row, colStart: rect.colStart, colEnd: rect.colEndExclusive, cells });
    }
  }
  return rows;
}

const percentOf = (done: number, total: number) => (total > 0 ? Math.floor((done / total) * 100) : 0);

/** 整图进度：只数可拼格（透明格、背景外格不计入分母）。 */
export function patternStats(pattern: Pattern, progress: StitchProgress): StitchStats {
  let total = 0;
  let done = 0;
  for (let index = 0; index < pattern.cells.length; index += 1) {
    if (!isStitchableCell(pattern.cells[index])) continue;
    total += 1;
    if (progress.done[index] === 1) done += 1;
  }
  return { total, done, percent: percentOf(done, total) };
}

/** 每块板的完成度（板块总览）。 */
export function boardStats(pattern: Pattern, progress: StitchProgress, boardSize: number): StitchStats[] {
  const { cols, count } = boardGrid(pattern.width, pattern.height, boardSize);
  const totals = new Array<number>(count).fill(0);
  const dones = new Array<number>(count).fill(0);
  for (let row = 0; row < pattern.height; row += 1) {
    const boardRow = Math.floor(row / boardSize);
    for (let col = 0; col < pattern.width; col += 1) {
      const index = row * pattern.width + col;
      if (!isStitchableCell(pattern.cells[index])) continue;
      const board = boardRow * cols + Math.floor(col / boardSize);
      totals[board] += 1;
      if (progress.done[index] === 1) dones[board] += 1;
    }
  }
  return totals.map((total, board) => ({ total, done: dones[board], percent: percentOf(dones[board], total) }));
}

export const rowComplete = (progress: StitchProgress, row: StitchRow | null | undefined): boolean =>
  Boolean(row && row.cells.length && row.cells.every((index) => progress.done[index] === 1));

/** 从 from 起找第一行还有未拼格的行；后面都拼完了就从头找；全部拼完返回 -1。 */
export function firstPendingRow(rows: readonly StitchRow[], progress: StitchProgress, from = 0): number {
  const start = Math.max(0, Math.min(from, rows.length));
  for (let k = start; k < rows.length; k += 1) if (!rowComplete(progress, rows[k])) return k;
  for (let k = 0; k < start; k += 1) if (!rowComplete(progress, rows[k])) return k;
  return -1;
}

/** 行内颜色序列：板宽范围内相邻同色合并，末尾的留空去掉。 */
export function rowRuns(pattern: Pattern, row: StitchRow): RowRun[] {
  const runs: RowRun[] = [];
  for (let col = row.colStart; col < row.colEnd; col += 1) {
    const cell = pattern.cells[row.row * pattern.width + col];
    const value = isStitchableCell(cell) ? { hex: cell.hex, code: cell.code ?? null } : null;
    const last = runs.at(-1);
    const same = last && (last.cell === null ? value === null : value !== null && last.cell.hex === value.hex && last.cell.code === value.code);
    if (last && same) last.count += 1;
    else runs.push({ cell: value, count: 1 });
  }
  while (runs.length && runs.at(-1)!.cell === null) runs.pop();
  return runs;
}

/** 找出包含某格的行（换规格 / 改图纸后按同一格重新定位当前行）。 */
export function rowIndexAt(rows: readonly StitchRow[], row: number, col: number): number {
  return rows.findIndex((entry) => entry.row === row && col >= entry.colStart && col < entry.colEnd);
}
