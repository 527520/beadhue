// 编辑器右面板（桌面）与底部面板（手机）的内容：颜色 / 调整 / 信息 / 跟拼。都是 S 的纯函数。
import { BEADS } from '../../../motifs.js';
import { icon } from '../../icons.js';
import { esc } from '../../ui.js';
import { BEAD_KEYS, specById, paletteById, paletteLabel, kitLabel, boardWidths, boardsOf, fmt, swatch, pickerButton, paletteBand } from './catalog.js';
import { usage, beadTotal, boardGrid, boardCells, progressStats, rowRuns } from './model.js';

const beadName = (key) => `${BEADS[key].code} ${BEADS[key].name}`;

// ---------- 颜色 ----------
export function currentCard(S) {
  const b = BEADS[S.color];
  return `<div class="ed-current">
    ${swatch(S.color, 'xl')}
    <div class="grow"><div class="ed-current-name"><b class="t-mono">${b.code}</b><span class="ellipsis">${esc(b.name)}</span></div><div class="t-mono t-muted">${b.hex}</div></div>
    <span class="t-caption t-muted">当前色</span>
  </div>`;
}

export function usedList(S, { touch = false } = {}) {
  const list = usage(S.pattern.keys);
  if (!list.length) return '<p class="ed-empty-note">图纸还是空的。选一个颜色，用画笔或油漆桶开始画。</p>';
  return `<ul class="ed-used ${touch ? 'is-touch' : ''}">${list.map((c) => `
    <li class="ed-used-row ${c.key === S.color ? 'is-current' : ''} ${c.key === S.highlight ? 'is-highlight' : ''}">
      <button type="button" class="ed-used-main" data-act="pick-color" data-key="${c.key}" aria-pressed="${c.key === S.color}" aria-label="设为当前色：${esc(beadName(c.key))}，${c.count} 颗">
        ${swatch(c.key, 'sm')}<span class="t-mono code">${c.code}</span><span class="name ellipsis">${esc(c.name)}</span><span class="count t-num">${fmt(c.count)}</span>
      </button>
      <span class="ed-used-actions">
        <button type="button" class="icon-btn sm" data-act="replace-color" data-key="${c.key}" aria-label="替换 ${esc(beadName(c.key))}" data-tip="替换">${icon('replace', 's16')}</button>
        <button type="button" class="icon-btn sm" data-act="highlight" data-key="${c.key}" aria-pressed="${c.key === S.highlight}" aria-label="在画布上高亮 ${esc(beadName(c.key))}" data-tip="${c.key === S.highlight ? '取消高亮' : '高亮'}" data-tip-align="end">${icon('eye', 's16')}</button>
      </span>
    </li>`).join('')}</ul>`;
}

export function swatchGrid(S) {
  const q = S.colorQuery.trim().toLowerCase();
  const keys = BEAD_KEYS.filter((key) => !q || BEADS[key].code.toLowerCase().includes(q) || BEADS[key].name.includes(q));
  if (!keys.length) return `<p class="ed-empty-note">没有匹配「${esc(S.colorQuery)}」的颜色。换个色号或名称试试。</p>`;
  return `<div class="ed-swatches">${keys.map((key) => `<button type="button" class="ed-sw" style="--c:${BEADS[key].hex}" data-act="pick-color" data-key="${key}" aria-pressed="${key === S.color}" aria-label="${esc(beadName(key))}" data-tip="${esc(beadName(key))}"></button>`).join('')}</div>`;
}

export function colorsPanel(S, { touch = false } = {}) {
  const palette = paletteById(S.palette);
  const used = usage(S.pattern.keys).length;
  return `<section class="ed-sec">${currentCard(S)}
      ${pickerButton({ attr: 'data-act="palette"', label: paletteLabel(palette), prefix: paletteBand(palette), aria: '色板' })}
    </section>
    <section class="ed-sec">
      <h3 class="ed-sec-title">图纸用色 <span class="t-num">${used}</span></h3>
      <div data-used>${usedList(S, { touch })}</div>
    </section>
    <section class="ed-sec">
      <h3 class="ed-sec-title">全部颜色</h3>
      <label class="ed-search">${icon('search', 's16')}<input type="search" data-color-search value="${esc(S.colorQuery)}" placeholder="搜索色号或名称" aria-label="搜索色号或名称"></label>
      <div data-swatches>${swatchGrid(S)}</div>
    </section>`;
}

// ---------- 调整 ----------
function transformRow() {
  return `<section class="ed-sec"><h3 class="ed-sec-title">旋转与镜像</h3><div class="ed-transform">
    <button type="button" class="btn btn-outline btn-sm" data-act="transform" data-kind="rotate">${icon('rotate-cw')}旋转 90°</button>
    <button type="button" class="btn btn-outline btn-sm" data-act="transform" data-kind="mirror-h">${icon('flip-horizontal-2')}水平镜像</button>
    <button type="button" class="btn btn-outline btn-sm" data-act="transform" data-kind="mirror-v">${icon('flip-vertical-2')}垂直镜像</button>
  </div></section>`;
}
function specField(S) {
  return `<div class="ed-field"><span class="field-label">制作规格</span>${pickerButton({ attr: 'data-act="spec"', label: specById(S.spec).label, aria: '制作规格' })}</div>`;
}

export const paramsDirty = (S) => Boolean(S.source) && JSON.stringify([S.params, S.kit]) !== S.applied;

export function adjustPanel(S) {
  if (!S.source) {
    return `<section class="ed-sec"><div class="ed-need-source">
        <span class="ed-need-icon">${icon('image-plus')}</span>
        <div class="grow"><h3 class="t-title-3">需要原图才能重新生成</h3><p>宽度、颜色数和取样都要从原图重新计算，选择原图后即可调整。</p>
        <button type="button" class="btn btn-secondary btn-sm" data-act="choose-source">${icon('image')}选择原图</button></div>
      </div></section>
      <section class="ed-sec">${specField(S)}</section>
      ${transformRow()}`;
  }
  const P = S.params;
  const palette = paletteById(S.palette);
  const board = specById(S.spec).board;
  const { cols, rows, total } = boardsOf(S.pattern.width, S.pattern.height, board);
  const dirty = paramsDirty(S);
  return `<section class="ed-sec">
      <div class="ed-field">
        <div class="ed-field-head"><span class="field-label">图纸宽度</span><span class="t-caption t-muted t-num">当前 ${S.pattern.width} × ${S.pattern.height} 格 · ${total} 块板</span></div>
        <div class="ed-chips">${boardWidths(board).map(({ boards, width }) => `<button type="button" class="chip" data-act="width" data-width="${width}" aria-pressed="${P.width === width}">${boards} 板 · ${width}</button>`).join('')}</div>
        <label class="ed-num"><input class="input" type="number" min="20" max="200" step="1" value="${P.width}" data-param="width" aria-label="自定义宽度（格）"><span>格</span><span class="t-caption t-muted">20–200，高度按原图比例</span></label>
      </div>
      <div class="ed-field">
        <div class="ed-field-head"><label class="field-label" for="ed-colors">颜色数</label><output class="ed-value t-num" data-out="colors">${P.colors} 色</output></div>
        <input id="ed-colors" class="range" type="range" min="8" max="48" step="1" value="${P.colors}" data-param="colors">
      </div>
      <label class="ed-switch"><span class="grow"><span class="field-label">抖动</span><span class="hint">用交错的颜色模拟渐变，适合照片；卡通图建议关闭</span></span><input type="checkbox" class="switch" data-param="dither" ${P.dither ? 'checked' : ''}></label>
      <div class="ed-field">
        <span class="field-label">取样模式</span>
        <div class="seg ed-seg-block" role="group" aria-label="取样模式"><button type="button" class="seg-item" data-act="sampling" data-value="dominant" aria-pressed="${P.sample === 'dominant'}">主色</button><button type="button" class="seg-item" data-act="sampling" data-value="average" aria-pressed="${P.sample === 'average'}">平均色</button></div>
        <span class="hint">${P.sample === 'dominant' ? '主色：色块纯净，适合卡通和插画' : '平均色：过渡柔和，适合照片'}</span>
      </div>
      <div class="ed-adv">
        <button type="button" class="ed-adv-toggle" data-act="advanced" aria-expanded="${S.advOpen}">${icon(S.advOpen ? 'chevron-up' : 'chevron-down', 's18')}高级</button>
        ${S.advOpen ? `<div class="ed-adv-body">
          <div class="ed-field"><div class="ed-field-head"><label class="field-label" for="ed-bright">亮度</label><output class="ed-value t-num" data-out="brightness">${P.brightness > 0 ? '+' : ''}${P.brightness}</output></div><input id="ed-bright" class="range" type="range" min="-50" max="50" value="${P.brightness}" data-param="brightness"></div>
          <div class="ed-field"><div class="ed-field-head"><label class="field-label" for="ed-contrast">对比度</label><output class="ed-value t-num" data-out="contrast">${P.contrast > 0 ? '+' : ''}${P.contrast}</output></div><input id="ed-contrast" class="range" type="range" min="-50" max="50" value="${P.contrast}" data-param="contrast"></div>
          <label class="ed-switch"><span class="grow"><span class="field-label">去背景</span><span class="hint">从图片四边向内去掉相近的底色</span></span><input type="checkbox" class="switch" data-param="removeBg" ${P.removeBg ? 'checked' : ''}></label>
          ${P.removeBg ? `<div class="ed-field"><div class="ed-field-head"><label class="field-label" for="ed-tol">背景容差</label><output class="ed-value t-num" data-out="tolerance">${P.tolerance}</output></div><input id="ed-tol" class="range" type="range" min="0" max="40" value="${P.tolerance}" data-param="tolerance"></div>` : ''}
        </div>` : ''}
      </div>
    </section>
    <section class="ed-sec">
      ${specField(S)}
      <div class="ed-field"><span class="field-label">套装档位</span>${pickerButton({ attr: 'data-act="kit"', label: kitLabel(S.kit, palette), aria: '套装档位' })}<span class="hint">只用你手里那盒豆子有的颜色，不会生成买不到的色号</span></div>
      <button type="button" class="btn btn-secondary btn-block" data-act="regen">${icon('refresh-cw')}重新生成</button>
      <p class="ed-dirty" data-dirty ${dirty ? '' : 'hidden'}>${icon('info', 's16')}参数已修改，重新生成后生效</p>
    </section>
    ${transformRow()}`;
}

// ---------- 信息 ----------
function boardsDiagram(width, height, board) {
  const { cols, rows } = boardsOf(width, height, board);
  const colW = Array.from({ length: cols }, (_, i) => Math.min(board, width - i * board) / board);
  const rowH = Array.from({ length: rows }, (_, i) => Math.min(board, height - i * board) / board);
  return `<span class="ed-boards-mini" style="grid-template-columns:${colW.map((v) => `${v}fr`).join(' ')};grid-template-rows:${rowH.map((v) => `${v}fr`).join(' ')};aspect-ratio:${width}/${height}" aria-hidden="true">${'<i></i>'.repeat(cols * rows)}</span>`;
}

export function shoppingText(S) {
  const list = usage(S.pattern.keys);
  const palette = paletteById(S.palette);
  return [`${S.name} · 采购清单（${palette.name}，每包 ${S.pack} 颗）`, ...list.map((c) => `${c.code} ${c.name}  ${c.count} 颗  ${Math.ceil(c.count / S.pack)} 包`)].join('\n');
}

export function infoPanel(S) {
  const p = S.pattern;
  const spec = specById(S.spec);
  const palette = paletteById(S.palette);
  const list = usage(p.keys);
  const total = beadTotal(p.keys);
  const { cols, rows, total: boards } = boardsOf(p.width, p.height, spec.board);
  const packs = list.reduce((sum, c) => sum + Math.ceil(c.count / S.pack), 0);
  return `<section class="ed-sec">
      <dl class="ed-facts">
        <div><dt>尺寸</dt><dd class="t-num">${p.width} × ${p.height} 格</dd></div>
        <div><dt>总颗数</dt><dd class="t-num">${fmt(total)} 颗</dd></div>
        <div><dt>颜色</dt><dd class="t-num">${list.length} 色</dd></div>
        <div><dt>底板</dt><dd class="ed-boards-dd"><span class="t-num">${boards} 块（${cols} × ${rows}）</span>${boardsDiagram(p.width, p.height, spec.board)}</dd></div>
        <div><dt>规格</dt><dd>${spec.label}</dd></div>
        <div><dt>色板</dt><dd class="ellipsis">${esc(palette.name)}</dd></div>
      </dl>
    </section>
    <section class="ed-sec" id="ed-shopping">
      <div class="ed-sec-head"><h3 class="ed-sec-title">采购清单</h3><button type="button" class="btn btn-ghost btn-sm" data-act="pack" aria-haspopup="listbox">每包 ${fmt(S.pack)} 颗${icon('chevron-down', 's16')}</button></div>
      ${list.length ? `<table class="ed-shop">
        <thead><tr><th>色号</th><th>名称</th><th class="num">颗数</th><th class="num">包数</th></tr></thead>
        <tbody>${list.map((c) => `<tr><td><span class="ed-shop-code">${swatch(c.key, 'sm')}<span class="t-mono">${c.code}</span></span></td><td class="ellipsis">${esc(c.name)}</td><td class="num t-num">${fmt(c.count)}</td><td class="num t-num">${Math.ceil(c.count / S.pack)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="2">合计 ${list.length} 色</td><td class="num t-num">${fmt(total)}</td><td class="num t-num">${packs}</td></tr></tfoot>
      </table>
      <button type="button" class="btn btn-secondary btn-block" data-act="copy-list">${icon('copy')}复制清单</button>` : '<p class="ed-empty-note">图纸还是空的，画上颜色后这里会列出每个色号要买多少。</p>'}
    </section>`;
}

// ---------- 跟拼 ----------
export function runsHTML(S, row) {
  if (!row) return '';
  return rowRuns(S.pattern, S.board, row.board, row.local).map((run) => (run.key
    ? `<span class="ed-run">${swatch(run.key, 'sm')}<span class="t-mono">${BEADS[run.key].code}</span><b class="t-num">×${run.n}</b></span>`
    : `<span class="ed-run is-gap">空<b class="t-num">×${run.n}</b></span>`)).join('');
}

export function rowTitle(S, row) {
  if (!row) return '这张图纸没有可拼的格子';
  const stats = progressStats(S.pattern, S.progress, row.cells);
  return `第 ${row.board + 1} 块板 · 第 ${row.local + 1} 行 · ${stats.total} 颗`;
}

export function boardsOverview(S) {
  const { cols, count } = boardGrid(S.pattern, S.board);
  const current = S.currentRow?.board;
  return `<div class="ed-board-grid" style="grid-template-columns:repeat(${cols}, minmax(0, 1fr))">${Array.from({ length: count }, (_, index) => {
    const stats = progressStats(S.pattern, S.progress, boardCells(S.pattern, S.board, index));
    const state = !stats.total ? 'is-empty' : stats.done === stats.total ? 'is-done' : '';
    return `<button type="button" class="ed-board ${state} ${index === current ? 'is-current' : ''}" data-act="board" data-board="${index}" aria-label="第 ${index + 1} 块板，已拼 ${stats.percent}%" ${stats.total ? '' : 'disabled'} aria-current="${index === current}">
      <span class="ed-board-no t-num">${index + 1}</span>
      <span class="ed-board-pct t-num">${stats.total ? (stats.done === stats.total ? icon('check', 's16') : `${stats.percent}%`) : '空'}</span>
      <span class="ed-board-bar"><i style="width:${stats.percent}%"></i></span>
    </button>`;
  }).join('')}</div>`;
}

export function stitchPanel(S, { sheet = false } = {}) {
  const all = progressStats(S.pattern, S.progress);
  const row = S.currentRow;
  const rowStats = row ? progressStats(S.pattern, S.progress, row.cells) : null;
  const rowDone = rowStats && rowStats.done === rowStats.total;
  const finished = all.total && all.done === all.total;
  return `<section class="ed-sec ed-progress">
      <div class="ed-progress-head"><span class="t-title-1 t-num">${all.percent}%</span><span class="t-caption t-muted">进度只保存在本机</span></div>
      <div class="progress" role="progressbar" aria-label="整张图纸跟拼进度" aria-valuenow="${all.percent}" aria-valuemin="0" aria-valuemax="100"><i style="width:${all.percent}%"></i></div>
      <p class="t-body-sm t-muted">已拼 <b class="t-num">${fmt(all.done)}</b> / <span class="t-num">${fmt(all.total)}</span> 颗${finished ? ' · 全部拼完了' : ''}</p>
    </section>
    <section class="ed-sec">
      <h3 class="ed-sec-title">板块总览 <span class="t-num">${boardGrid(S.pattern, S.board).count}</span></h3>
      ${boardsOverview(S)}
    </section>
    ${sheet ? `<section class="ed-sec"><button type="button" class="btn btn-secondary btn-block" data-act="row-pending" ${finished ? 'disabled' : ''}>${icon('map-pin')}回到下一处未完成</button></section>` : `<section class="ed-sec ed-row-card">
      <span class="t-caption t-muted">当前行</span>
      <h3 class="t-title-3 t-num">${rowTitle(S, row)}</h3>
      ${row ? `<div class="ed-runs">${runsHTML(S, row)}</div>` : ''}
      <button type="button" class="btn ${rowDone ? 'btn-secondary' : 'btn-primary'} btn-block" data-act="row-done" ${row ? '' : 'disabled'}>${icon(rowDone ? 'undo-2' : 'check')}${rowDone ? '取消本行完成' : '完成本行'}</button>
      <div class="ed-row-nav">
        <button type="button" class="btn btn-secondary" data-act="row-prev" ${S.rowIndex > 0 ? '' : 'disabled'}>${icon('chevron-up')}上一行</button>
        <button type="button" class="btn btn-secondary" data-act="row-next" ${row && S.rowIndex < S.rows().length - 1 ? '' : 'disabled'}>下一行${icon('chevron-down')}</button>
      </div>
      <button type="button" class="btn btn-ghost btn-block" data-act="row-pending" ${finished ? 'disabled' : ''}>${icon('map-pin')}回到下一处未完成</button>
    </section>
    <p class="ed-hint">标记模式下轻点格子即可标记已拼；拖动只移动画布，不会误标。</p>`}`;
}
