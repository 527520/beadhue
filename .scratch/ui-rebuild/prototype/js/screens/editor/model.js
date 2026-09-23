// 图纸与跟拼进度的数据操作：全部是纯函数或只改传入的数组，便于撤销重做。
import { BEADS } from '../../../motifs.js';

export const clonePattern = (pattern) => ({ width: pattern.width, height: pattern.height, keys: pattern.keys.slice() });
export const inside = (pattern, col, row) => col >= 0 && row >= 0 && col < pattern.width && row < pattern.height;

export function usage(keys) {
  const counts = new Map();
  for (const key of keys) if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, ...BEADS[key], count }));
}
export const beadTotal = (keys) => keys.reduce((sum, key) => sum + (key ? 1 : 0), 0);

/** 画笔 / 橡皮落点：size 1 为单格，2 以落点为左上，3 以落点为中心。返回改动格数。 */
export function stamp(pattern, col, row, size, key) {
  const start = -Math.floor((size - 1) / 2);
  let changed = 0;
  for (let dy = 0; dy < size; dy += 1) {
    for (let dx = 0; dx < size; dx += 1) {
      const c = col + start + dx;
      const r = row + start + dy;
      if (!inside(pattern, c, r)) continue;
      const i = r * pattern.width + c;
      if (pattern.keys[i] !== key) { pattern.keys[i] = key; changed += 1; }
    }
  }
  return changed;
}

/** 两格之间的直线（Bresenham），拖动过快时不留空隙。 */
export function line(a, b) {
  const cells = [];
  let { col: x0, row: y0 } = a;
  const { col: x1, row: y1 } = b;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    cells.push({ col: x0, row: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return cells;
}

/** 四连通填充，返回改动格数。 */
export function floodFill(pattern, col, row, key) {
  const { width, height, keys } = pattern;
  const start = row * width + col;
  const target = keys[start];
  if (target === key) return 0;
  const stack = [start];
  let changed = 0;
  while (stack.length) {
    const i = stack.pop();
    if (keys[i] !== target) continue;
    keys[i] = key;
    changed += 1;
    const x = i % width;
    if (x > 0) stack.push(i - 1);
    if (x < width - 1) stack.push(i + 1);
    if (i >= width) stack.push(i - width);
    if (i < width * (height - 1)) stack.push(i + width);
  }
  return changed;
}

export function replaceAll(pattern, from, to) {
  let changed = 0;
  pattern.keys.forEach((key, i) => { if (key === from) { pattern.keys[i] = to; changed += 1; } });
  return changed;
}

/** 顺时针旋转 90° / 左右镜像 / 上下镜像；图纸格与跟拼进度用同一变换。 */
export function transformCells(cells, width, height, kind) {
  const out = new cells.constructor(cells.length);
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const value = cells[row * width + col];
      if (kind === 'rotate') out[col * height + (height - 1 - row)] = value;
      else if (kind === 'mirror-h') out[row * width + (width - 1 - col)] = value;
      else out[(height - 1 - row) * width + col] = value;
    }
  }
  return out;
}
export function transformPattern(pattern, kind) {
  const keys = transformCells(pattern.keys, pattern.width, pattern.height, kind);
  return kind === 'rotate' ? { width: pattern.height, height: pattern.width, keys } : { width: pattern.width, height: pattern.height, keys };
}

// ---------- 跟拼：板块、板内行、进度 ----------
export function boardGrid(pattern, board) {
  const cols = Math.ceil(pattern.width / board);
  const rows = Math.ceil(pattern.height / board);
  return { cols, rows, count: cols * rows };
}
export function boardRect(pattern, board, index) {
  const { cols } = boardGrid(pattern, board);
  const x = (index % cols) * board;
  const y = Math.floor(index / cols) * board;
  return { x, y, w: Math.min(board, pattern.width - x), h: Math.min(board, pattern.height - y) };
}
/** 板内第 local 行（0 起）的格索引。 */
export function rowCells(pattern, board, index, local) {
  const rect = boardRect(pattern, board, index);
  const row = rect.y + local;
  return Array.from({ length: rect.w }, (_, k) => row * pattern.width + rect.x + k);
}
/** 所有「有可拼格」的行，按板块顺序、板内自上而下。 */
export function rowList(pattern, board) {
  const list = [];
  const { count } = boardGrid(pattern, board);
  for (let index = 0; index < count; index += 1) {
    const rect = boardRect(pattern, board, index);
    for (let local = 0; local < rect.h; local += 1) {
      const cells = rowCells(pattern, board, index, local).filter((i) => pattern.keys[i]);
      if (cells.length) list.push({ board: index, local, cells });
    }
  }
  return list;
}
export function progressStats(pattern, progress, cells = null) {
  let total = 0;
  let done = 0;
  const list = cells ?? pattern.keys.map((_, i) => i);
  for (const i of list) {
    if (!pattern.keys[i]) continue;
    total += 1;
    if (progress[i]) done += 1;
  }
  return { total, done, percent: total ? Math.floor((done / total) * 100) : 0 };
}
export function boardCells(pattern, board, index) {
  const rect = boardRect(pattern, board, index);
  const cells = [];
  for (let row = rect.y; row < rect.y + rect.h; row += 1) for (let col = rect.x; col < rect.x + rect.w; col += 1) cells.push(row * pattern.width + col);
  return cells;
}
/** 演示数据：按行顺序把前 percent% 的可拼格标为已拼。 */
export function seedProgress(pattern, board, percent) {
  const progress = new Uint8Array(pattern.width * pattern.height);
  if (!percent) return progress;
  const goal = Math.round(beadTotal(pattern.keys) * (percent / 100));
  let done = 0;
  for (const row of rowList(pattern, board)) {
    if (done >= goal) break;
    for (const i of row.cells) progress[i] = 1;
    done += row.cells.length;
  }
  return progress;
}
/** 行内颜色序列（含留空），例如 [{key:'K', n:3}, {key:null, n:2}]。 */
export function rowRuns(pattern, board, index, local) {
  const runs = [];
  for (const i of rowCells(pattern, board, index, local)) {
    const key = pattern.keys[i] ?? null;
    const last = runs[runs.length - 1];
    if (last && last.key === key) last.n += 1; else runs.push({ key, n: 1 });
  }
  while (runs.length && runs[runs.length - 1].key === null) runs.pop();
  return runs;
}
