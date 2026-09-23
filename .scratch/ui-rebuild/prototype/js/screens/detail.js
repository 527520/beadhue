// 作品详情：左侧图纸查看器（缩放、拖动、网格、色号、板块、全屏）+ 右侧吸顶制作卡，下方讨论、相似作品、作者的更多作品。
import { icon } from '../icons.js';
import { $, esc, avatar, isLiked, workCard, openDialog, openPopover, isMobile, toast } from '../ui.js';
import { COMMENTS, getWork, relatedWorks, worksBy } from '../data.js';
import { drawPattern, patternImage } from '../beads.js';

const BOARD = 29;
const GRID_MIN = 14; // 每格 ≥14px 自动出现网格
const CODE_MIN = 18; // 方格模式每格 ≥18px 才画色号
const CODE_ZOOM = 24; // 打开色号时至少放大到这个格宽，保证一打开就读得清
const STOPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8]; // 相对「适配」的缩放档位
const REASONS = [
  ['copyright', '侵权', '未经授权使用他人的原创作品、角色或商标'],
  ['inappropriate', '不适宜内容', '色情、暴力或令人不适的画面与文字'],
  ['spam', '垃圾广告', '引流、推广，或与拼豆无关的内容'],
  ['other', '其他', '以上都不符合，请在下方写一句说明'],
];

const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const boardCount = ({ width, height }) => Math.ceil(width / BOARD) * Math.ceil(height / BOARD);

function rgba(hex, alpha) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
function luminance(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** 每种豆色的色号文字颜色：深墨与白色里对比度更高的那个。 */
function codeStyles(work) {
  const ink = token('--ink');
  const light = token('--on-ink');
  const inkL = luminance(ink);
  return new Map(work.usage.map((color) => {
    const l = luminance(color.hex);
    const dark = (l + 0.05) / (inkL + 0.05) >= 1.05 / (l + 0.05);
    return [color.key, { code: color.code, fill: dark ? rgba(ink, 0.82) : rgba(light, 0.95) }];
  }));
}

function publishedOn(days) {
  const date = new Date(Date.now() - days * 86400000);
  const two = (n) => String(n).padStart(2, '0');
  return { iso: `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`, label: `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日` };
}

// ---------- 画布叠加层：网格、板块、色号（beads.js 的豆粒模式不画这些） ----------
function drawGrid(g, { x, y, cell, box, color, alpha, dpr = 1 }) {
  const device = Math.max(1, Math.round(dpr));
  const width = device / dpr;
  const offset = (device % 2) / 2 / dpr;
  const snap = (v) => Math.round(v * dpr) / dpr + offset;
  const left = x + box.c0 * cell;
  const right = x + box.c1 * cell;
  const top = y + box.r0 * cell;
  const bottom = y + box.r1 * cell;
  g.save();
  g.strokeStyle = color;
  g.globalAlpha = alpha;
  g.lineWidth = width;
  g.beginPath();
  for (let col = box.c0; col <= box.c1; col += 1) { const p = snap(x + col * cell); g.moveTo(p, top); g.lineTo(p, bottom); }
  for (let row = box.r0; row <= box.r1; row += 1) { const p = snap(y + row * cell); g.moveTo(left, p); g.lineTo(right, p); }
  g.stroke();
  g.restore();
}

function drawSeams(g, pattern, { x, y, cell, color, labelColor, font }) {
  const { width, height } = pattern;
  g.save();
  g.strokeStyle = color;
  g.globalAlpha = 0.6;
  g.lineWidth = 2;
  g.beginPath();
  for (let col = BOARD; col < width; col += BOARD) { const p = x + col * cell; g.moveTo(p, y); g.lineTo(p, y + height * cell); }
  for (let row = BOARD; row < height; row += BOARD) { const p = y + row * cell; g.moveTo(x, p); g.lineTo(x + width * cell, p); }
  g.stroke();
  const lastBoard = (size) => size - BOARD * Math.floor((size - 1) / BOARD);
  // 最窄的一块（末尾不满 29 格的那块）也放得下编号时才标。
  if (Math.min(lastBoard(width), lastBoard(height)) * cell >= 28) {
    let index = 0;
    g.font = `600 12px ${font}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let row = 0; row < height; row += BOARD) {
      for (let col = 0; col < width; col += BOARD) {
        index += 1;
        const lx = x + col * cell + 4;
        const ly = y + row * cell + 4;
        g.globalAlpha = 0.86;
        g.fillStyle = color;
        g.beginPath();
        if (g.roundRect) g.roundRect(lx, ly, 22, 20, 6); else g.rect(lx, ly, 22, 20);
        g.fill();
        g.globalAlpha = 1;
        g.fillStyle = labelColor;
        g.fillText(String(index), lx + 11, ly + 10.5);
      }
    }
  }
  g.restore();
}

function drawCodes(g, pattern, styles, { x, y, cell, box, font }) {
  const size = Math.min(13, Math.max(7, cell * 0.4));
  g.save();
  g.font = `600 ${size.toFixed(1)}px ${font}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let row = box.r0; row < box.r1; row += 1) {
    for (let col = box.c0; col < box.c1; col += 1) {
      const key = pattern.keys[row * pattern.width + col];
      if (!key) continue;
      const style = styles.get(key);
      g.fillStyle = style.fill;
      g.fillText(style.code, x + col * cell + cell / 2, y + row * cell + cell / 2 + 0.5);
    }
  }
  g.restore();
}

// ---------- 查看器 ----------
function stageMarkup(work, { guest = false, full = false } = {}) {
  const { width, height } = work.pattern;
  const single = boardCount(work.pattern) < 2;
  const id = full ? 'wd-keys-full' : 'wd-keys';
  const tip = (label) => `aria-label="${label}" data-tip="${label}" data-tip-side="top"`;
  const tool = (key, name, label, { lock = '', desk = false } = {}) => `<button type="button" class="btn btn-sm btn-ghost wd-tool ${desk ? 'wd-desk' : ''}" data-v="${key}" aria-pressed="false" aria-label="${label}" data-tip="${lock || label}" data-tip-side="top"${lock ? ' aria-disabled="true"' : ''}>${icon(name)}<span class="wd-tool-label">${label}</span></button>`;
  return `<div class="wd-stage ${full ? 'is-full' : ''}" data-stage tabindex="0" role="region" aria-label="图纸查看器" aria-describedby="${id}"${full ? ' autofocus' : ''}>
    <canvas role="img" aria-label="${esc(work.title)}：${width}×${height} 格拼豆图纸，${work.usage.length} 种颜色"></canvas>
    <p class="sr-only" id="${id}">方向键平移，加号和减号缩放，0 键适配窗口。</p>
    <p class="wd-hint" data-v-hint role="status" hidden></p>
    <div class="wd-toolbar" role="toolbar" aria-label="查看器工具">
      <button type="button" class="icon-btn sm" data-v="out" ${tip('缩小')}>${icon('zoom-out')}</button>
      <output class="wd-pct wd-desk" data-v-pct>100%</output>
      <button type="button" class="icon-btn sm" data-v="in" ${tip('放大')}>${icon('zoom-in')}</button>
      <button type="button" class="icon-btn sm" data-v="fit" ${tip('适配窗口')}>${icon('scan')}</button>
      <span class="wd-sep wd-desk" aria-hidden="true"></span>
      ${tool('grid', 'grid-3x3', '网格')}
      ${tool('codes', 'hash', '色号', { lock: guest ? '登录后可查看色号' : '' })}
      ${tool('seams', 'grid-2x2', '板块', { lock: single ? '这张图纸只需 1 块底板' : '', desk: true })}
      <span class="wd-sep wd-desk" aria-hidden="true"></span>
      <div class="seg wd-desk" role="group" aria-label="显示方式"><button type="button" class="seg-item" data-v-mode="bead" aria-pressed="true">豆粒</button><button type="button" class="seg-item" data-v-mode="flat" aria-pressed="false">方格</button></div>
      <span class="wd-sep wd-desk" aria-hidden="true"></span>
      <button type="button" class="icon-btn sm wd-desk" data-v="${full ? 'exit' : 'full'}" ${tip(full ? '退出全屏' : '全屏查看')}>${icon(full ? 'minimize-2' : 'maximize-2')}</button>
    </div>
  </div>`;
}

/** 页面查看器与全屏查看器共用；view 为两者共享的显示偏好。 */
function createViewer(stage, work, view, { guest = false, full = false, onFull, onExit, onLocked } = {}) {
  const canvas = $('canvas', stage);
  const g = canvas.getContext('2d');
  const toolbar = $('.wd-toolbar', stage);
  const hint = $('[data-v-hint]', stage);
  const { pattern } = work;
  const boards = boardCount(pattern);
  const styles = codeStyles(work);
  const paint = { board: token('--bg'), ink: token('--ink'), light: token('--on-ink'), sans: token('--font-sans'), mono: token('--font-mono') };
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  let W = 0;
  let H = 0;
  let dpr = 1;
  let fitCell = 1;
  let cell = 1;
  let ox = 0;
  let oy = 0;
  let atFit = true;
  let frame = 0;
  let flashText = '';
  let flashTimer = 0;
  let wheelHinted = false;

  const compact = () => isMobile() && !full;
  let reserve = true;
  // 桌面工具条居中压在底部，适配时总给它让出位置；手机迷你工具条在右下角，只有会压住豆子时才让位。
  function area(withToolbar = reserve) {
    const pad = compact() ? 12 : 24;
    const bottom = withToolbar ? H - toolbar.offsetTop + (compact() ? 8 : 12) : pad;
    return { x: pad, y: pad, w: Math.max(1, W - pad * 2), h: Math.max(1, H - pad - bottom) };
  }
  function coversBeads(a) {
    const size = Math.min(a.w / pattern.width, a.h / pattern.height);
    const x = a.x + (a.w - pattern.width * size) / 2;
    const y = a.y + (a.h - pattern.height * size) / 2;
    const left = toolbar.offsetLeft - 4;
    const top = toolbar.offsetTop - 4;
    const c0 = Math.max(0, Math.floor((left - x) / size));
    const c1 = Math.min(pattern.width - 1, Math.floor((left + toolbar.offsetWidth + 8 - x) / size));
    const r0 = Math.max(0, Math.floor((top - y) / size));
    const r1 = Math.min(pattern.height - 1, Math.floor((top + toolbar.offsetHeight + 8 - y) / size));
    for (let row = r0; row <= r1; row += 1) {
      for (let col = c0; col <= c1; col += 1) if (pattern.keys[row * pattern.width + col]) return true;
    }
    return false;
  }
  function measure() {
    W = stage.clientWidth;
    H = stage.clientHeight;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    reserve = !compact() || coversBeads(area(false));
    const a = area();
    fitCell = Math.max(0.5, Math.min(a.w / pattern.width, a.h / pattern.height));
  }
  const minCell = () => fitCell * STOPS[0];
  const maxCell = () => Math.max(fitCell * STOPS[STOPS.length - 1], CODE_ZOOM * 2);
  const pannable = () => { const a = area(); return pattern.width * cell > a.w + 0.5 || pattern.height * cell > a.h + 0.5; };
  // 图纸比可视区小时居中；比可视区大时只能拖到边缘贴齐可视区。
  function clampView() {
    const a = area();
    const pw = pattern.width * cell;
    const ph = pattern.height * cell;
    ox = pw <= a.w ? a.x + (a.w - pw) / 2 : Math.min(a.x, Math.max(a.x + a.w - pw, ox));
    oy = ph <= a.h ? a.y + (a.h - ph) / 2 : Math.min(a.y, Math.max(a.y + a.h - ph, oy));
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(draw); }
  function zoomTo(next, px, py) {
    const a = area();
    const cx = px ?? a.x + a.w / 2;
    const cy = py ?? a.y + a.h / 2;
    const target = Math.min(maxCell(), Math.max(minCell(), next));
    ox = cx - ((cx - ox) * target) / cell;
    oy = cy - ((cy - oy) * target) / cell;
    cell = target;
    atFit = Math.abs(cell - fitCell) < 0.001;
    clampView();
    schedule();
  }
  function fit() { cell = fitCell; atFit = true; clampView(); schedule(); }
  function step(dir) {
    const ratio = cell / fitCell;
    const next = dir > 0 ? STOPS.find((s) => s > ratio + 0.001) : [...STOPS].reverse().find((s) => s < ratio - 0.001);
    if (next) zoomTo(fitCell * next);
  }
  // 网格：auto 时每格够大才出现；用户手动开 / 关后以手动为准。
  const gridOn = () => (view.grid === 'on' ? cell >= 4 : view.grid === 'auto' && cell >= GRID_MIN);
  const codesOn = () => view.codes && view.mode === 'flat' && !guest;
  function visibleBox() {
    return {
      c0: Math.max(0, Math.floor(-ox / cell)), c1: Math.min(pattern.width, Math.ceil((W - ox) / cell)),
      r0: Math.max(0, Math.floor(-oy / cell)), r1: Math.min(pattern.height, Math.ceil((H - oy) / cell)),
    };
  }
  function cropped(box) {
    if (!box.c0 && !box.r0 && box.c1 === pattern.width && box.r1 === pattern.height) return pattern;
    const width = box.c1 - box.c0;
    const height = box.r1 - box.r0;
    const keys = new Array(width * height);
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) keys[row * width + col] = pattern.keys[(row + box.r0) * pattern.width + col + box.c0];
    }
    return { id: pattern.id, width, height, keys };
  }
  function draw() {
    frame = 0;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const box = visibleBox();
    if (box.c1 > box.c0 && box.r1 > box.r0) {
      g.save();
      g.shadowColor = rgba(paint.ink, 0.12);
      g.shadowBlur = 20;
      g.shadowOffsetY = 4;
      g.fillStyle = paint.board;
      g.fillRect(ox, oy, pattern.width * cell, pattern.height * cell);
      g.restore();
      drawPattern(g, cropped(box), { x: ox + box.c0 * cell, y: oy + box.r0 * cell, cell, mode: view.mode });
      if (gridOn()) drawGrid(g, { x: ox, y: oy, cell, box, color: paint.ink, alpha: view.mode === 'bead' ? 0.06 : 0.16, dpr });
      if (view.seams && boards > 1) drawSeams(g, pattern, { x: ox, y: oy, cell, color: paint.ink, labelColor: paint.light, font: paint.sans });
      if (codesOn() && cell >= CODE_MIN) drawCodes(g, pattern, styles, { x: ox, y: oy, cell, box, font: paint.mono });
    }
    sync();
  }
  function sync() {
    const button = (key) => $(`[data-v="${key}"]`, toolbar);
    const setOff = (node, off) => { if (off) node.setAttribute('aria-disabled', 'true'); else node.removeAttribute('aria-disabled'); };
    $('[data-v-pct]', toolbar).textContent = `${Math.round((cell / fitCell) * 100)}%`;
    setOff(button('out'), cell <= minCell() + 0.001);
    setOff(button('in'), cell >= maxCell() - 0.001);
    button('grid').setAttribute('aria-pressed', String(gridOn()));
    button('codes').setAttribute('aria-pressed', String(view.codes && !guest));
    button('seams').setAttribute('aria-pressed', String(view.seams && boards > 1));
    toolbar.querySelectorAll('[data-v-mode]').forEach((node) => node.setAttribute('aria-pressed', String(node.dataset.vMode === view.mode)));
    const canPan = pannable();
    stage.classList.toggle('can-pan', canPan);
    stage.style.touchAction = canPan ? 'none' : 'pan-y';
    const text = flashText || (codesOn() && cell < CODE_MIN ? '再放大一些就能看到色号' : '');
    hint.hidden = !text;
    if (text && hint.textContent !== text) hint.textContent = text;
  }
  function flash(text) {
    flashText = text;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { flashText = ''; sync(); }, 1800);
    sync();
  }

  function toggleCodes() {
    view.codes = !view.codes;
    if (view.codes) {
      // 色号只画在方格上：从豆粒切过去，并放大到读得清的格宽。
      if (view.mode !== 'flat') { view.mode = 'flat'; view.autoFlat = true; }
      if (cell < CODE_ZOOM) zoomTo(CODE_ZOOM);
    } else if (view.autoFlat) {
      view.mode = 'bead';
      view.autoFlat = false;
    }
    schedule();
  }
  function setMode(mode) {
    view.mode = mode;
    view.autoFlat = false;
    if (mode === 'bead') view.codes = false;
    schedule();
  }
  toolbar.addEventListener('click', (event) => {
    const node = event.target.closest('button');
    if (!node) return;
    const action = node.dataset.v;
    if (node.getAttribute('aria-disabled') === 'true') {
      if (action === 'codes') onLocked?.();
      if (action === 'seams') toast('这张图纸只需 1 块底板', { iconName: 'info' });
      return;
    }
    if (node.dataset.vMode) { setMode(node.dataset.vMode); return; }
    const actions = {
      out: () => step(-1),
      in: () => step(1),
      fit,
      grid: () => { view.grid = gridOn() ? 'off' : 'on'; schedule(); },
      codes: toggleCodes,
      seams: () => { view.seams = !view.seams; schedule(); },
      full: () => onFull?.(),
      exit: () => onExit?.(),
    };
    actions[action]?.();
  });

  // 拖动平移、双指缩放。
  const pointers = new Map();
  let drag = null;
  let pinch = null;
  const local = (event) => { const rect = stage.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
  const middle = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  function begin() {
    const points = [...pointers.values()];
    if (points.length >= 2) {
      const [a, b] = points;
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, cell, mid: middle(a, b) };
      drag = null;
    } else if (points.length === 1) {
      drag = { ...points[0], ox, oy };
      pinch = null;
    } else {
      drag = null;
      pinch = null;
    }
  }
  function onDown(event) {
    if (event.target.closest('.wd-toolbar') || (event.pointerType === 'mouse' && event.button !== 0)) return;
    stage.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, local(event));
    begin();
  }
  function onMove(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, local(event));
    const points = [...pointers.values()];
    if (pinch && points.length >= 2) {
      const [a, b] = points;
      const mid = middle(a, b);
      ox += mid.x - pinch.mid.x;
      oy += mid.y - pinch.mid.y;
      pinch.mid = mid;
      zoomTo(pinch.cell * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.dist), mid.x, mid.y);
    } else if (drag) {
      const [point] = points;
      ox = drag.ox + point.x - drag.x;
      oy = drag.oy + point.y - drag.y;
      if (Math.hypot(point.x - drag.x, point.y - drag.y) > 3) stage.classList.add('is-panning');
      clampView();
      schedule();
    }
  }
  function onUp(event) {
    pointers.delete(event.pointerId);
    stage.classList.remove('is-panning');
    begin();
  }
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onUp);
  // 滚轮：按住 Ctrl / ⌘（含触控板双指捏合）缩放；页面里普通滚动交还给页面，全屏里用来平移。
  stage.addEventListener('wheel', (event) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const point = local(event);
      zoomTo(cell * Math.exp(-Math.max(-60, Math.min(60, event.deltaY)) * 0.01), point.x, point.y);
      return;
    }
    if (full && pannable()) {
      event.preventDefault();
      ox -= event.deltaX;
      oy -= event.deltaY;
      clampView();
      schedule();
      return;
    }
    if (!wheelHinted) { wheelHinted = true; flash(`按住 ${mac ? '⌘' : 'Ctrl'} 再滚动即可缩放`); }
  }, { passive: false });
  stage.addEventListener('dblclick', (event) => {
    if (event.target.closest('.wd-toolbar')) return;
    const point = local(event);
    if (cell >= maxCell() - 0.001) fit(); else zoomTo(cell * 2, point.x, point.y);
  });
  stage.addEventListener('keydown', (event) => {
    if (event.target !== stage) return;
    const pan = { ArrowLeft: [48, 0], ArrowRight: [-48, 0], ArrowUp: [0, 48], ArrowDown: [0, -48] }[event.key];
    if (pan) { event.preventDefault(); ox += pan[0]; oy += pan[1]; clampView(); schedule(); return; }
    if (event.key === '+' || event.key === '=') { event.preventDefault(); step(1); }
    if (event.key === '-' || event.key === '_') { event.preventDefault(); step(-1); }
    if (event.key === '0') { event.preventDefault(); fit(); }
  });

  // 尺寸变化：原本适配就重新适配，否则保持视野中心那一格不动。
  const observer = new ResizeObserver(() => {
    const before = area();
    const cx = (before.x + before.w / 2 - ox) / cell;
    const cy = (before.y + before.h / 2 - oy) / cell;
    measure();
    if (atFit) cell = fitCell;
    else {
      cell = Math.min(maxCell(), Math.max(minCell(), cell));
      const a = area();
      ox = a.x + a.w / 2 - cx * cell;
      oy = a.y + a.h / 2 - cy * cell;
    }
    clampView();
    draw();
  });
  measure();
  fit();
  draw();
  observer.observe(stage);

  return {
    refresh: schedule,
    destroy() { observer.disconnect(); cancelAnimationFrame(frame); clearTimeout(flashTimer); },
  };
}

// ---------- 下载：图纸 PNG、分享图 ----------
function saveCanvas(canvas, filename) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, 'image/png');
}

function patternSheet(work) {
  const { pattern } = work;
  const cell = 28;
  const pad = 32;
  const canvas = document.createElement('canvas');
  canvas.width = pattern.width * cell + pad * 2;
  canvas.height = pattern.height * cell + pad * 2;
  const g = canvas.getContext('2d');
  const box = { c0: 0, r0: 0, c1: pattern.width, r1: pattern.height };
  g.fillStyle = token('--bg');
  g.fillRect(0, 0, canvas.width, canvas.height);
  drawPattern(g, pattern, { x: pad, y: pad, cell, mode: 'flat' });
  drawGrid(g, { x: pad, y: pad, cell, box, color: token('--ink'), alpha: 0.18 });
  drawSeams(g, pattern, { x: pad, y: pad, cell, color: token('--ink'), labelColor: token('--on-ink'), font: token('--font-sans') });
  drawCodes(g, pattern, codeStyles(work), { x: pad, y: pad, cell, box, font: token('--font-mono') });
  return canvas;
}

async function posterSheet(work) {
  const { pattern } = work;
  const side = 1080;
  const height = 1350;
  const sans = token('--font-sans');
  const brand = token('--font-brand');
  try {
    await Promise.all([document.fonts.load(`600 56px ${sans}`, work.title), document.fonts.load(`400 34px ${brand}`, '豆色绘')]);
  } catch { /* 字体没加载到时回退系统字体 */ }
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = height;
  const g = canvas.getContext('2d');
  g.fillStyle = token('--bg');
  g.fillRect(0, 0, side, height);
  g.fillStyle = token('--bg-subtle');
  g.beginPath();
  if (g.roundRect) g.roundRect(64, 64, side - 128, side - 128, 48); else g.rect(64, 64, side - 128, side - 128);
  g.fill();
  const cell = 872 / Math.max(pattern.width, pattern.height);
  drawPattern(g, pattern, { x: (side - pattern.width * cell) / 2, y: (side - pattern.height * cell) / 2, cell, mode: 'bead' });
  g.fillStyle = token('--ink');
  g.font = `600 56px ${sans}`;
  g.fillText(work.title, 80, side + 72);
  g.fillStyle = token('--ink-3');
  g.font = `400 30px ${sans}`;
  g.fillText(`${work.author.name} · ${pattern.width}×${pattern.height} 格 · ${work.usage.length} 色 · ${work.beads} 颗`, 80, side + 128);
  g.fillStyle = token('--ink');
  g.font = `400 34px ${brand}`;
  g.fillText('豆色绘', 80, height - 56);
  const offset = g.measureText('豆色绘').width;
  g.fillStyle = token('--ink-3');
  g.font = `600 20px ${sans}`;
  g.fillText('BEADHUE · 拼豆图纸社区', 80 + offset + 16, height - 60);
  return canvas;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.className = 'sr-only';
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    area.remove();
    return ok;
  }
}

// ---------- 页面片段 ----------
function likeButton(work, size = '') {
  const on = isLiked(work.id);
  return `<button type="button" class="btn btn-outline ${size} like-btn wd-like" data-like="${work.id}" aria-pressed="${on}">${icon('heart')}<span class="sr-only">喜欢</span><span class="like-count t-num">${work.likes + (on ? 1 : 0)}</span></button>`;
}

function head(work) {
  const tag = work.tags[0];
  const date = publishedOn(work.daysAgo);
  const verified = work.author.official ? `<span class="wd-verified" role="img" aria-label="官方账号">${icon('badge-check', 's16')}</span>` : '';
  return `<header class="wd-head">
    <nav class="wd-crumbs" aria-label="位置"><a href="#/">发现</a><span aria-hidden="true">/</span><a href="#/?cat=${encodeURIComponent(tag)}">${esc(tag)}</a></nav>
    <div class="wd-title-row">
      <div class="wd-title-main">
        <h1 class="t-title-1">${esc(work.title)}</h1>
        <div class="wd-tags">${work.featured ? `<span class="badge featured">${icon('star', 'fill')}精选</span>` : ''}${work.tags.map((item) => `<a class="chip" href="#/?cat=${encodeURIComponent(item)}">${esc(item)}</a>`).join('')}</div>
        <p class="wd-byline"><a class="wd-author" href="#/u/${work.author.id}">${avatar(work.author, 'sm')}<span>${esc(work.author.name)}</span></a>${verified}<span aria-hidden="true">·</span><time datetime="${date.iso}" title="${date.label}">${work.daysAgo} 天前发布</time></p>
      </div>
      <div class="wd-actions">
        ${likeButton(work)}
        <button type="button" class="icon-btn" data-wd-share aria-haspopup="menu" aria-expanded="false" aria-label="分享" data-tip="分享">${icon('share-2')}</button>
        <button type="button" class="icon-btn" data-wd-more="work" aria-haspopup="menu" aria-expanded="false" aria-label="更多操作" data-tip="更多">${icon('ellipsis')}</button>
      </div>
    </div>
  </header>`;
}

function colorList(work, guest) {
  const count = work.usage.length;
  const top = `<div class="wd-colors-head"><h2 id="wd-colors-title">色号清单</h2><span class="ellipsis">${esc(work.palette)}</span></div>`;
  if (guest) {
    const widths = [64, 48, 72, 56, 40, 60];
    const rows = work.usage.slice(0, 6).map((color, index) => `<li class="wd-color"><i class="wd-bead" style="--c:${color.hex}"></i><span class="wd-bar" style="--w:28px"></span><span class="wd-bar" style="--w:${widths[index]}%"></span><span class="wd-bar" style="--w:44px"></span></li>`).join('');
    return `<section class="wd-colors is-locked" aria-labelledby="wd-colors-title">${top}
      <div class="wd-lock-wrap"><ul class="wd-color-list" aria-hidden="true">${rows}</ul>
        <div class="wd-lock"><p>${icon('lock', 's16')}登录后查看完整色号与颗数</p><button type="button" class="btn btn-sm btn-outline" data-wd-login>登录</button></div>
      </div>
    </section>`;
  }
  const rows = work.usage.map((color) => `<li class="wd-color"><i class="wd-bead" style="--c:${color.hex}" aria-hidden="true"></i><span class="wd-code t-mono">${esc(color.code)}</span><span class="wd-name ellipsis">${esc(color.name)}</span><span class="wd-qty t-num">${color.count} 颗</span></li>`).join('');
  const more = count > 5 ? `<button type="button" class="btn btn-sm btn-ghost wd-more-colors ${count === 6 ? 'wd-mobile-only' : ''}" data-wd-colors aria-expanded="false" aria-controls="wd-color-list"><span>查看全部 ${count} 色</span>${icon('chevron-down', 's16')}</button>` : '';
  return `<section class="wd-colors" aria-labelledby="wd-colors-title">${top}<ul class="wd-color-list" id="wd-color-list">${rows}</ul>${more}</section>`;
}

function makeCard(work, guest) {
  const { width, height } = work.pattern;
  const [bead, board] = work.spec.split(' · ');
  return `<aside class="wd-card" aria-label="制作信息">
    <dl class="wd-stats">
      <div class="wd-stat"><dt>尺寸</dt><dd>${width}×${height}<small>格</small></dd></div>
      <div class="wd-stat"><dt>颜色</dt><dd>${work.usage.length}<small>色</small></dd></div>
      <div class="wd-stat"><dt>总颗数</dt><dd>${work.beads}<small>颗</small></dd></div>
    </dl>
    <p class="wd-spec">${icon('layers', 's18')}<span>${esc(bead)} 豆 · 需要 <span class="t-num">${boardCount(work.pattern)}</span> 块 ${esc(board)} 底板</span></p>
    ${colorList(work, guest)}
    <div class="wd-cta">
      <button type="button" class="btn btn-primary btn-lg btn-block wd-make" data-wd-make>${guest ? '登录后制作' : '用这张制作'}</button>
      <button type="button" class="btn btn-secondary btn-block" data-wd-download>${icon('download')}下载图纸 PNG</button>
      <p class="wd-license">${icon('shield-check', 's16')}<span>仅限个人制作使用</span><button type="button" class="icon-btn sm" data-wd-license aria-haspopup="dialog" aria-expanded="false" aria-label="查看许可说明" data-tip="许可说明" data-tip-side="top">${icon('info', 's16')}</button></p>
    </div>
  </aside>`;
}

function commentList(comments) {
  if (!comments.length) return '<p class="wd-talk-empty">还没有讨论，拼好后来晒晒成品吧。</p>';
  return `<ol class="wd-comments">${comments.map((comment, index) => `<li class="wd-comment">
    <a class="wd-comment-av" href="#/u/${comment.author.id}" tabindex="-1" aria-hidden="true">${avatar(comment.author)}</a>
    <div class="wd-comment-main">
      <p class="wd-comment-head"><a href="#/u/${comment.author.id}">${esc(comment.author.name)}</a><span>${esc(comment.when)}</span></p>
      <p class="wd-comment-text">${esc(comment.text)}</p>
    </div>
    <button type="button" class="icon-btn sm" data-wd-comment="${index}" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(comment.author.name)}的评论：更多操作" data-tip="更多">${icon('ellipsis', 's18')}</button>
  </li>`).join('')}</ol>`;
}

function talk(ctx, comments) {
  const composer = ctx.session.loggedIn
    ? `<form class="wd-composer" data-wd-composer>${avatar(ctx.session.user)}
        <div class="wd-composer-main">
          <label class="sr-only" for="wd-comment">发表评论</label>
          <textarea class="textarea" id="wd-comment" rows="1" maxlength="500" placeholder="说说你的制作心得，或者向作者提问"></textarea>
          <div class="wd-composer-foot"><span class="wd-counter t-caption t-num" data-wd-counter hidden></span><button type="submit" class="btn btn-sm btn-outline" data-wd-post disabled>发布</button></div>
        </div>
      </form>`
    : `<div class="wd-composer is-guest"><span class="wd-guest-av" aria-hidden="true">${icon('user', 's18')}</span><p>登录后参与讨论</p><button type="button" class="btn btn-sm btn-outline" data-wd-login>登录</button></div>`;
  return `<section class="wd-talk" aria-labelledby="wd-talk-title">
    <h2 id="wd-talk-title">讨论<span class="wd-talk-count t-num" data-wd-count>${comments.length ? ` · ${comments.length}` : ''}</span></h2>
    ${composer}
    <div data-wd-comments>${commentList(comments)}</div>
  </section>`;
}

function rails(work) {
  const shared = (item) => item.tags.filter((tag) => work.tags.includes(tag)).length;
  const related = relatedWorks(work, 5).sort((a, b) => shared(b) - shared(a));
  // 已经出现在「相似作品」里的，不在作者栏重复。
  const shown = new Set(related.map((item) => item.id));
  const byAuthor = worksBy(work.author.id, work.id).filter((item) => !shown.has(item.id));
  const tag = work.tags[0];
  const rail = (id, title, link, list) => `<section class="wd-rail" aria-labelledby="${id}">
    <div class="section-head"><h2 id="${id}">${title}</h2><span class="grow"></span>${link}</div>
    <div class="work-grid">${list.map((item) => workCard(item)).join('')}</div>
  </section>`;
  return `<div class="wd-rails">
    ${related.length ? rail('wd-related', '相似作品', `<a class="t-link t-body-sm" href="#/?cat=${encodeURIComponent(tag)}">更多「${esc(tag)}」</a>`, related) : ''}
    ${byAuthor.length ? rail('wd-by-author', `${esc(work.author.name)}的更多作品`, `<a class="t-link t-body-sm" href="#/u/${work.author.id}">作者主页</a>`, byAuthor) : ''}
  </div>`;
}

const LICENSE = `<div class="wd-license-pop">
  <h3>使用许可</h3>
  <p>这张图纸由作者授权展示，仅供个人制作。</p>
  <ul class="wd-rights">
    <li>${icon('check', 's16')}<span>照着拼，做成自己用的作品</span></li>
    <li>${icon('check', 's16')}<span>在「我的设计」里建私人副本并修改</span></li>
    <li class="no">${icon('x', 's16')}<span>转载到站外，或当作自己的作品重新发布</span></li>
    <li class="no">${icon('x', 's16')}<span>用于商业用途，或再授权给他人</span></li>
  </ul>
</div>`;

function openMenu(anchor, items, { title, onPick }) {
  const html = `<div role="menu" aria-label="${esc(title)}">${items.map(([id, name, label, danger]) => `<button type="button" class="menu-item ${danger ? 'danger' : ''}" role="menuitem" data-pick="${id}">${icon(name)}<span>${esc(label)}</span></button>`).join('')}</div>`;
  openPopover(anchor, html, {
    align: 'end',
    sheetTitle: title,
    onMount(node, close) {
      node.addEventListener('click', (event) => {
        const item = event.target.closest('[data-pick]');
        if (!item) return;
        close();
        anchor.focus?.();
        onPick(item.dataset.pick);
      });
    },
  });
}

export default {
  shell: 'site',
  nav: 'discover',
  tabbar: false,
  footer: true,
  topbarCta: 'secondary',
  title: (ctx) => getWork(ctx.params[0]).title,
  mobileTop(ctx) {
    const work = getWork(ctx.params[0]);
    return `<a class="icon-btn" href="#/" aria-label="返回发现">${icon('arrow-left')}</a>
      <span class="grow ellipsis wd-m-title" aria-hidden="true">${esc(work.title)}</span>
      <button type="button" class="icon-btn" data-wd-share aria-haspopup="menu" aria-expanded="false" aria-label="分享">${icon('share-2')}</button>
      <button type="button" class="icon-btn" data-wd-more="mobile" aria-haspopup="menu" aria-expanded="false" aria-label="更多操作">${icon('ellipsis')}</button>`;
  },
  render(ctx) {
    const work = getWork(ctx.params[0]);
    const guest = !ctx.session.loggedIn;
    const comments = ctx.query.get('nocomments') === '1' ? [] : COMMENTS;
    return `<div class="container wd" data-wd>
      <div class="wd-layout">
        ${head(work)}
        <div class="wd-viewer">${stageMarkup(work, { guest })}</div>
        ${makeCard(work, guest)}
        ${talk(ctx, comments)}
      </div>
      ${rails(work)}
      <div class="wd-mbar">${likeButton(work, 'btn-lg')}<button type="button" class="btn btn-primary btn-lg" data-wd-make>${guest ? '登录后制作' : '用这张制作'}</button></div>
    </div>`;
  },
  mount(root, ctx) {
    const work = getWork(ctx.params[0]);
    const guest = !ctx.session.loggedIn;
    const page = $('[data-wd]', root);
    const comments = ctx.query.get('nocomments') === '1' ? [] : COMMENTS.map((comment) => ({ ...comment, mine: !guest && comment.author.id === ctx.session.user.id }));
    const view = { mode: 'bead', grid: 'auto', codes: false, seams: false, autoFlat: false };
    const dialogs = new Set();
    const dialog = (options) => {
      let close = null;
      close = openDialog({ ...options, onClose() { dialogs.delete(close); options.onClose?.(); } });
      dialogs.add(close);
      return close;
    };
    const lockedCodes = () => toast('登录后可查看色号', { iconName: 'lock', action: { label: '登录', onClick: () => ctx.loginDialog() } });
    let fullViewer = null;
    const viewer = createViewer($('[data-stage]', page), work, view, { guest, onLocked: lockedCodes, onFull: openFull });

    function openFull() {
      dialog({
        title: work.title,
        size: 'wd-full',
        label: `全屏查看「${work.title}」`,
        body: stageMarkup(work, { guest, full: true }),
        onMount(node, close) { fullViewer = createViewer($('[data-stage]', node), work, view, { guest, full: true, onLocked: lockedCodes, onExit: close }); },
        onClose() { fullViewer?.destroy(); fullViewer = null; viewer.refresh(); },
      });
    }

    function confirmMake() {
      const { width, height } = work.pattern;
      dialog({
        title: '用这张图纸制作',
        body: `<div class="wd-confirm">
          <div class="wd-confirm-work"><img src="${patternImage(work.pattern, 112)}" alt=""><div class="grow"><b class="ellipsis">${esc(work.title)}</b><span class="t-num">${width}×${height} 格 · ${work.usage.length} 色 · ${work.beads} 颗</span></div></div>
          <p>会在「我的设计」里建一份私人副本，之后两份互不影响。</p>
        </div>`,
        foot: '<button type="button" class="btn btn-secondary" data-close>取消</button><button type="button" class="btn btn-primary" data-wd-confirm autofocus>开始制作</button>',
        onMount(node, close) {
          $('[data-wd-confirm]', node).addEventListener('click', (event) => {
            event.currentTarget.classList.add('is-loading');
            setTimeout(() => { close(); toast('副本已存到「我的设计」'); ctx.navigate(`/editor/${work.id}`); }, 600);
          });
        },
      });
    }

    function reportDialog(kind) {
      dialog({
        title: kind === 'comment' ? '举报这条评论' : '举报这张图纸',
        body: `<form class="wd-report" data-wd-report novalidate>
          <fieldset class="wd-reasons"><legend class="field-label">举报原因</legend>
            ${REASONS.map(([value, label, text]) => `<label class="wd-reason"><input type="radio" name="reason" value="${value}"><span><b>${label}</b><small>${text}</small></span></label>`).join('')}
          </fieldset>
          <div class="field"><label for="wd-report-note">补充说明<span class="wd-optional">选填</span></label><textarea class="textarea" id="wd-report-note" rows="3" maxlength="300" placeholder="比如原作出处，或具体是哪里有问题"></textarea><span class="hint" data-wd-note-hint hidden>选择「其他」时，请写一句说明</span></div>
        </form>`,
        foot: '<button type="button" class="btn btn-secondary" data-close>取消</button><button type="button" class="btn btn-primary" data-wd-submit disabled>提交举报</button>',
        onMount(node, close) {
          const form = $('[data-wd-report]', node);
          const note = $('#wd-report-note', node);
          const noteHint = $('[data-wd-note-hint]', node);
          const submit = $('[data-wd-submit]', node);
          const check = () => {
            const reason = form.elements.reason.value;
            noteHint.hidden = reason !== 'other';
            submit.disabled = !reason || (reason === 'other' && !note.value.trim());
          };
          form.addEventListener('change', check);
          note.addEventListener('input', check);
          form.addEventListener('submit', (event) => event.preventDefault());
          submit.addEventListener('click', () => {
            submit.classList.add('is-loading');
            setTimeout(() => { close(); toast('已收到举报，我们会尽快处理'); }, 700);
          });
        },
      });
    }
    const report = (kind) => (guest ? ctx.loginDialog() : reportDialog(kind));

    const workUrl = () => `${location.origin}${location.pathname}#/works/${work.id}`;
    const copyLink = () => copyText(workUrl()).then((ok) => toast(ok ? '已复制链接' : '没能复制，请手动复制地址栏里的链接', { iconName: ok ? 'link' : 'circle-alert' }));
    const savePoster = () => posterSheet(work).then((canvas) => { saveCanvas(canvas, `${work.title}-分享图.png`); toast('已保存分享图', { iconName: 'image' }); });
    const picks = { copy: copyLink, poster: savePoster, report: () => report('work') };

    const list = $('[data-wd-comments]', page);
    const count = $('[data-wd-count]', page);
    const paintComments = () => {
      list.innerHTML = commentList(comments);
      count.textContent = comments.length ? ` · ${comments.length}` : '';
    };
    const confirmDelete = (index) => dialog({
      title: '删除这条评论？',
      body: '<p class="wd-dialog-text">删除后无法恢复。</p>',
      foot: '<button type="button" class="btn btn-secondary" data-close>取消</button><button type="button" class="btn btn-danger" data-wd-delete>删除</button>',
      onMount(node, close) {
        $('[data-wd-delete]', node).addEventListener('click', () => {
          comments.splice(index, 1);
          close();
          paintComments();
          $('#wd-comment', page)?.focus();
          toast('已删除评论');
        });
      },
    });

    const form = $('[data-wd-composer]', page);
    if (form) {
      const input = $('textarea', form);
      const post = $('[data-wd-post]', form);
      const counter = $('[data-wd-counter]', form);
      const update = () => {
        post.disabled = !input.value.trim();
        counter.hidden = input.value.length < 400;
        counter.textContent = `${input.value.length}/500`;
        input.style.height = 'auto';
        const height = input.scrollHeight + 2;
        input.style.height = `${Math.min(height, 240)}px`;
        input.style.overflowY = height > 240 ? 'auto' : 'hidden';
      };
      input.addEventListener('input', update);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); form.requestSubmit(); }
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        comments.unshift({ author: ctx.session.user, text, when: '刚刚', mine: true });
        input.value = '';
        update();
        paintComments();
        toast('已发布评论');
      });
    }

    const onClick = (event) => {
      const target = event.target;
      if (target.closest('[data-wd-make]')) { if (guest) ctx.loginDialog(); else confirmMake(); return; }
      if (target.closest('[data-wd-download]')) {
        if (guest) { ctx.loginDialog(); return; }
        const { width, height } = work.pattern;
        saveCanvas(patternSheet(work), `${work.title}-${width}x${height}-图纸.png`);
        toast('已开始下载', { iconName: 'download' });
        return;
      }
      if (target.closest('[data-wd-login]')) { ctx.loginDialog(); return; }
      const share = target.closest('[data-wd-share]');
      if (share) { openMenu(share, [['copy', 'link', '复制链接'], ['poster', 'image', '保存分享图']], { title: '分享', onPick: (id) => picks[id]() }); return; }
      const more = target.closest('[data-wd-more]');
      if (more) {
        const own = !guest && work.author.id === ctx.session.user.id;
        const items = more.dataset.wdMore === 'mobile' || own ? [['copy', 'link', '复制链接']] : [];
        if (!own) items.push(['report', 'flag', '举报…']);
        openMenu(more, items, { title: '更多操作', onPick: (id) => picks[id]() });
        return;
      }
      const license = target.closest('[data-wd-license]');
      if (license) { openPopover(license, LICENSE, { align: 'end', sheetTitle: '使用许可' }); return; }
      const toggle = target.closest('[data-wd-colors]');
      if (toggle) {
        const open = $('#wd-color-list', page).classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', String(open));
        $('span', toggle).textContent = open ? '收起' : `查看全部 ${work.usage.length} 色`;
        return;
      }
      const commentMore = target.closest('[data-wd-comment]');
      if (commentMore) {
        const index = Number(commentMore.dataset.wdComment);
        const mine = comments[index]?.mine;
        openMenu(commentMore, mine ? [['delete', 'trash-2', '删除评论', true]] : [['report', 'flag', '举报…']], {
          title: '评论操作',
          onPick: (id) => (id === 'delete' ? confirmDelete(index) : report('comment')),
        });
      }
    };
    root.addEventListener('click', onClick);

    // 手机：作品名滚出视野后出现在顶栏中间。
    const mobileTitle = $('.wd-m-title', root);
    const observer = new IntersectionObserver(([entry]) => {
      mobileTitle?.classList.toggle('is-visible', !entry.isIntersecting && entry.boundingClientRect.top < 64);
    }, { rootMargin: '-56px 0px 0px 0px' });
    observer.observe($('.wd-head h1', page));

    return () => {
      root.removeEventListener('click', onClick);
      observer.disconnect();
      viewer.destroy();
      fullViewer?.destroy();
      [...dialogs].forEach((close) => close());
    };
  },
};
