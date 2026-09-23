// 编辑器：100dvh 固定工作区（bare 外壳）。顶栏 ｜ 左工具栏 ｜ 居中画布 ｜ 右面板；手机为顶栏 + 全屏画布 + 底部工具栏。
// 模式：编辑 / 跟拼（顶栏唯一的分段）。查询参数：mode=stitch、tab=adjust|info、ref=1、panel=0、save=error、sheet=colors|more|adjust|info|stitch。
import { icon } from '../icons.js';
import { $, $$, esc, isMobile, toast, openDialog, openPopover, closePopover, emptyState } from '../ui.js';
import { DESIGNS, WORKS, CATEGORIES } from '../data.js';
import { patternCanvas } from '../beads.js';
import { BEADS, MOTIF_IDS, motifTitle } from '../../motifs.js';
import * as cat from './editor/catalog.js';
import { motifSource, generate, pendingPhoto } from './editor/source.js';
import * as M from './editor/model.js';
import { createViewport, readColors } from './editor/viewport.js';
import { paintReference, referencePill, referenceWindow, bindReferenceWindow, referenceThumb, MISSING_TEXT } from './editor/reference.js';
import * as P from './editor/panels.js';

const sessions = new Map();
const clampInt = (value, fallback, lo = 4, hi = 200) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && value !== null ? Math.max(lo, Math.min(hi, n)) : fallback;
};
const baseParams = (width) => ({ width, colors: 24, dither: false, sample: 'dominant', brightness: 0, contrast: 0, removeBg: true, tolerance: 12 });
const label = (key) => cat.beadLabel(key);

function resolve(id, query) {
  const copied = /-copy\d+$/.test(id);
  const design = DESIGNS.find((item) => item.id === id.replace(/-copy\d+$/, ''));
  if (design && copied) {
    return { name: `${design.name} 副本`, status: 'draft', cloud: 'synced', seed: 0, pattern: M.clonePattern(design.pattern), source: design.id === 'd-heart' ? null : motifSource(design.motif), reason: design.id === 'd-heart' ? 'local' : null, workId: null };
  }
  if (design) {
    return {
      name: design.name, status: design.status, cloud: design.cloud, seed: design.progress ?? 0,
      pattern: M.clonePattern(design.pattern),
      source: id === 'd-heart' ? null : motifSource(design.motif),
      reason: id === 'd-heart' ? 'local' : null,
      workId: design.status === 'published' ? `w-${design.motif}` : null,
    };
  }
  if (id.startsWith('w-')) {
    const work = WORKS.find((item) => item.id === id);
    if (!work) return null;
    return { name: work.title, status: 'draft', cloud: 'synced', seed: 0, pattern: M.clonePattern(work.pattern), source: null, reason: 'reuse', fromCommunity: true };
  }
  if (id === 'new-blank') {
    const width = clampInt(query.get('w'), 58, 20);
    const height = clampInt(query.get('h'), width, 20);
    return { name: '未命名设计', status: 'draft', cloud: 'synced', seed: 0, pattern: { width, height, keys: new Array(width * height).fill(null) }, source: null, reason: 'blank' };
  }
  if (id.startsWith('new-')) {
    const photo = id === 'new-photo' ? pendingPhoto() : null;
    const motif = MOTIF_IDS.includes(id.slice(4)) ? id.slice(4) : 'cat';
    let source = photo ? { kind: 'photo', ...photo } : motifSource(motif);
    const crop = query.get('crop')?.split(',').map(Number);
    if (!photo && crop?.length === 4 && crop.every(Number.isFinite)) source = { kind: 'motif', motif, crop: { x: crop[0], y: crop[1], w: crop[2], h: crop[3] } };
    const params = { ...baseParams(clampInt(query.get('w'), 58, 20)), colors: clampInt(query.get('c'), 24, 8, 48), removeBg: query.get('bg') !== '0' };
    return { name: photo ? photo.name : motifTitle(motif), status: 'draft', cloud: 'synced', seed: 0, source, reason: null, params, pattern: generate(source, { ...params, kit: query.get('kit') ?? 'all' }) };
  }
  return null;
}

function createSession(id, query) {
  const found = resolve(id, query);
  if (!found) return null;
  const palette = cat.paletteById(query.get('p') ?? 'mard-291').id;
  const params = found.params ?? baseParams(found.pattern.width);
  const used = M.usage(found.pattern.keys);
  const S = {
    id, ...found, palette, spec: cat.fitSpec(palette, query.get('s') ?? '5-29'), kit: query.get('kit') ?? 'all',
    params, applied: '', edited: false, ops: [], rev: 0,
    mode: 'edit', tool: 'brush', prevTool: 'brush', stitchTool: null, brush: 1,
    color: used[0]?.key ?? 'K', recent: used.slice(0, 5).map((c) => c.key), highlight: null,
    showGrid: true, showSeams: true, showCodes: true,
    tab: 'colors', panelOpen: true, advOpen: false, colorQuery: '', pack: 1000,
    ref: { open: false, collapsed: false, x: null, y: null, w: 288, h: 240 },
    history: [], future: [], saving: false, saveError: false, thumb: null, rowIndex: 0,
    get board() { return cat.specById(this.spec).board; },
    get currentRow() { return this.rows()[this.rowIndex] ?? null; },
  };
  if (S.recent.length < 5) S.recent.push(...['K', 'W', 'R', 'Y', 'B'].filter((k) => !S.recent.includes(k)).slice(0, 5 - S.recent.length));
  let cache = null;
  S.rows = () => {
    if (!cache || cache.rev !== S.rev || cache.board !== S.board) cache = { rev: S.rev, board: S.board, list: M.rowList(S.pattern, S.board) };
    return cache.list;
  };
  S.applied = dirtyKey(S);
  S.progress = M.seedProgress(S.pattern, S.board, found.seed);
  S.rowIndex = firstPending(S);
  return S;
}
const dirtyKey = (S) => JSON.stringify([S.params, S.kit]);
function firstPending(S, from = 0) {
  const rows = S.rows();
  for (let k = from; k < rows.length; k += 1) if (rows[k].cells.some((i) => !S.progress[i])) return k;
  return from > 0 ? firstPending(S, 0) : Math.max(0, Math.min(S.rowIndex ?? 0, rows.length - 1));
}

function sessionFor(ctx) {
  const id = ctx.params[0] ?? '';
  const query = new URLSearchParams(ctx.query);
  const view = ['mode', 'tab', 'ref', 'panel', 'save', 'sheet'];
  view.forEach((key) => query.delete(key));
  const key = id.startsWith('new-') ? `${id}?${query}` : id;
  if (!sessions.has(key)) sessions.set(key, createSession(id, query));
  return sessions.get(key);
}

// ---------- 静态片段 ----------
const TOOLS = [
  ['hand', 'hand', '手形', 'H'],
  ['brush', 'paintbrush', '画笔', 'B'],
  ['eraser', 'eraser', '橡皮', 'E'],
  ['fill', 'paint-bucket', '油漆桶', 'G'],
  ['pick', 'pipette', '吸管', 'I'],
  ['replace', 'replace', '替换颜色', 'R'],
];
const STITCH_TOOLS = [['browse', 'hand', '浏览', 'H'], ['mark', 'circle-check', '标记', 'M']];

function notFound() {
  return `<div class="ed-missing"><header class="ed-top"><div class="ed-top-l"><a class="icon-btn" href="#/me" aria-label="返回我的设计">${icon('arrow-left')}</a></div></header><main id="main" data-missing></main></div>`;
}

export default {
  shell: 'bare',
  title: (ctx) => sessionFor(ctx)?.name ?? '找不到这张设计',
  render(ctx) {
    const S = sessionFor(ctx);
    if (!S) return notFound();
    const q = ctx.query;
    if (q.get('mode') === 'stitch' || q.get('mode') === 'edit') S.mode = q.get('mode');
    if (['colors', 'adjust', 'info'].includes(q.get('tab'))) S.tab = q.get('tab');
    if (q.get('ref') === '1' && S.source) S.ref.open = true;
    if (q.get('panel') === '0') S.panelOpen = false;
    if (q.get('save') === 'error') S.saveError = true;
    return `<div class="ed" data-editor>
      <header class="ed-top" data-top></header>
      <div class="ed-body">
        <nav class="ed-tools" data-tools aria-label="工具"></nav>
        <main class="ed-stage" id="main">
          <section class="ed-ref-split" data-ref-split hidden>
            <header class="ed-ref-head"><b class="grow">原图 · 跟随画布</b><button type="button" class="icon-btn sm" data-act="ref-close" aria-label="关闭原图参照">${icon('x', 's18')}</button></header>
            <canvas data-ref-canvas-m aria-label="与画布同一范围的原图"></canvas>
          </section>
          <div class="ed-canvas-wrap" data-wrap>
            <canvas class="ed-canvas" data-canvas tabindex="0" aria-label="图纸画布：${S.pattern.width} × ${S.pattern.height} 格。方向键平移，加减号缩放"></canvas>
            <div class="ed-overlay" data-overlay></div>
            <div class="ed-zoom" data-zoom role="toolbar" aria-label="视图"></div>
          </div>
        </main>
        <aside class="ed-panel" data-panel aria-label="属性面板"></aside>
      </div>
      <div class="ed-mbottom" data-mbottom></div>
      <input type="file" accept="image/*" hidden data-source-input>
    </div>`;
  },
  mount(root, ctx) {
    const S = sessionFor(ctx);
    if (!S) {
      $('[data-missing]', root).append(emptyState({ kind: 'designs', title: '找不到这张设计', text: '它可能已被删除，或只保存在另一台设备上。', actions: '<a class="btn btn-secondary" href="#/me">返回我的设计</a>' }));
      return null;
    }
    return mountEditor(root, ctx, S);
  },
};

function mountEditor(root, ctx, S) {
  document.documentElement.classList.add('in-editor');
  if (S.mode === 'stitch') S.stitchTool ??= isMobile() ? 'browse' : 'mark';
  const ed = $('[data-editor]', root);
  const top = $('[data-top]', ed);
  const tools = $('[data-tools]', ed);
  const panel = $('[data-panel]', ed);
  const wrap = $('[data-wrap]', ed);
  const canvas = $('[data-canvas]', ed);
  const overlay = $('[data-overlay]', ed);
  const zoom = $('[data-zoom]', ed);
  const mbottom = $('[data-mbottom]', ed);
  const split = $('[data-ref-split]', ed);
  const sourceInput = $('[data-source-input]', ed);
  let sheet = null;
  let stroke = null;
  let spaceHeld = false;
  let saveTimer = 0;
  let refWin = null;
  let placeRef = null;
  let colors = readColors();
  const loggedIn = () => ctx.session.loggedIn;

  // ---------- 视口 ----------
  const vp = createViewport(wrap, canvas, {
    state: () => S,
    margins: () => (isMobile() ? { top: 52, right: 16, bottom: 64, left: 16 } : { top: 60, right: 40, bottom: 76, left: 40 }),
    gesture() {
      if (spaceHeld) return 'pan';
      if (S.mode === 'stitch') return S.stitchTool === 'browse' ? 'pan' : 'tap';
      if (S.tool === 'hand') return 'pan';
      return S.tool === 'brush' || S.tool === 'eraser' ? 'stroke' : 'tap';
    },
    footprint() {
      if (spaceHeld) return { size: 0 };
      if (S.mode === 'stitch') return { size: S.stitchTool === 'mark' ? 1 : 0 };
      if (S.tool === 'hand') return { size: 0 };
      if (S.tool === 'brush') return { size: S.brush, fill: BEADS[S.color].hex };
      if (S.tool === 'eraser') return { size: S.brush, fill: colors.bg };
      return { size: 1 };
    },
    strokeStart(cell) {
      if (S.mode !== 'edit') return;
      stroke = { snap: snapshot(), changed: 0 };
      if (cell) paint(cell);
    },
    strokeMove(from, to) {
      if (!stroke) return;
      for (const cell of from ? M.line(from, to) : [to]) paint(cell);
    },
    strokeEnd() {
      if (!stroke) return;
      const { snap, changed } = stroke;
      stroke = null;
      if (!changed) return;
      if (S.tool === 'brush') addRecent(S.color);
      commit(snap);
    },
    strokeCancel() {
      if (!stroke) return;
      S.pattern = stroke.snap.pattern;
      stroke = null;
      vp.draw();
    },
    tap: onTap,
    hover: showHover,
    viewChanged() { renderZoomPct(); paintRefs(); },
  });

  function paint(cell) {
    stroke.changed += M.stamp(S.pattern, cell.col, cell.row, S.brush, S.tool === 'eraser' ? null : S.color);
    vp.draw();
  }

  function onTap(cell) {
    const i = cell.row * S.pattern.width + cell.col;
    const key = S.pattern.keys[i];
    if (S.mode === 'stitch') {
      if (!key) return;
      const snap = snapshot();
      S.progress[i] = S.progress[i] ? 0 : 1;
      commit(snap, { progress: true });
      return;
    }
    if (S.tool === 'fill') {
      const snap = snapshot();
      if (M.floodFill(S.pattern, cell.col, cell.row, S.color)) { addRecent(S.color); commit(snap); }
      return;
    }
    if (S.tool === 'pick') {
      if (!key) { toast('这一格是空的，已保留当前颜色', { iconName: 'info' }); return; }
      setColor(key);
      setTool(S.prevTool);
      return;
    }
    if (S.tool === 'replace') {
      if (!key) { toast('空格不能替换。想给空白处上色，可以用油漆桶', { iconName: 'info' }); return; }
      if (key === S.color) { toast('这一格已经是当前色了', { iconName: 'info' }); return; }
      replaceColor(key, S.color);
    }
  }

  // ---------- 历史与保存 ----------
  function snapshot() {
    return { pattern: M.clonePattern(S.pattern), progress: S.progress.slice(), palette: S.palette, spec: S.spec, kit: S.kit, ops: [...S.ops], edited: S.edited };
  }
  function restore(snap) {
    const sizeChanged = snap.pattern.width !== S.pattern.width || snap.pattern.height !== S.pattern.height;
    Object.assign(S, { pattern: snap.pattern, progress: snap.progress, palette: snap.palette, spec: snap.spec, kit: snap.kit, ops: snap.ops, edited: snap.edited });
    S.rev += 1;
    if (sizeChanged) vp.fit();
  }
  function commit(snap, { progress = false } = {}) {
    S.history.push(snap);
    if (S.history.length > 100) S.history.shift();
    S.future = [];
    if (!progress) S.edited = true;
    S.rev += 1;
    touchSave();
    refreshData();
  }
  function undo() {
    if (!S.history.length) return;
    S.future.push(snapshot());
    restore(S.history.pop());
    S.rowIndex = Math.min(S.rowIndex, Math.max(0, S.rows().length - 1));
    touchSave();
    refreshData();
  }
  function redo() {
    if (!S.future.length) return;
    S.history.push(snapshot());
    restore(S.future.pop());
    touchSave();
    refreshData();
  }
  const saveState = () => (S.saving ? 'saving' : S.saveError ? 'error' : !loggedIn() || S.cloud === 'local' ? 'local' : 'saved');
  function saveHTML() {
    const state = saveState();
    if (state === 'saving') return `<span class="ed-save is-saving">${icon('loader-circle', 's16')}<span class="ed-save-text">保存中…</span></span>`;
    if (state === 'error') return `<button type="button" class="ed-save is-error" data-act="save-retry" data-tip="网络中断，修改保存在本机。点击重试">${icon('circle-alert', 's16')}<span class="ed-save-text">保存失败 · 重试</span></button>`;
    if (state === 'local') return `<span class="ed-save" tabindex="0" data-tip="${loggedIn() ? '这张设计还没有同步到云端' : '登录后会自动同步到云端'}">${icon('cloud-off', 's16')}<span class="ed-save-text">仅存本机</span></span>`;
    return `<span class="ed-save" tabindex="0" data-tip="所有修改已自动保存">${icon('cloud-check', 's16')}<span class="ed-save-text">已保存</span></span>`;
  }
  function renderSave() { $$('[data-save]').forEach((node) => { node.innerHTML = saveHTML(); }); }
  function touchSave() {
    S.saving = true;
    renderSave();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { S.saving = false; renderSave(); }, 900);
  }

  // ---------- 渲染 ----------
  function topHTML() {
    const stitch = S.mode === 'stitch';
    return `<div class="ed-top-l">
        <a class="icon-btn" href="#/me" aria-label="返回我的设计" data-tip="返回我的设计" data-tip-align="start">${icon('arrow-left')}</a>
        <div class="ed-title ed-d" data-title><button type="button" class="ed-name" data-act="rename" data-tip="重命名" aria-label="重命名：${esc(S.name)}"><span class="ellipsis">${esc(S.name)}</span>${icon('pencil', 's16')}</button></div>
        <span class="ed-d" data-save aria-live="polite">${saveHTML()}</span>
      </div>
      <div class="seg ed-mode" role="group" aria-label="模式">
        <button type="button" class="seg-item" data-act="mode" data-mode="edit" aria-pressed="${!stitch}">编辑</button>
        <button type="button" class="seg-item" data-act="mode" data-mode="stitch" aria-pressed="${stitch}">跟拼</button>
      </div>
      <div class="ed-top-r">
        <button type="button" class="icon-btn" data-act="undo" aria-label="撤销" data-tip="撤销 ${cat.modKey()}Z" ${S.history.length ? '' : 'disabled'}>${icon('undo-2')}</button>
        <button type="button" class="icon-btn" data-act="redo" aria-label="重做" data-tip="重做 ${cat.shiftModKey()}Z" ${S.future.length ? '' : 'disabled'}>${icon('redo-2')}</button>
        <span class="ed-vsep ed-d" aria-hidden="true"></span>
        <button type="button" class="btn btn-secondary ed-d ed-share" data-share data-act="share" aria-haspopup="menu" aria-label="分享">${icon('share-2')}<span class="ed-share-label">分享</span></button>
        <button type="button" class="btn ${stitch ? 'btn-secondary' : 'btn-primary'} ed-d ed-export" data-export data-act="export" aria-haspopup="menu">${icon('download')}导出${icon('chevron-down', 's16')}</button>
        <button type="button" class="icon-btn" data-act="more" aria-haspopup="menu" aria-label="更多" data-tip="更多" data-tip-align="end">${icon('ellipsis')}</button>
        <button type="button" class="icon-btn ed-d" data-act="panel" aria-expanded="${S.panelOpen}" aria-label="${S.panelOpen ? '收起右侧面板' : '展开右侧面板'}" data-tip="${S.panelOpen ? '收起面板' : '展开面板'}" data-tip-align="end">${icon('panel-right')}</button>
      </div>`;
  }
  function toolButton([id, iconName, text, key], pressed, act = 'tool') {
    const badge = id === 'brush' && S.brush > 1 ? `<span class="ed-tool-badge t-num">${S.brush}</span>` : '';
    const more = id === 'brush' ? '<span class="ed-tool-more" aria-hidden="true"></span>' : '';
    return `<button type="button" class="icon-btn ed-tool" data-act="${act}" data-tool="${id}" aria-pressed="${pressed}" aria-label="${text}" data-tip="${text} ${key}" data-tip-side="right">${icon(iconName)}${badge}${more}</button>`;
  }
  function toolsHTML() {
    if (S.mode === 'stitch') return STITCH_TOOLS.map((tool) => toolButton(tool, S.stitchTool === tool[0], 'stitch-tool')).join('');
    const [hand, ...draw] = TOOLS;
    const current = !S.panelOpen ? `<span class="grow"></span><button type="button" class="ed-tool-color" data-act="show-colors" aria-label="当前色 ${esc(label(S.color))}，打开颜色面板" data-tip="当前色 ${esc(label(S.color))}" data-tip-side="right">${cat.swatch(S.color, 'md')}</button>` : '';
    return `${toolButton(hand, S.tool === 'hand')}<span class="ed-tools-sep" aria-hidden="true"></span>${draw.map((tool) => toolButton(tool, S.tool === tool[0])).join('')}${current}`;
  }
  function panelBody() {
    if (S.mode === 'stitch') return P.stitchPanel(S);
    return { colors: P.colorsPanel, adjust: P.adjustPanel, info: P.infoPanel }[S.tab](S);
  }
  function panelHTML() {
    const head = S.mode === 'stitch'
      ? '<div class="ed-panel-head"><h2 class="t-title-3">跟拼</h2></div>'
      : `<div class="tabs sm ed-tabs" role="tablist" aria-label="面板">${[['colors', '颜色'], ['adjust', '调整'], ['info', '信息']].map(([id, text]) => `<button type="button" class="tab" role="tab" data-act="tab" data-panel-tab="${id}" aria-selected="${S.tab === id}">${text}</button>`).join('')}</div>`;
    return `${head}<div class="ed-panel-body" data-panel-body role="tabpanel">${panelBody()}</div>`;
  }
  function zoomHTML() {
    const pct = vp.percent();
    const codesTip = vp.view.cell >= 18 ? '色号' : '色号（放大到 90% 以上显示）';
    return `<button type="button" class="icon-btn sm" data-act="zoom-out" aria-label="缩小" data-tip="缩小 −" data-tip-side="top">${icon('zoom-out', 's18')}</button>
      <button type="button" class="ed-zoom-pct t-num" data-act="zoom-menu" aria-haspopup="menu" aria-label="缩放比例 ${pct}%" data-zoom-pct>${pct}%</button>
      <button type="button" class="icon-btn sm" data-act="zoom-in" aria-label="放大" data-tip="放大 +" data-tip-side="top">${icon('zoom-in', 's18')}</button>
      <button type="button" class="icon-btn sm" data-act="fit" aria-label="适配窗口" data-tip="适配窗口 0" data-tip-side="top">${icon('scan', 's18')}</button>
      <span class="ed-vsep ed-d" aria-hidden="true"></span>
      <button type="button" class="icon-btn sm ed-d" data-act="toggle" data-toggle="showGrid" aria-pressed="${S.showGrid}" aria-label="网格" data-tip="网格" data-tip-side="top">${icon('grid-3x3', 's18')}</button>
      <button type="button" class="icon-btn sm ed-d" data-act="toggle" data-toggle="showSeams" aria-pressed="${S.showSeams}" aria-label="板缝" data-tip="板缝" data-tip-side="top">${icon('grid-2x2', 's18')}</button>
      <button type="button" class="icon-btn sm ed-d" data-act="toggle" data-toggle="showCodes" aria-pressed="${S.showCodes}" aria-label="色号" data-tip="${codesTip}" data-tip-side="top" data-tip-align="end">${icon('hash', 's18')}</button>`;
  }
  function overlayHTML() {
    const used = M.usage(S.pattern.keys).length;
    if (S.source && !S.thumb) S.thumb = referenceThumb(S);
    const row = S.currentRow;
    const all = M.progressStats(S.pattern, S.progress);
    const stitch = S.mode === 'stitch';
    const pill = S.ref.open && S.source ? '' : referencePill(S, S.thumb);
    return `<span class="ed-meta t-num" data-meta>${S.pattern.width}×${S.pattern.height} · ${used} 色</span>
      <span class="ed-hover t-num" data-hover hidden></span>
      <div class="ed-ref-slot ${stitch ? 'is-stitch' : ''}">${pill}</div>
      ${S.highlight && !stitch ? `<button type="button" class="chip is-selected ed-hl-chip" data-act="highlight" data-key="${S.highlight}" aria-label="取消高亮 ${esc(label(S.highlight))}">${cat.swatch(S.highlight, 'sm')}高亮 ${esc(label(S.highlight))}<span class="remove">${icon('x', 's16')}</span></button>` : ''}
      ${stitch ? `<button type="button" class="ed-mprog" data-act="m-sheet" data-sheet="stitch" aria-haspopup="dialog"><b class="t-num">${all.percent}%</b><span class="ellipsis">${row ? `第 ${row.board + 1} 块板 · 第 ${row.local + 1} 行` : '没有可拼的格子'}</span>${icon('chevron-down', 's16')}</button>
        <div class="seg ed-mseg" role="group" aria-label="跟拼手势">${STITCH_TOOLS.map(([id, , text]) => `<button type="button" class="seg-item" data-act="stitch-tool" data-tool="${id}" aria-pressed="${S.stitchTool === id}">${text}</button>`).join('')}</div>` : ''}`;
  }
  function mobileHTML() {
    if (S.mode === 'stitch') {
      const row = S.currentRow;
      const stats = row ? M.progressStats(S.pattern, S.progress, row.cells) : null;
      const done = stats && stats.done === stats.total;
      return `<div class="ed-mstrip">${row ? `<span class="ed-mstrip-label t-caption t-num">${row.local + 1} 行</span><div class="ed-runs is-strip">${P.runsHTML(S, row)}</div>` : '<span class="t-caption t-muted">没有可拼的格子</span>'}</div>
        <div class="ed-mbar is-stitch">
          <button type="button" class="btn btn-secondary" data-act="row-prev" ${S.rowIndex > 0 ? '' : 'disabled'}>上一行</button>
          <button type="button" class="btn ${done ? 'btn-secondary' : 'btn-primary'}" data-act="row-done" ${row ? '' : 'disabled'}>${icon(done ? 'undo-2' : 'check')}${done ? '取消完成' : '完成本行'}</button>
          <button type="button" class="btn btn-secondary" data-act="row-next" ${row && S.rowIndex < S.rows().length - 1 ? '' : 'disabled'}>下一行</button>
        </div>`;
    }
    return `<div class="ed-mstrip"><span class="ed-mstrip-label t-caption">最近</span>
        ${S.recent.slice(0, 5).map((key) => `<button type="button" class="ed-recent-sw" data-act="pick-color" data-key="${key}" aria-pressed="${key === S.color}" aria-label="${esc(label(key))}">${cat.swatch(key, 'lg')}</button>`).join('')}
        <button type="button" class="chip ed-recent-all" data-act="m-sheet" data-sheet="colors">全部${icon('chevron-right', 's16')}</button>
      </div>
      <div class="ed-mbar">
        ${TOOLS.slice(0, 5).map(([id, iconName, text]) => `<button type="button" class="icon-btn lg ed-tool" data-act="tool" data-tool="${id}" aria-pressed="${S.tool === id}" aria-label="${text}">${icon(iconName, 's24')}${id === 'brush' && S.brush > 1 ? `<span class="ed-tool-badge t-num">${S.brush}</span>` : ''}</button>`).join('')}
        <button type="button" class="ed-mcolor" data-act="m-sheet" data-sheet="colors" aria-label="当前色 ${esc(label(S.color))}，打开颜色">${cat.swatch(S.color, 'lg')}</button>
      </div>`;
  }

  function focusKey(node) {
    if (!node || node === document.body) return null;
    const attrs = ['data-act', 'data-key', 'data-tool', 'data-kind', 'data-panel-tab', 'data-mode', 'data-param', 'data-color-search', 'data-width', 'data-board', 'data-value', 'data-toggle', 'data-sheet'];
    const parts = attrs.filter((a) => node.hasAttribute?.(a)).map((a) => `[${a}="${CSS.escape(node.getAttribute(a))}"]`);
    return parts.length ? parts.join('') : null;
  }
  function withFocus(container, fn) {
    const active = document.activeElement;
    const sel = container.contains(active) ? focusKey(active) : null;
    fn();
    if (sel) { const next = container.querySelector(sel); if (next) { next.focus({ preventScroll: true }); if (next.matches('input[type=search]')) next.setSelectionRange(next.value.length, next.value.length); } }
  }

  function renderTop() { withFocus(top, () => { top.innerHTML = topHTML(); }); }
  function renderTools() {
    withFocus(tools, () => { tools.innerHTML = toolsHTML(); });
    const tool = spaceHeld ? 'pan' : S.mode === 'stitch' ? (S.stitchTool === 'browse' ? 'pan' : 'mark') : S.tool === 'hand' ? 'pan' : S.tool;
    canvas.dataset.cursor = tool;
  }
  function renderPanel() {
    ed.classList.toggle('is-panel-closed', !S.panelOpen);
    const body = $('[data-panel-body]', panel);
    const scroll = body && panel.dataset.view === `${S.mode}:${S.tab}` ? body.scrollTop : 0;
    withFocus(panel, () => { panel.innerHTML = panelHTML(); });
    panel.dataset.view = `${S.mode}:${S.tab}`;
    $('[data-panel-body]', panel).scrollTop = scroll;
  }
  function renderOverlay() { withFocus(overlay, () => { overlay.innerHTML = overlayHTML(); }); }
  function renderZoom() { withFocus(zoom, () => { zoom.innerHTML = zoomHTML(); }); }
  function renderZoomPct() {
    const node = $('[data-zoom-pct]', zoom);
    if (node) { node.textContent = `${vp.percent()}%`; node.setAttribute('aria-label', `缩放比例 ${vp.percent()}%`); }
  }
  function renderMobile() { withFocus(mbottom, () => { mbottom.innerHTML = mobileHTML(); }); }
  function renderSheet() {
    if (!sheet?.build) return;
    const body = $('.dialog-body', sheet.dialog);
    const scroll = body.scrollTop;
    withFocus(body, () => { body.innerHTML = sheet.build(); });
    body.scrollTop = scroll;
  }
  function refreshData() {
    renderTop(); renderPanel(); renderOverlay(); renderMobile(); renderSheet();
    vp.draw();
    paintRefs();
  }
  function refresh() {
    ed.dataset.mode = S.mode;
    renderTop(); renderTools(); renderPanel(); renderOverlay(); renderZoom(); renderMobile(); renderSheet(); renderRef();
    vp.draw();
  }

  // ---------- 原图参照 ----------
  function renderRef() {
    const open = S.ref.open && S.source;
    split.hidden = !(open && isMobile());
    ed.classList.toggle('has-ref-split', !split.hidden);
    if (open && !isMobile()) {
      if (!refWin) {
        wrap.insertAdjacentHTML('beforeend', referenceWindow(S));
        refWin = wrap.lastElementChild;
        placeRef = bindReferenceWindow(refWin, wrap, S, paintRefs);
      }
    } else if (refWin) { refWin.remove(); refWin = null; placeRef = null; }
    requestAnimationFrame(paintRefs);
  }
  function paintRefs() {
    if (!S.source || !S.ref.open) return;
    if (refWin && !S.ref.collapsed) paintReference($('[data-ref-canvas]', refWin), S, vp.view, colors);
    if (!split.hidden) paintReference($('[data-ref-canvas-m]', split), S, vp.view, colors);
  }
  function toggleRef(open = !S.ref.open) {
    if (!S.source) { missingSource(); return; }
    S.ref.open = open;
    if (refWin) { refWin.remove(); refWin = null; }
    renderOverlay();
    renderRef();
  }
  function missingSource(anchor = $('[data-act="ref-missing"]', overlay)) {
    const html = `<div class="ed-missing-pop"><h3 class="t-title-3">${S.reason === 'blank' ? '还没有原图' : '没有可靠的原图对应关系'}</h3><p>${MISSING_TEXT[S.reason] ?? MISSING_TEXT.local}${S.reason === 'blank' ? '' : '选择原图后，参照窗会跟随画布显示同一范围。'}</p><button type="button" class="btn btn-secondary btn-sm" data-act="choose-source">${icon('image')}选择原图</button></div>`;
    if (!anchor || isMobile()) { openSheetWith(S.reason === 'blank' ? '添加原图' : '原图未对齐', () => html); return; }
    openPopover(anchor, html, { align: 'end', onMount: (node) => node.addEventListener('click', onAct) });
  }
  sourceInput.addEventListener('change', () => {
    const file = sourceInput.files[0];
    sourceInput.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('这不是图片。请选择 JPEG、PNG、WebP 或 HEIC 图片', { iconName: 'circle-alert' }); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      S.source = { kind: 'photo', img, url, natW: img.naturalWidth, natH: img.naturalHeight, crop: { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight }, name: file.name.replace(/\.[^.]+$/, '') };
      S.reason = null;
      S.ops = [];
      S.thumb = null;
      S.params.width = S.pattern.width;
      S.applied = '';
      if (S.mode === 'edit') { S.tab = 'adjust'; S.panelOpen = true; }
      sheet?.close();
      refresh();
      toast('已载入原图。在「调整」里点重新生成即可按原图计算', { iconName: 'image' });
    };
    img.onerror = () => toast('这张图片无法读取，文件可能已损坏。换一张试试', { iconName: 'circle-alert' });
    img.src = url;
  });

  // ---------- 工具与颜色 ----------
  function setTool(tool) {
    if (['brush', 'fill', 'replace'].includes(tool)) S.prevTool = tool;
    S.tool = tool;
    renderTools(); renderMobile(); vp.draw();
  }
  function setColor(key) {
    S.color = key;
    renderTools(); renderPanel(); renderMobile(); renderSheet(); vp.draw();
  }
  function addRecent(key) { S.recent = [key, ...S.recent.filter((k) => k !== key)].slice(0, 5); }
  function replaceColor(from, to) {
    const snap = snapshot();
    const n = M.replaceAll(S.pattern, from, to);
    if (S.highlight === from) S.highlight = null;
    addRecent(to);
    commit(snap);
    toast(`已把 ${label(from)} 替换为 ${label(to)} · ${cat.fmt(n)} 颗`, { iconName: 'replace', action: { label: '撤销', onClick: undo } });
  }
  function brushMenu(anchor) {
    const html = `<div class="menu-label">笔刷大小</div>${[1, 2, 3].map((n) => `<button type="button" class="menu-item" data-act="brush-size" data-value="${n}" role="menuitemradio" aria-checked="${S.brush === n}"><span class="ed-brush-demo" style="--n:${n}" aria-hidden="true">${'<i></i>'.repeat(n * n)}</span>${n}×${n}${S.brush === n ? `<span class="check">${icon('check', 's18')}</span>` : ''}</button>`).join('')}`;
    const node = openPopover(anchor, html, { onMount: (pop) => pop.addEventListener('click', onAct) });
    if (node && !isMobile()) {
      const rect = anchor.getBoundingClientRect();
      node.style.left = `${rect.right + 8}px`;
      node.style.top = `${Math.min(rect.top, window.innerHeight - node.offsetHeight - 12)}px`;
      node.style.setProperty('--origin', 'top left');
    }
  }
  function replaceMenu(anchor, from) {
    const build = () => `<div class="ed-replace"><p class="t-body-sm">把 ${cat.swatch(from, 'sm')}<b>${esc(label(from))}</b> 全部替换为</p>
      ${from !== S.color ? `<button type="button" class="menu-item" data-act="do-replace" data-key="${from}" data-value="${S.color}">${cat.swatch(S.color, 'sm')}当前色 · ${esc(label(S.color))}</button><div class="menu-sep"></div>` : ''}
      <div class="menu-label">或选择其他颜色</div>
      <div class="ed-swatches is-compact">${cat.BEAD_KEYS.filter((k) => k !== from).map((k) => `<button type="button" class="ed-sw" style="--c:${BEADS[k].hex}" data-act="do-replace" data-key="${from}" data-value="${k}" aria-label="${esc(label(k))}" data-tip="${esc(label(k))}"></button>`).join('')}</div></div>`;
    if (isMobile()) { openSheetWith(`替换 ${label(from)}`, build); return; }
    openPopover(anchor, build(), { align: 'end', onMount: (node) => node.addEventListener('click', onAct) });
  }

  // ---------- 调整 ----------
  function applyTransform(kind) {
    const snap = snapshot();
    const { width, height } = S.pattern;
    S.pattern = M.transformPattern(S.pattern, kind);
    S.progress = M.transformCells(S.progress, width, height, kind);
    S.ops.push(kind);
    commit(snap);
    vp.fit();
    toast({ rotate: '已顺时针旋转 90°', 'mirror-h': '已水平镜像', 'mirror-v': '已垂直镜像' }[kind], { iconName: kind === 'rotate' ? 'rotate-cw' : kind === 'mirror-v' ? 'flip-vertical-2' : 'flip-horizontal-2', action: { label: '撤销', onClick: undo } });
  }
  function regenerate(button) {
    const run = () => {
      button?.classList.add('is-loading');
      setTimeout(() => {
        const snap = snapshot();
        let next = generate(S.source, { ...S.params, kit: S.kit });
        for (const op of S.ops) next = M.transformPattern(next, op);
        S.pattern = next;
        S.progress = new Uint8Array(next.width * next.height);
        S.applied = dirtyKey(S);
        if (!M.usage(next.keys).some((c) => c.key === S.color)) S.color = M.usage(next.keys)[0]?.key ?? S.color;
        commit(snap);
        S.edited = false;
        S.rowIndex = 0;
        vp.fit();
        toast('已重新生成', { iconName: 'refresh-cw', action: { label: '撤销', onClick: undo } });
      }, 800);
    };
    const hasProgress = S.progress.some(Boolean);
    if (!S.edited && !hasProgress) { run(); return; }
    confirmDialog({
      title: '重新生成图纸？',
      text: `会按新参数从原图重新计算，${S.edited ? '覆盖你的手工修改' : '替换当前图纸'}${hasProgress ? '，跟拼进度也会清空' : ''}。之后可以撤销。`,
      ok: '重新生成',
      onOk: run,
    });
  }
  function choosePalette(id) {
    if (id === S.palette) return;
    const palette = cat.paletteById(id);
    const spec = cat.fitSpec(id, S.spec);
    confirmDialog({
      title: `换成「${palette.name}」？`,
      text: '逐格换成新色板中最接近的颜色，保留手工修补，可撤销。',
      note: spec !== S.spec ? `${palette.name} 只支持 ${cat.paletteSizes(palette)}，制作规格会改为 ${cat.specById(spec).label}。` : '',
      ok: '换色板',
      onOk() {
        const snap = snapshot();
        S.palette = id;
        S.spec = spec;
        if (!cat.kitOptions(palette).map(String).includes(String(S.kit))) S.kit = 'all';
        commit(snap);
        toast(`已换成 ${palette.name} 色板`, { iconName: 'palette', action: { label: '撤销', onClick: undo } });
      },
    });
  }
  function chooseSpec(id) {
    if (id === S.spec) return;
    const snap = snapshot();
    S.spec = id;
    commit(snap, { progress: true });
    S.rowIndex = firstPending(S);
    toast(`制作规格已改为 ${cat.specById(id).label}，板缝和底板数已更新`, { iconName: 'grid-2x2', action: { label: '撤销', onClick: undo } });
  }
  function updateDirty(container = document) {
    $$('[data-dirty]', container).forEach((node) => { node.hidden = dirtyKey(S) === S.applied; });
  }

  // ---------- 跟拼 ----------
  function revealRow() {
    const row = S.currentRow;
    if (row) vp.reveal(M.boardRect(S.pattern, S.board, row.board));
  }
  function setRow(index) {
    S.rowIndex = Math.max(0, Math.min(index, S.rows().length - 1));
    refreshData();
    revealRow();
  }
  function rowDone() {
    const row = S.currentRow;
    if (!row) return;
    const stats = M.progressStats(S.pattern, S.progress, row.cells);
    const value = stats.done === stats.total ? 0 : 1;
    const snap = snapshot();
    row.cells.forEach((i) => { S.progress[i] = value; });
    commit(snap, { progress: true });
    const all = M.progressStats(S.pattern, S.progress);
    if (value && all.done === all.total) { toast('这张图纸已经拼完了，辛苦啦', { iconName: 'badge-check' }); return; }
    if (value) setRow(firstPending(S, S.rowIndex + 1));
  }
  function jumpBoard(index) {
    const rows = S.rows();
    const inBoard = rows.map((row, k) => [row, k]).filter(([row]) => row.board === index);
    if (!inBoard.length) return;
    const pending = inBoard.find(([row]) => row.cells.some((i) => !S.progress[i]));
    sheet?.close();
    setRow((pending ?? inBoard[0])[1]);
  }

  function setMode(mode) {
    if (mode === S.mode) return;
    S.mode = mode;
    if (mode === 'stitch') {
      S.stitchTool ??= isMobile() ? 'browse' : 'mark';
      S.highlight = null;
      S.rowIndex = Math.min(S.rowIndex, Math.max(0, S.rows().length - 1));
    }
    closePopover();
    refresh();
  }

  // ---------- 弹窗 / 面板 ----------
  function confirmDialog({ title, text, note = '', ok, danger = false, onOk }) {
    openDialog({
      title,
      body: `<p class="t-body">${esc(text)}</p>${note ? `<p class="ed-dialog-note">${icon('info', 's16')}${esc(note)}</p>` : ''}`,
      foot: `<button type="button" class="btn btn-secondary" data-close>取消</button><button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(ok)}</button>`,
      onMount(dialog, close) { $('[data-ok]', dialog).addEventListener('click', () => { close(); onOk(); }); },
    });
  }
  function openSheetWith(title, build, kind = 'custom') {
    sheet?.close();
    openDialog({
      title,
      body: build(),
      onMount(dialog, close) {
        dialog.classList.add('ed-sheet');
        bindInputs(dialog);
        dialog.addEventListener('click', onAct);
        sheet = { kind, dialog, close, build };
      },
      onClose() { sheet = null; },
    });
  }
  function openSheet(kind) {
    const builds = {
      colors: ['颜色', () => P.colorsPanel(S, { touch: true })],
      adjust: ['调整', () => P.adjustPanel(S)],
      info: ['信息与采购清单', () => P.infoPanel(S)],
      stitch: ['跟拼进度', () => P.stitchPanel(S, { sheet: true })],
      export: ['导出', exportMenu],
      share: ['分享', shareMenu],
      more: [S.name, moreSheet],
    };
    const [title, build] = builds[kind];
    openSheetWith(title, build, kind);
  }
  function exportMenu() {
    return `<button type="button" class="menu-item" data-act="export-png">${icon('image')}下载 PNG…</button>
      <button type="button" class="menu-item" data-act="export-pdf">${icon('printer')}打印 PDF…</button>
      <button type="button" class="menu-item" data-act="export-project">${icon('file-down')}导出项目文件<span class="trail">.json</span></button>
      ${isMobile() ? '' : `<div class="menu-sep"></div><button type="button" class="menu-item" data-act="shopping">${icon('shopping-cart')}采购清单</button>`}`;
  }
  function shareMenu() {
    const publish = S.fromCommunity
      ? `<button type="button" class="menu-item" disabled>${icon('send')}<span class="grow"><span class="ed-menu-title">公开到豆社…</span><span class="ed-menu-note">从豆社引用的图纸不能再次公开</span></span></button>`
      : S.workId
        ? `<a class="menu-item" href="#/works/${S.workId}">${icon('badge-check')}<span class="grow"><span class="ed-menu-title">已公开到豆社</span><span class="ed-menu-note">查看公开作品页</span></span>${icon('arrow-up-right', 's16')}</a>`
        : `<button type="button" class="menu-item" data-act="publish">${icon('send')}<span class="grow"><span class="ed-menu-title">公开到豆社…</span><span class="ed-menu-note">提交审核后出现在发现页</span></span></button>`;
    return `<button type="button" class="menu-item" data-act="copy-link">${icon('link')}<span class="grow"><span class="ed-menu-title">复制只读链接</span><span class="ed-menu-note">对方只能查看此刻的图纸快照</span></span></button><div class="menu-sep"></div>${publish}`;
  }
  function moreMenu() {
    return `<button type="button" class="menu-item" data-act="duplicate">${icon('copy')}复制为新设计</button>
      <button type="button" class="menu-item" data-act="shortcuts">${icon('keyboard')}快捷键说明<span class="trail">?</span></button>
      <div class="menu-sep"></div>
      ${S.mode === 'stitch' ? `<button type="button" class="menu-item danger" data-act="clear-progress" ${S.progress.some(Boolean) ? '' : 'disabled'}>${icon('refresh-cw')}清空跟拼进度</button>` : ''}
      <button type="button" class="menu-item danger" data-act="delete">${icon('trash-2')}删除设计</button>`;
  }
  function moreSheet() {
    const refLabel = S.source ? (S.ref.open ? '关闭原图参照' : '原图参照') : S.reason === 'blank' ? '添加原图' : '原图未对齐 · 重新选择';
    return `<div class="ed-msheet-status"><span data-save>${saveHTML()}</span><button type="button" class="btn btn-ghost btn-sm" data-act="rename">${icon('pencil', 's16')}重命名</button></div>
      <button type="button" class="menu-item" data-act="m-sheet" data-sheet="adjust">${icon('sliders-horizontal')}调整</button>
      <button type="button" class="menu-item" data-act="m-sheet" data-sheet="info">${icon('info')}信息与采购清单</button>
      <button type="button" class="menu-item" data-act="m-sheet" data-sheet="export">${icon('download')}导出</button>
      <button type="button" class="menu-item" data-act="copy-link">${icon('share-2')}分享只读链接</button>
      <button type="button" class="menu-item" data-act="publish" ${S.fromCommunity || S.workId ? 'disabled' : ''}>${icon('send')}<span class="grow">公开到豆社${S.fromCommunity ? '<span class="ed-menu-note">从豆社引用的图纸不能再次公开</span>' : S.workId ? '<span class="ed-menu-note">已公开</span>' : ''}</span></button>
      <button type="button" class="menu-item ${S.source ? '' : 'is-warn'}" data-act="m-ref">${icon(S.source ? 'image' : 'triangle-alert')}${refLabel}</button>
      <div class="menu-sep"></div>
      <div class="menu-label">显示</div>
      <div class="ed-msheet-chips">${[['showGrid', '网格'], ['showSeams', '板缝'], ['showCodes', '色号']].map(([k, t]) => `<button type="button" class="chip" data-act="toggle" data-toggle="${k}" aria-pressed="${S[k]}">${S[k] ? icon('check', 's16') : ''}${t}</button>`).join('')}</div>
      <div class="menu-sep"></div>
      <button type="button" class="menu-item" data-act="duplicate">${icon('copy')}复制为新设计</button>
      ${S.mode === 'stitch' ? `<button type="button" class="menu-item danger" data-act="clear-progress" ${S.progress.some(Boolean) ? '' : 'disabled'}>${icon('refresh-cw')}清空跟拼进度</button>` : ''}
      <button type="button" class="menu-item danger" data-act="delete">${icon('trash-2')}删除设计</button>`;
  }

  function pngDialog() {
    const opts = { cell: 20, codes: true, legend: true, split: false };
    const { cols, rows, total } = cat.boardsOf(S.pattern.width, S.pattern.height, S.board);
    const summary = () => `${S.pattern.width * opts.cell} × ${S.pattern.height * opts.cell} 像素${opts.split ? ` · ${total} 张（每块板一张，打包为 ZIP）` : ''}${opts.legend ? ' · 附图例与色号清单' : ''}`;
    openDialog({
      title: '下载 PNG',
      body: `<div class="ed-form">
        <div class="ed-field"><span class="field-label">每格像素</span><div class="seg ed-seg-block" role="group" aria-label="每格像素">${[10, 20, 30, 40].map((n) => `<button type="button" class="seg-item" data-cell="${n}" aria-pressed="${n === opts.cell}">${n} px</button>`).join('')}</div></div>
        <label class="ed-switch"><span class="grow"><span class="field-label">包含色号</span><span class="hint" data-codes-hint>每格小于 20 像素时色号可能看不清</span></span><input type="checkbox" class="switch" data-opt="codes" checked></label>
        <label class="ed-switch"><span class="grow"><span class="field-label">包含图例</span><span class="hint">在图纸下方列出每个色号和颗数</span></span><input type="checkbox" class="switch" data-opt="legend" checked></label>
        <label class="ed-switch"><span class="grow"><span class="field-label">按底板分页</span><span class="hint">共 ${total} 块板（${cols} × ${rows}），每块一张图</span></span><input type="checkbox" class="switch" data-opt="split"></label>
        <p class="ed-dialog-note t-num" data-summary>${icon('image', 's16')}${summary()}</p>
      </div>`,
      foot: '<button type="button" class="btn btn-secondary" data-close>取消</button><button type="button" class="btn btn-primary" data-ok>下载</button>',
      onMount(dialog, close) {
        const sync = () => {
          $$('[data-cell]', dialog).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.cell) === opts.cell)));
          $('[data-codes-hint]', dialog).hidden = !(opts.codes && opts.cell < 20);
          $('[data-summary]', dialog).innerHTML = `${icon('image', 's16')}${summary()}`;
        };
        dialog.addEventListener('click', (e) => { const b = e.target.closest('[data-cell]'); if (b) { opts.cell = Number(b.dataset.cell); sync(); } });
        dialog.addEventListener('change', (e) => { const o = e.target.dataset.opt; if (o) { opts[o] = e.target.checked; sync(); } });
        sync();
        $('[data-ok]', dialog).addEventListener('click', (e) => { e.currentTarget.classList.add('is-loading'); setTimeout(() => { close(); toast('已下载 PNG', { iconName: 'download' }); }, 600); });
      },
    });
  }
  function pdfDialog() {
    const { cols, rows, total } = cat.boardsOf(S.pattern.width, S.pattern.height, S.board);
    const legend = Math.max(1, Math.ceil(M.usage(S.pattern.keys).length / 24));
    const spec = cat.specById(S.spec);
    openDialog({
      title: '打印 PDF',
      body: `<div class="ed-form">
        <dl class="ed-facts">
          <div><dt>页数</dt><dd class="t-num">共 ${total + legend + 1} 页</dd></div>
          <div><dt>内容</dt><dd class="t-num">板位总览 1 页 · 图纸 ${total} 页（${cols} × ${rows} 块板，一页一块）· 图例清单 ${legend} 页</dd></div>
          <div><dt>纸张</dt><dd>A4 · 每格 ${spec.mm}</dd></div>
        </dl>
        <p class="ed-dialog-note">${icon('printer', 's16')}打印时选择「实际大小 / 100%」，不要选「适合页面」；先试打一页，用尺子核对格子尺寸。</p>
      </div>`,
      foot: '<button type="button" class="btn btn-secondary" data-close>取消</button><button type="button" class="btn btn-primary" data-ok>下载 PDF</button>',
      onMount(dialog, close) {
        $('[data-ok]', dialog).addEventListener('click', (e) => { e.currentTarget.classList.add('is-loading'); setTimeout(() => { close(); toast('已下载 PDF', { iconName: 'printer' }); }, 700); });
      },
    });
  }
  function publishDialog() {
    if (!loggedIn()) { ctx.loginDialog(); return; }
    if (S.fromCommunity) { toast('从豆社引用的图纸不能再次公开。用自己的图片生成后再投稿吧', { iconName: 'info' }); return; }
    if (S.workId) { ctx.navigate(`/works/${S.workId}`); return; }
    const tags = [];
    const thumb = patternCanvas(S.pattern, 96, { mode: 'bead', pad: 0.06 }).toDataURL();
    const suggestions = CATEGORIES.slice(2, 8).map((c) => c.label);
    const consent = S.source
      ? `<div class="ed-callout">${icon('lock', 's18')}<p>公开作品会附带原图，用于审核和他人引用时对照。原图存放在私有空间，永不公开展示；撤回作品时一并删除。</p></div>
        <div class="ed-consent"><label class="checkbox"><input type="checkbox" data-consent>同意上传原图用于审核与引用</label>
        <label class="checkbox"><input type="checkbox" data-consent>我拥有这张作品的合法发布权</label></div>`
      : `<div class="ed-callout is-warning">${icon('triangle-alert', 's18')}<div><p>公开作品需要附带原图。这张设计没有可用的原图，先选择原图再提交。</p><button type="button" class="btn btn-secondary btn-sm" data-pub-source>${icon('image')}选择原图</button></div></div>`;
    openDialog({
      title: '公开到豆社',
      size: 'md',
      body: `<div class="ed-form">
        <div class="ed-pub-top"><img class="ed-pub-thumb" src="${thumb}" alt="图纸预览">
          <div class="field grow" data-field="title"><label for="pub-title">公开标题</label><input class="input" id="pub-title" maxlength="30" value="${esc(S.name)}"><span class="error" hidden>${icon('circle-alert', 's16')}<span>请填写标题，最多 30 个字</span></span></div></div>
        <div class="field"><label for="pub-tag">标签</label><div class="ed-tag-box" data-tag-box><span data-tags></span><input id="pub-tag" placeholder="添加标签" maxlength="8" autocomplete="off"></div>
          <span class="hint">按回车添加，最多 5 个</span>
          <div class="ed-tag-suggest">${suggestions.map((t) => `<button type="button" class="chip outline" data-suggest="${esc(t)}">${icon('plus', 's16')}${esc(t)}</button>`).join('')}</div></div>
        ${consent}
      </div>`,
      foot: '<button type="button" class="btn btn-secondary" data-close>取消</button><button type="button" class="btn btn-primary" data-ok disabled>提交审核</button>',
      onMount(dialog, close) {
        const input = $('#pub-tag', dialog);
        const ok = $('[data-ok]', dialog);
        const sync = () => {
          $('[data-tags]', dialog).innerHTML = tags.map((t) => `<span class="chip is-selected">${esc(t)}<button type="button" class="remove" data-remove="${esc(t)}" aria-label="移除标签 ${esc(t)}">${icon('x', 's16')}</button></span>`).join('');
          $$('[data-suggest]', dialog).forEach((b) => { b.hidden = tags.includes(b.dataset.suggest); });
          const boxes = $$('[data-consent]', dialog);
          ok.disabled = !S.source || !boxes.every((b) => b.checked);
        };
        const add = (t) => { t = t.trim(); if (t && !tags.includes(t) && tags.length < 5) tags.push(t); input.value = ''; sync(); };
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(input.value); } if (e.key === 'Backspace' && !input.value && tags.length) { tags.pop(); sync(); } });
        dialog.addEventListener('click', (e) => {
          const s = e.target.closest('[data-suggest]'); if (s) add(s.dataset.suggest);
          const r = e.target.closest('[data-remove]'); if (r) { tags.splice(tags.indexOf(r.dataset.remove), 1); sync(); }
          if (e.target.closest('[data-pub-source]')) { close(); sourceInput.click(); }
        });
        dialog.addEventListener('change', sync);
        ok.addEventListener('click', () => {
          const title = $('#pub-title', dialog);
          const field = $('[data-field="title"]', dialog);
          const valid = title.value.trim().length > 0;
          field.classList.toggle('is-invalid', !valid);
          $('.error', field).hidden = valid;
          if (!valid) { title.focus(); return; }
          ok.classList.add('is-loading');
          setTimeout(() => { close(); toast('已提交审核，结果会在通知里告诉你', { iconName: 'send' }); }, 700);
        });
        sync();
      },
    });
  }
  function shortcutsDialog() {
    const k = (s) => s.split(' ').map((x) => `<span class="kbd">${esc(x)}</span>`).join('');
    const rows = [['手形（按住空格临时平移）', 'H'], ['画笔', 'B'], ['橡皮', 'E'], ['油漆桶', 'G'], ['吸管', 'I'], ['替换颜色', 'R'], ['撤销', `${cat.modKey()}Z`], ['重做', `${cat.shiftModKey()}Z`], ['放大 / 缩小', '+ −'], ['适配窗口', '0'], ['跟拼：浏览 / 标记', 'H M'], ['快捷键说明', '?']];
    openDialog({ title: '快捷键', body: `<dl class="ed-keys">${rows.map(([t, s]) => `<div><dt>${t}</dt><dd>${k(s)}</dd></div>`).join('')}</dl><p class="hint">滚轮以指针为中心缩放；平移和缩放不会修改图纸。</p>` });
  }
  function zoomMenu(anchor) {
    const pct = vp.percent();
    const html = `<button type="button" class="menu-item" data-act="fit">${icon('scan')}适配窗口<span class="trail">0</span></button><div class="menu-sep"></div>${[50, 100, 200, 400].map((n) => `<button type="button" class="menu-item" data-act="zoom-to" data-value="${n}">${n}%${pct === n ? `<span class="check">${icon('check', 's18')}</span>` : ''}</button>`).join('')}`;
    const node = openPopover(anchor, html, { align: 'center', onMount: (pop) => pop.addEventListener('click', onAct) });
    if (node) {
      const rect = anchor.getBoundingClientRect();
      node.style.top = `${rect.top - node.offsetHeight - 8}px`;
    }
  }
  function listPopover(anchor, html, attr, title, onPick) {
    openPopover(anchor, html, {
      align: 'start',
      sheetTitle: title,
      onMount(node, close) {
        cat.liftPopover(node);
        node.addEventListener('click', (e) => {
          const item = e.target.closest(`[${attr}]`);
          if (!item || item.disabled) return;
          close();
          onPick(item.getAttribute(attr));
        });
      },
    });
  }

  // ---------- 动作分发 ----------
  function onAct(event) {
    const el = event.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const act = el.dataset.act;
    const inPop = el.closest('.popover');
    const inSheet = el.closest('.ed-sheet');
    if (inPop && !['brush-size'].includes(act)) closePopover();
    const d = el.dataset;
    switch (act) {
      case 'mode': setMode(d.mode); break;
      case 'undo': undo(); break;
      case 'redo': redo(); break;
      case 'share': openPopover(el, shareMenu(), { align: 'end', sheetTitle: '分享', onMount: (n) => n.addEventListener('click', onAct) }); break;
      case 'export': openPopover(el, exportMenu(), { align: 'end', sheetTitle: '导出', onMount: (n) => n.addEventListener('click', onAct) }); break;
      case 'more': if (isMobile()) openSheet('more'); else openPopover(el, moreMenu(), { align: 'end', onMount: (n) => n.addEventListener('click', onAct) }); break;
      case 'panel': S.panelOpen = !S.panelOpen; renderTop(); renderTools(); renderPanel(); break;
      case 'tool':
        if (d.tool === 'brush' && S.tool === 'brush') { brushMenu(el); break; }
        setTool(d.tool); break;
      case 'brush-size': S.brush = Number(d.value); closePopover(); renderTools(); renderMobile(); break;
      case 'stitch-tool': S.stitchTool = d.tool; renderTools(); renderOverlay(); vp.draw(); break;
      case 'zoom-in': vp.zoomStep(1); break;
      case 'zoom-out': vp.zoomStep(-1); break;
      case 'fit': vp.fit(); break;
      case 'zoom-to': vp.zoomToPercent(Number(d.value)); break;
      case 'zoom-menu': zoomMenu(el); break;
      case 'toggle': S[d.toggle] = !S[d.toggle]; renderZoom(); renderSheet(); vp.draw(); break;
      case 'tab': S.tab = d.panelTab; renderPanel(); break;
      case 'show-colors': S.panelOpen = true; S.tab = 'colors'; renderTop(); renderTools(); renderPanel(); break;
      case 'pick-color': setColor(d.key); if (inSheet && sheet?.kind === 'colors') sheet.close(); break;
      case 'replace-color': replaceMenu(el, d.key); break;
      case 'do-replace': if (inSheet) sheet.close(); replaceColor(d.key, d.value); break;
      case 'highlight': S.highlight = S.highlight === d.key ? null : d.key; renderPanel(); renderOverlay(); renderSheet(); vp.draw(); break;
      case 'palette': listPopover(el, cat.paletteMenu(S.palette), 'data-pick-palette', '选择色板', choosePalette); break;
      case 'spec': listPopover(el, cat.specMenu(S.spec, S.palette), 'data-pick-spec', '制作规格', chooseSpec); break;
      case 'kit': listPopover(el, cat.kitMenu(S.kit, S.palette), 'data-pick-kit', '套装档位', (v) => { S.kit = v === 'all' ? 'all' : Number(v); renderPanel(); renderSheet(); }); break;
      case 'pack': listPopover(el, `<div role="listbox">${[500, 1000, 2000, 5000].map((n) => `<button type="button" class="menu-item" data-pick-pack="${n}" aria-selected="${n === S.pack}">每包 ${cat.fmt(n)} 颗${n === S.pack ? `<span class="check">${icon('check', 's18')}</span>` : ''}</button>`).join('')}</div>`, 'data-pick-pack', '每包颗数', (v) => { S.pack = Number(v); renderPanel(); renderSheet(); }); break;
      case 'width': S.params.width = Number(d.width); renderPanel(); renderSheet(); break;
      case 'sampling': S.params.sample = d.value; renderPanel(); renderSheet(); break;
      case 'advanced': S.advOpen = !S.advOpen; renderPanel(); renderSheet(); break;
      case 'regen': regenerate(el); break;
      case 'transform': applyTransform(d.kind); break;
      case 'choose-source': closePopover(); sheet?.close(); sourceInput.click(); break;
      case 'copy-list': navigator.clipboard?.writeText(P.shoppingText(S)).catch(() => {}); toast('已复制采购清单', { iconName: 'copy' }); break;
      case 'row-done': rowDone(); break;
      case 'row-prev': setRow(S.rowIndex - 1); break;
      case 'row-next': setRow(S.rowIndex + 1); break;
      case 'row-pending': sheet?.close(); setRow(firstPending(S)); break;
      case 'board': jumpBoard(Number(d.board)); break;
      case 'ref-open': toggleRef(true); break;
      case 'ref-close': toggleRef(false); break;
      case 'ref-collapse': S.ref.collapsed = !S.ref.collapsed; if (refWin) { refWin.remove(); refWin = null; } renderRef(); break;
      case 'ref-missing': missingSource(el); break;
      case 'm-ref': sheet?.close(); if (S.source) toggleRef(); else missingSource(null); break;
      case 'm-sheet': openSheet(d.sheet); break;
      case 'rename': sheet?.close(); rename(); break;
      case 'save-retry': S.saveError = false; touchSave(); break;
      case 'copy-link': sheet?.close(); if (!loggedIn()) { ctx.loginDialog(); break; } navigator.clipboard?.writeText(`${location.origin}/s/7Kq2xP`).catch(() => {}); toast('已复制只读链接', { iconName: 'link' }); break;
      case 'publish': sheet?.close(); publishDialog(); break;
      case 'export-png': sheet?.close(); pngDialog(); break;
      case 'export-pdf': sheet?.close(); pdfDialog(); break;
      case 'export-project': sheet?.close(); toast('已导出项目文件', { iconName: 'file-down' }); break;
      case 'shopping': S.mode = 'edit'; S.panelOpen = true; S.tab = 'info'; refresh(); requestAnimationFrame(() => $('#ed-shopping', panel)?.scrollIntoView({ block: 'start', behavior: 'smooth' })); break;
      case 'duplicate': sheet?.close(); toast(`已复制为「${S.name} 副本」`, { iconName: 'copy' }); break;
      case 'shortcuts': shortcutsDialog(); break;
      case 'clear-progress': sheet?.close(); confirmDialog({ title: '清空跟拼进度？', text: '会清除全部「已拼」标记，图纸本身不受影响。', ok: '清空进度', danger: true, onOk() { const snap = snapshot(); S.progress = new Uint8Array(S.progress.length); commit(snap, { progress: true }); S.rowIndex = firstPending(S); refreshData(); toast('已清空跟拼进度', { action: { label: '撤销', onClick: undo } }); } }); break;
      case 'delete': sheet?.close(); confirmDialog({ title: '删除这张设计？', text: `「${S.name}」会从这台设备和云端删除，无法恢复。已公开到豆社的作品不受影响。`, ok: '删除设计', danger: true, onOk() { sessions.forEach((v, key) => { if (v === S) sessions.delete(key); }); ctx.navigate('/me'); toast(`已删除「${S.name}」`, { iconName: 'trash-2' }); } }); break;
      default: break;
    }
  }

  function rename() {
    if (isMobile()) {
      openDialog({
        title: '重命名',
        body: `<div class="field"><label for="ed-rename">设计名称</label><input class="input" id="ed-rename" maxlength="40" value="${esc(S.name)}" autofocus></div>`,
        foot: '<button type="button" class="btn btn-secondary" data-close>取消</button><button type="button" class="btn btn-primary" data-ok>保存</button>',
        onMount(dialog, close) {
          const input = $('#ed-rename', dialog);
          const save = () => { const v = input.value.trim(); close(); if (v && v !== S.name) { S.name = v; document.title = `${v} · 豆色绘`; touchSave(); renderTop(); toast('已重命名'); } };
          $('[data-ok]', dialog).addEventListener('click', save);
          input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
        },
      });
      return;
    }
    const slot = $('[data-title]', top);
    slot.innerHTML = `<input class="input ed-name-input" maxlength="40" value="${esc(S.name)}" aria-label="设计名称">`;
    const input = $('input', slot);
    input.focus();
    input.select();
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const value = input.value.trim();
      if (save && value && value !== S.name) { S.name = value; document.title = `${value} · 豆色绘`; touchSave(); toast('已重命名'); }
      renderTop();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') { e.stopPropagation(); finish(false); } });
    input.addEventListener('blur', () => finish(true));
  }

  // ---------- 输入 ----------
  function bindInputs(container) {
    container.addEventListener('input', (event) => {
      const t = event.target;
      if (t.matches('[data-color-search]')) {
        S.colorQuery = t.value;
        const grid = t.closest('.ed-sec')?.querySelector('[data-swatches]');
        if (grid) grid.innerHTML = P.swatchGrid(S);
        return;
      }
      const param = t.dataset.param;
      if (!param || t.type === 'checkbox') return;
      if (t.type === 'range') {
        S.params[param] = Number(t.value);
        const out = container.querySelector(`[data-out="${param}"]`);
        const v = S.params[param];
        if (out) out.textContent = param === 'colors' ? `${v} 色` : ['brightness', 'contrast'].includes(param) ? `${v > 0 ? '+' : ''}${v}` : String(v);
        updateDirty(container);
      }
    });
    container.addEventListener('change', (event) => {
      const t = event.target;
      const param = t.dataset.param;
      if (!param) return;
      if (t.type === 'checkbox') { S.params[param] = t.checked; if (param === 'removeBg') { renderPanel(); renderSheet(); } else updateDirty(container); return; }
      if (param === 'width') {
        const n = Math.round(Number(t.value));
        S.params.width = Number.isFinite(n) ? Math.max(20, Math.min(200, n)) : S.params.width;
        renderPanel(); renderSheet();
      }
    });
  }

  // ---------- 键盘 ----------
  function onKey(event) {
    if (event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (document.querySelector('.overlay')) return;
    const mod = event.metaKey || event.ctrlKey;
    const k = event.key.toLowerCase();
    if (mod && k === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
    if (mod && k === 'y') { event.preventDefault(); redo(); return; }
    if (mod || event.altKey) return;
    if (event.key === ' ') {
      event.preventDefault();
      if (!spaceHeld) { spaceHeld = true; canvas.classList.add('is-space'); renderTools(); vp.draw(); }
      return;
    }
    if (k === '+' || k === '=') { vp.zoomStep(1); return; }
    if (k === '-' || k === '_') { vp.zoomStep(-1); return; }
    if (k === '0') { vp.fit(); return; }
    if (k === '?') { shortcutsDialog(); return; }
    if (S.mode === 'stitch') {
      const map = { h: 'browse', m: 'mark' };
      if (map[k]) { S.stitchTool = map[k]; renderTools(); renderOverlay(); }
      return;
    }
    const tool = { h: 'hand', b: 'brush', e: 'eraser', g: 'fill', i: 'pick', r: 'replace' }[k];
    if (tool) setTool(tool);
  }
  function onKeyUp(event) {
    if (event.key !== ' ' || !spaceHeld) return;
    event.preventDefault();
    spaceHeld = false;
    canvas.classList.remove('is-space');
    renderTools();
    vp.draw();
  }

  function showHover(cell) {
    const node = $('[data-hover]', overlay);
    if (!node) return;
    node.hidden = !cell;
    overlay.classList.toggle('is-hovering', Boolean(cell));
    if (!cell) return;
    const key = S.pattern.keys[cell.row * S.pattern.width + cell.col];
    const done = S.mode === 'stitch' && key && S.progress[cell.row * S.pattern.width + cell.col] ? ' · 已拼' : '';
    node.textContent = `第 ${cell.row + 1} 行 · 第 ${cell.col + 1} 列 · ${label(key)}${done}`;
  }

  // ---------- 挂载 ----------
  ed.addEventListener('click', onAct);
  bindInputs(ed);
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', onKeyUp);
  const mq = window.matchMedia('(max-width: 767px)');
  const onBreakpoint = () => { sheet?.close(); if (refWin) { refWin.remove(); refWin = null; } refresh(); };
  mq.addEventListener('change', onBreakpoint);
  const accentObserver = new MutationObserver(() => { colors = readColors(); vp.refreshColors(); paintRefs(); });
  accentObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-accent'] });
  const onResize = () => { placeRef?.(); paintRefs(); };
  window.addEventListener('resize', onResize);

  refresh();
  if (S.mode === 'stitch' && ctx.query.get('mode') === 'stitch') requestAnimationFrame(revealRow);
  const sheetParam = ctx.query.get('sheet');
  if (sheetParam && isMobile() && ['colors', 'more', 'adjust', 'info', 'stitch', 'export', 'share'].includes(sheetParam)) requestAnimationFrame(() => openSheet(sheetParam));

  return () => {
    document.documentElement.classList.remove('in-editor');
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('keyup', onKeyUp);
    mq.removeEventListener('change', onBreakpoint);
    window.removeEventListener('resize', onResize);
    accentObserver.disconnect();
    clearTimeout(saveTimer);
    vp.destroy();
    sheet?.close();
    closePopover();
  };
}
