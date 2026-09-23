// 画布视口：居中适配、缩放、平移、渲染与指针手势。
// 写入图纸 / 跟拼进度的动作全部经 hooks 交给编辑器；平移、滚轮与双指缩放只改视图，永不写入。
import { drawPattern } from '../../beads.js';
import { BEADS } from '../../../motifs.js';
import { boardRect } from './model.js';

export const BASE_CELL = 20;
const STEPS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const LIGHT = Object.fromEntries(Object.entries(BEADS).map(([key, bead]) => [key, luminance(bead.hex) > 0.45]));

export function readColors() {
  const style = getComputedStyle(document.documentElement);
  const v = (name) => style.getPropertyValue(name).trim();
  return { ink: v('--ink'), bg: v('--bg'), subtle: v('--bg-subtle'), line: v('--line-strong'), accent: v('--accent'), onInk: v('--on-ink'), mono: v('--font-mono') };
}

export function createViewport(wrap, canvas, hooks) {
  const g = canvas.getContext('2d');
  const view = { cell: 12, ox: 0, oy: 0, w: 0, h: 0, touched: false };
  let dpr = Math.min(2, window.devicePixelRatio || 1);
  let colors = readColors();
  let hover = null;
  let raf = 0;
  const pointers = new Map();
  let gesture = null;
  let wheelAcc = 0;

  const draw = () => { if (!raf) raf = requestAnimationFrame(render); };
  const pattern = () => hooks.state().pattern;

  function clampPan() {
    const p = pattern();
    const keep = 48;
    view.ox = clamp(view.ox, keep - p.width * view.cell, view.w - keep);
    view.oy = clamp(view.oy, keep - p.height * view.cell, view.h - keep);
  }
  function changed() { clampPan(); draw(); hooks.viewChanged(); }

  function fit() {
    const p = pattern();
    const m = hooks.margins();
    const aw = Math.max(40, view.w - m.left - m.right);
    const ah = Math.max(40, view.h - m.top - m.bottom);
    let cell = Math.min(aw / p.width, ah / p.height, 48);
    cell = cell >= 4 ? Math.floor(cell) : Math.max(1, cell);
    view.cell = cell;
    view.ox = Math.round(m.left + (aw - p.width * cell) / 2);
    view.oy = Math.round(m.top + (ah - p.height * cell) / 2);
    view.touched = false;
    changed();
  }
  function zoomAt(px, py, next) {
    next = clamp(next, 1, STEPS[STEPS.length - 1]);
    const k = next / view.cell;
    view.ox = px - (px - view.ox) * k;
    view.oy = py - (py - view.oy) * k;
    view.cell = next;
    view.touched = true;
    changed();
  }
  const stepFrom = (cell, dir) => (dir > 0 ? STEPS.find((s) => s > cell + 0.01) ?? STEPS[STEPS.length - 1] : [...STEPS].reverse().find((s) => s < cell - 0.01) ?? Math.min(cell, STEPS[0]));
  const zoomStep = (dir, px = view.w / 2, py = view.h / 2) => zoomAt(px, py, stepFrom(view.cell, dir));
  const zoomToPercent = (percent) => zoomAt(view.w / 2, view.h / 2, (BASE_CELL * percent) / 100);

  /** 保证图纸上某个矩形（格）在视野里；放不下时缩小到正好放下。 */
  function reveal(rect, { center = false } = {}) {
    const m = hooks.margins();
    const aw = view.w - m.left - m.right;
    const ah = view.h - m.top - m.bottom;
    if (rect.w * view.cell > aw || rect.h * view.cell > ah) {
      const cell = Math.max(2, Math.floor(Math.min(aw / rect.w, ah / rect.h)));
      view.cell = Math.min(view.cell, cell);
      center = true;
    }
    const x0 = view.ox + rect.x * view.cell;
    const y0 = view.oy + rect.y * view.cell;
    const x1 = x0 + rect.w * view.cell;
    const y1 = y0 + rect.h * view.cell;
    const outside = x0 < m.left || y0 < m.top || x1 > view.w - m.right || y1 > view.h - m.bottom;
    if (center || outside) {
      view.ox = Math.round(m.left + aw / 2 - (rect.x + rect.w / 2) * view.cell);
      view.oy = Math.round(m.top + ah / 2 - (rect.y + rect.h / 2) * view.cell);
    }
    view.touched = true;
    changed();
  }

  function resize() {
    const rect = wrap.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const prev = { ...view };
    dpr = Math.min(2, window.devicePixelRatio || 1);
    view.w = rect.width;
    view.h = rect.height;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    if (!prev.w || !view.touched) { fit(); return; }
    view.ox += (view.w - prev.w) / 2;
    view.oy += (view.h - prev.h) / 2;
    changed();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(wrap);

  // ---------- 渲染 ----------
  function visibleRange(p) {
    const c0 = Math.max(0, Math.floor(-view.ox / view.cell));
    const r0 = Math.max(0, Math.floor(-view.oy / view.cell));
    const c1 = Math.min(p.width, Math.ceil((view.w - view.ox) / view.cell));
    const r1 = Math.min(p.height, Math.ceil((view.h - view.oy) / view.cell));
    return { c0, r0, c1, r1 };
  }
  function cellRect(col, row, w = 1, h = 1) {
    return [view.ox + col * view.cell, view.oy + row * view.cell, w * view.cell, h * view.cell];
  }

  function render() {
    raf = 0;
    const S = hooks.state();
    const p = S.pattern;
    const { cell, ox, oy } = view;
    const pw = p.width * cell;
    const ph = p.height * cell;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, view.w, view.h);
    g.save();
    g.shadowColor = colors.line;
    g.shadowBlur = 18;
    g.shadowOffsetY = 2;
    g.fillStyle = colors.bg;
    g.fillRect(ox, oy, pw, ph);
    g.restore();
    drawPattern(g, p, { x: ox, y: oy, cell, mode: 'flat', grid: S.showGrid, seams: S.showSeams, board: S.board });
    const range = visibleRange(p);
    if (S.showCodes && cell >= 18) drawCodes(p, range);
    if (S.highlight) drawHighlight(p, range, S.highlight);
    if (S.mode === 'stitch') drawStitch(S, p, range);
    drawHover(S, p);
    g.strokeStyle = colors.line;
    g.lineWidth = 1;
    g.strokeRect(Math.round(ox) - 0.5, Math.round(oy) - 0.5, Math.round(pw) + 1, Math.round(ph) + 1);
  }

  function drawCodes(p, { c0, r0, c1, r1 }) {
    const size = clamp(Math.round(view.cell * 0.34), 8, 15);
    g.font = `600 ${size}px ${colors.mono}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let row = r0; row < r1; row += 1) {
      for (let col = c0; col < c1; col += 1) {
        const key = p.keys[row * p.width + col];
        if (!key) continue;
        g.fillStyle = LIGHT[key] ? colors.ink : colors.onInk;
        g.globalAlpha = LIGHT[key] ? 0.72 : 0.9;
        g.fillText(BEADS[key].code, view.ox + (col + 0.5) * view.cell, view.oy + (row + 0.5) * view.cell + 0.5);
      }
    }
    g.globalAlpha = 1;
  }

  function drawHighlight(p, { c0, r0, c1, r1 }, key) {
    g.fillStyle = colors.bg;
    g.globalAlpha = 0.8;
    g.beginPath();
    for (let row = r0; row < r1; row += 1) {
      for (let col = c0; col < c1; col += 1) if (p.keys[row * p.width + col] !== key) g.rect(...cellRect(col, row));
    }
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = colors.ink;
    g.lineWidth = Math.max(1, Math.min(2, view.cell * 0.12));
    g.beginPath();
    for (let row = r0; row < r1; row += 1) {
      for (let col = c0; col < c1; col += 1) {
        if (p.keys[row * p.width + col] !== key) continue;
        const [x, y, w, h] = cellRect(col, row);
        g.rect(x + 0.5, y + 0.5, w - 1, h - 1);
      }
    }
    if (view.cell >= 6) g.stroke();
  }

  function drawStitch(S, p, { c0, r0, c1, r1 }) {
    const { cell } = view;
    g.fillStyle = colors.bg;
    g.globalAlpha = 0.64;
    g.beginPath();
    for (let row = r0; row < r1; row += 1) {
      for (let col = c0; col < c1; col += 1) {
        const i = row * p.width + col;
        if (p.keys[i] && S.progress[i]) g.rect(...cellRect(col, row));
      }
    }
    g.fill();
    if (cell >= 9) {
      g.globalAlpha = 0.62;
      g.strokeStyle = colors.ink;
      g.lineWidth = Math.max(1.2, cell * 0.09);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      for (let row = r0; row < r1; row += 1) {
        for (let col = c0; col < c1; col += 1) {
          const i = row * p.width + col;
          if (!p.keys[i] || !S.progress[i]) continue;
          const x = view.ox + col * cell;
          const y = view.oy + row * cell;
          g.moveTo(x + cell * 0.28, y + cell * 0.52);
          g.lineTo(x + cell * 0.44, y + cell * 0.68);
          g.lineTo(x + cell * 0.74, y + cell * 0.34);
        }
      }
      g.stroke();
    }
    const row = S.currentRow;
    if (!row) { g.globalAlpha = 1; return; }
    const rect = boardRect(p, S.board, row.board);
    const [bx, by, bw, bh] = cellRect(rect.x, rect.y, rect.w, rect.h);
    g.fillStyle = colors.subtle;
    g.globalAlpha = 0.66;
    g.beginPath();
    g.rect(view.ox, view.oy, p.width * cell, p.height * cell);
    g.rect(bx, by, bw, bh);
    g.fill('evenodd');
    g.globalAlpha = 1;
    g.strokeStyle = colors.ink;
    g.lineWidth = 2;
    g.strokeRect(bx - 1, by - 1, bw + 2, bh + 2);
    const [rx, ry, rw, rh] = cellRect(rect.x, rect.y + row.local, rect.w, 1);
    g.fillStyle = colors.accent;
    g.globalAlpha = 0.14;
    g.fillRect(rx, ry, rw, rh);
    g.globalAlpha = 1;
    g.strokeStyle = colors.accent;
    g.lineWidth = 2;
    g.strokeRect(rx, ry, rw, rh);
  }

  function drawHover(S, p) {
    if (!hover) return;
    const { size, fill } = hooks.footprint(hover);
    if (!size) return;
    const start = -Math.floor((size - 1) / 2);
    const col = clamp(hover.col + start, 0, p.width - 1);
    const row = clamp(hover.row + start, 0, p.height - 1);
    const w = Math.min(size, p.width - col);
    const h = Math.min(size, p.height - row);
    const [x, y, cw, ch] = cellRect(col, row, w, h);
    if (fill) {
      g.fillStyle = fill;
      g.globalAlpha = 0.55;
      g.fillRect(x, y, cw, ch);
      g.globalAlpha = 1;
    }
    g.lineWidth = 3;
    g.strokeStyle = colors.bg;
    g.strokeRect(x - 0.5, y - 0.5, cw + 1, ch + 1);
    g.lineWidth = 1.5;
    g.strokeStyle = colors.ink;
    g.strokeRect(x - 0.5, y - 0.5, cw + 1, ch + 1);
  }

  // ---------- 指针 ----------
  const local = (event) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  function cellAt(x, y) {
    const p = pattern();
    const col = Math.floor((x - view.ox) / view.cell);
    const row = Math.floor((y - view.oy) / view.cell);
    return col >= 0 && row >= 0 && col < p.width && row < p.height ? { col, row } : null;
  }
  function setHover(cell) {
    const same = cell && hover && cell.col === hover.col && cell.row === hover.row;
    if (same || (!cell && !hover)) return;
    hover = cell;
    draw();
    hooks.hover(cell);
  }
  const span = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const middle = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  function onDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
    const point = local(event);
    pointers.set(event.pointerId, point);
    if (pointers.size === 2) {
      if (gesture?.kind === 'stroke') hooks.strokeCancel();
      const [a, b] = [...pointers.values()];
      gesture = { kind: 'pinch', d0: span(a, b) || 1, cell0: view.cell, mid0: middle(a, b), ox0: view.ox, oy0: view.oy };
      setHover(null);
      return;
    }
    if (pointers.size > 2) return;
    const kind = event.button === 1 ? 'pan' : hooks.gesture(event);
    gesture = { kind, id: event.pointerId, x0: point.x, y0: point.y, x: point.x, y: point.y, moved: false, touch: event.pointerType !== 'mouse' };
    if (kind === 'pan') canvas.classList.add('is-panning');
    const cell = cellAt(point.x, point.y);
    if (kind === 'stroke') { gesture.last = cell; hooks.strokeStart(cell); }
    setHover(cell);
  }
  function onMove(event) {
    const point = local(event);
    if (!pointers.has(event.pointerId)) {
      if (event.pointerType === 'mouse') setHover(cellAt(point.x, point.y));
      return;
    }
    pointers.set(event.pointerId, point);
    if (!gesture) return;
    if (gesture.kind === 'pinch') {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()];
      const mid = middle(a, b);
      const next = clamp(gesture.cell0 * (span(a, b) / gesture.d0), 1, STEPS[STEPS.length - 1]);
      const k = next / gesture.cell0;
      view.cell = next;
      view.ox = mid.x - (gesture.mid0.x - gesture.ox0) * k;
      view.oy = mid.y - (gesture.mid0.y - gesture.oy0) * k;
      view.touched = true;
      changed();
      return;
    }
    if (event.pointerId !== gesture.id || gesture.kind === 'idle') return;
    const dx = point.x - gesture.x;
    const dy = point.y - gesture.y;
    gesture.x = point.x;
    gesture.y = point.y;
    if (!gesture.moved && Math.hypot(point.x - gesture.x0, point.y - gesture.y0) > (gesture.touch ? 8 : 4)) {
      gesture.moved = true;
      if (gesture.kind === 'tap') { gesture.kind = 'pan'; canvas.classList.add('is-panning'); }
    }
    if (gesture.kind === 'pan') {
      view.ox += dx;
      view.oy += dy;
      view.touched = true;
      changed();
      return;
    }
    const cell = cellAt(point.x, point.y);
    if (gesture.kind === 'stroke' && cell && (!gesture.last || cell.col !== gesture.last.col || cell.row !== gesture.last.row)) {
      hooks.strokeMove(gesture.last, cell);
      gesture.last = cell;
    }
    setHover(cell);
  }
  function snapCell() {
    if (view.cell < 4) return;
    const next = Math.round(view.cell);
    const k = next / view.cell;
    view.ox = view.w / 2 - (view.w / 2 - view.ox) * k;
    view.oy = view.h / 2 - (view.h / 2 - view.oy) * k;
    view.cell = next;
    changed();
  }
  function onUp(event) {
    if (!pointers.has(event.pointerId)) return;
    const point = local(event);
    pointers.delete(event.pointerId);
    if (!gesture) return;
    if (gesture.kind === 'pinch') {
      if (pointers.size < 2) { snapCell(); gesture = pointers.size ? { kind: 'idle', id: [...pointers.keys()][0] } : null; }
      return;
    }
    if (event.pointerId !== gesture.id) return;
    if (gesture.kind === 'stroke') hooks.strokeEnd();
    if (gesture.kind === 'tap' && !gesture.moved) {
      const cell = cellAt(point.x, point.y);
      if (cell) hooks.tap(cell);
    }
    canvas.classList.remove('is-panning');
    gesture = null;
    if (event.pointerType !== 'mouse') setHover(null);
  }
  function onCancel(event) {
    pointers.delete(event.pointerId);
    if (gesture?.kind === 'stroke') hooks.strokeCancel();
    canvas.classList.remove('is-panning');
    gesture = null;
    setHover(null);
  }
  function onWheel(event) {
    event.preventDefault();
    const point = local(event);
    wheelAcc += event.deltaY * (event.deltaMode === 1 ? 16 : 1) * (event.ctrlKey ? 4 : 1);
    if (Math.abs(wheelAcc) < 40) return;
    zoomStep(wheelAcc > 0 ? -1 : 1, point.x, point.y);
    wheelAcc = 0;
  }
  function onKey(event) {
    const step = 48;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (!moves[event.key]) return;
    event.preventDefault();
    view.ox += moves[event.key][0];
    view.oy += moves[event.key][1];
    view.touched = true;
    changed();
  }
  const onLeave = () => { if (!pointers.size) setHover(null); };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('keydown', onKey);

  return {
    view,
    draw,
    fit,
    zoomStep,
    zoomToPercent,
    reveal,
    cellAt,
    percent: () => Math.round((view.cell / BASE_CELL) * 100),
    isBusy: () => Boolean(gesture),
    refreshColors() { colors = readColors(); draw(); },
    destroy() {
      observer.disconnect();
      cancelAnimationFrame(raf);
    },
  };
}
