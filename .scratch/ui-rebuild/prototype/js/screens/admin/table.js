// 后台通用数据表格：工具条（搜索 / 筛选 / 导出）⇄ 批量操作条、表格（手机为卡片列表）、底部单行分页。
// 每张表的搜索、筛选、页码、排序与选中项按表 id 存在内存里，切换页面再回来保持原样。
import { icon } from '../../icons.js';
import { $, $$, esc, openPopover, emptyState, toast } from '../../ui.js';
import { openMenu } from './overlay.js';

const PAGE_SIZES = [10, 20, 50];
const stores = new Map();
export function tableStore(id) {
  if (!stores.has(id)) stores.set(id, { q: '', filters: {}, page: 1, size: 10, sort: null, selected: new Set() });
  return stores.get(id);
}

const optionsOf = (filter) => (typeof filter.options === 'function' ? filter.options() : filter.options);
const isActive = (filter, value) => (filter.multi ? Boolean(value?.length) : Boolean(value));

function applyFilters(cfg, state) {
  const q = state.q.trim().toLowerCase();
  let rows = cfg.rows().filter((row) => {
    if (q && !cfg.searchText(row).toLowerCase().includes(q)) return false;
    return (cfg.filters ?? []).every((filter) => {
      const value = state.filters[filter.key];
      return !isActive(filter, value) || filter.match(row, value);
    });
  });
  if (state.sort) {
    const column = cfg.columns.find((col) => col.key === state.sort.key);
    if (column?.sort) rows = [...rows].sort((a, b) => column.sort(a, b) * (state.sort.dir === 'asc' ? 1 : -1));
  }
  return rows;
}

function pageList(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const list = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pages - 1, page + 1);
  if (from > 2) list.push('…');
  for (let n = from; n <= to; n += 1) list.push(n);
  if (to < pages - 1) list.push('…');
  list.push(pages);
  return list;
}

// ---------- 模板 ----------
function toolbarHtml(cfg, state) {
  return `<div class="search adm-tsearch ${state.q ? 'has-value' : ''}" role="search">
      ${icon('search', 's16')}
      <input type="search" data-tsearch value="${esc(state.q)}" placeholder="${esc(cfg.searchPlaceholder)}" aria-label="${esc(cfg.searchPlaceholder)}" autocomplete="off">
      <button type="button" class="icon-btn sm clear" data-tsearch-clear aria-label="清除搜索">${icon('x', 's16')}</button>
    </div>
    ${cfg.filters?.length ? `<div class="adm-filters" role="group" aria-label="筛选">${cfg.filters.map((filter) => `<button type="button" class="btn btn-sm btn-outline adm-filter" data-filter="${filter.key}" aria-haspopup="dialog" aria-expanded="false">${esc(filter.label)}<span class="adm-fcount t-num" data-fcount="${filter.key}" hidden></span>${icon('chevron-down', 's16')}</button>`).join('')}</div>` : ''}
    <span class="grow adm-toolbar-gap"></span>
    ${cfg.exportCsv ? `<button type="button" class="btn btn-sm btn-ghost adm-export" data-export>${icon('download', 's16')}<span>导出<span class="hide-mobile"> CSV</span></span></button>` : ''}`;
}

function thHtml(column, state) {
  const cls = [column.cls, column.align === 'end' ? 'is-end' : ''].filter(Boolean).join(' ');
  if (!column.sort) return `<th scope="col" class="${cls}">${esc(column.label)}</th>`;
  const dir = state.sort?.key === column.key ? state.sort.dir : '';
  const sortIcon = dir === 'asc' ? 'chevron-up' : dir === 'desc' ? 'chevron-down' : 'arrow-up-down';
  return `<th scope="col" class="${cls}" aria-sort="${dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}"><button type="button" class="adm-sort ${dir ? 'is-on' : ''}" data-sort="${column.key}">${esc(column.label)}${icon(sortIcon, 's16')}</button></th>`;
}

function menuButton(cfg, row) {
  const id = esc(cfg.rowId(row));
  return `<button type="button" class="icon-btn sm" data-row-menu="${id}" aria-haspopup="menu" aria-label="「${esc(cfg.rowName(row))}」的更多操作" data-tip="更多操作" data-tip-side="top">${icon('ellipsis', 's18')}</button>`;
}

function checkbox(attr, checked, label) {
  return `<label class="checkbox adm-check"><input type="checkbox" ${attr} ${checked ? 'checked' : ''} aria-label="${esc(label)}"></label>`;
}

function bodyHtml(cfg, state, rows) {
  if (!rows.length) return '<div class="adm-empty" data-empty></div>';
  const allOnPage = rows.every((row) => state.selected.has(cfg.rowId(row)));
  const head = `<thead><tr>
    ${cfg.selectable ? `<th scope="col" class="adm-col-check">${checkbox('data-select-page', allOnPage, `选择本页全部 ${rows.length} 项`)}</th>` : ''}
    ${cfg.columns.map((column) => thHtml(column, state)).join('')}
    ${cfg.menu ? '<th scope="col" class="adm-col-menu"><span class="sr-only">操作</span></th>' : ''}
  </tr></thead>`;
  const body = rows.map((row) => {
    const id = cfg.rowId(row);
    const on = state.selected.has(id);
    return `<tr data-row="${esc(id)}" class="${on ? 'is-selected' : ''}">
      ${cfg.selectable ? `<td class="adm-col-check">${checkbox(`data-select="${esc(id)}"`, on, `选择「${cfg.rowName(row)}」`)}</td>` : ''}
      ${cfg.columns.map((column) => `<td class="${[column.cls, column.align === 'end' ? 'is-end' : ''].filter(Boolean).join(' ')}">${column.cell(row)}</td>`).join('')}
      ${cfg.menu ? `<td class="adm-col-menu">${menuButton(cfg, row)}</td>` : ''}
    </tr>`;
  }).join('');
  const cards = rows.map((row) => {
    const id = cfg.rowId(row);
    const on = state.selected.has(id);
    const card = cfg.card(row);
    return `<li class="adm-rcard ${on ? 'is-selected' : ''} ${cfg.selectable ? 'has-check' : ''}" data-row="${esc(id)}">
      ${cfg.selectable ? checkbox(`data-select="${esc(id)}"`, on, `选择「${cfg.rowName(row)}」`) : ''}
      ${card.lead ?? ''}
      <div class="adm-rcard-main">
        <button type="button" class="adm-cell-link" data-open="${esc(id)}">${esc(card.title)}</button>
        ${card.meta ? `<p class="adm-rcard-meta">${card.meta}</p>` : ''}
        ${card.tail ? `<div class="adm-rcard-tail">${card.tail}</div>` : ''}
      </div>
      ${cfg.menu ? menuButton(cfg, row) : ''}
    </li>`;
  }).join('');
  return `<div class="adm-table-wrap"><table class="table adm-table" style="--min:${cfg.minWidth ?? 760}px">${head}<tbody>${body}</tbody></table></div><ul class="adm-cards" role="list">${cards}</ul>`;
}

function pagerHtml(state, total) {
  const pages = Math.max(1, Math.ceil(total / state.size));
  const page = state.page;
  const nums = pageList(page, pages).map((n) => (n === '…'
    ? '<span class="adm-ellipsis" aria-hidden="true">…</span>'
    : `<button type="button" class="page-btn" data-goto="${n}" ${n === page ? 'aria-current="page"' : ''} aria-label="第 ${n} 页">${n}</button>`)).join('');
  return `<nav class="pagination adm-pager" aria-label="分页">
    <span class="adm-pager-total">共 <b class="t-num">${total}</b> 条</span>
    <span class="adm-pager-size">每页<button type="button" class="select adm-size" data-size aria-haspopup="menu" aria-expanded="false" aria-label="每页条数：${state.size} 条">${state.size} 条${icon('chevron-down', 's16')}</button></span>
    <div class="pages">
      <button type="button" class="page-btn" data-goto="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="上一页">${icon('chevron-left', 's16')}</button>
      ${nums}
      <button type="button" class="page-btn" data-goto="${page + 1}" ${page >= pages ? 'disabled' : ''} aria-label="下一页">${icon('chevron-right', 's16')}</button>
    </div>
    <label class="adm-jump">跳至<input class="input" data-jump inputmode="numeric" autocomplete="off" aria-label="跳到第几页，共 ${pages} 页">页</label>
    <div class="adm-pager-m">
      <button type="button" class="btn btn-outline" data-goto="${page - 1}" ${page <= 1 ? 'disabled' : ''}>${icon('chevron-left', 's16')}上一页</button>
      <span class="t-num">${page} / ${pages}</span>
      <button type="button" class="btn btn-outline" data-goto="${page + 1}" ${page >= pages ? 'disabled' : ''}>下一页${icon('chevron-right', 's16')}</button>
    </div>
  </nav>`;
}

function batchHtml(cfg, count, allOnPage) {
  return `${checkbox('data-select-page', allOnPage, '选择本页全部')}
    <span class="adm-batch-count" aria-live="polite">已选 <b class="t-num">${count}</b> 项</span>
    <span class="adm-batch-actions">${cfg.batch.map((action) => `<button type="button" class="btn btn-sm ${action.danger ? 'btn-danger-outline' : 'btn-outline'}" data-batch="${action.id}">${icon(action.icon, 's16')}<span>${action.prefix ? `<span class="hide-mobile">${esc(action.prefix)}</span>` : ''}${esc(action.label)}</span></button>`).join('')}</span>
    <span class="grow"></span>
    <button type="button" class="btn btn-sm btn-ghost hide-mobile" data-batch-clear>取消选择</button>
    <button type="button" class="icon-btn sm adm-m-only" data-batch-clear aria-label="取消选择">${icon('x', 's18')}</button>`;
}

function filterPanel(filter, value, rows) {
  const options = optionsOf(filter);
  const count = (optionValue) => rows.filter((row) => filter.match(row, filter.multi ? [optionValue] : optionValue)).length;
  if (filter.multi) {
    const selected = new Set(value ?? []);
    return `<div class="adm-fpanel" role="group" aria-label="按${esc(filter.label)}筛选">
      <div class="adm-fopts">${options.map(([optionValue, label]) => `<label class="checkbox adm-fopt"><input type="checkbox" value="${esc(optionValue)}" ${selected.has(optionValue) ? 'checked' : ''}><span class="grow">${esc(label)}</span><span class="adm-fopt-n t-num">${count(optionValue)}</span></label>`).join('')}</div>
      <div class="adm-fpanel-foot"><button type="button" class="btn btn-sm btn-ghost" data-fclear ${selected.size ? '' : 'disabled'}>清除</button><button type="button" class="btn btn-sm btn-secondary" data-fdone>完成</button></div>
    </div>`;
  }
  const item = (optionValue, label, n) => `<button type="button" class="menu-item" role="menuitemradio" aria-checked="${(value ?? '') === optionValue}" data-fopt="${esc(optionValue)}"><span class="grow">${esc(label)}</span>${n === undefined ? '' : `<span class="trail t-num">${n}</span>`}${(value ?? '') === optionValue ? `<span class="check">${icon('check', 's18')}</span>` : '<span class="adm-check-space"></span>'}</button>`;
  return `<div class="adm-menu" role="menu" aria-label="按${esc(filter.label)}筛选">${item('', '全部')}${options.map(([optionValue, label]) => item(optionValue, label, count(optionValue))).join('')}</div>`;
}

export function tableCard(cfg) {
  const state = tableStore(cfg.id);
  return `<section class="adm-card adm-table-card" data-table="${cfg.id}" aria-label="${esc(cfg.label)}">
    <div class="adm-toolbar">${toolbarHtml(cfg, state)}</div>
    <div class="adm-batchbar" data-batchbar></div>
    <div data-tbody></div>
    <div data-pager></div>
  </section>`;
}

// ---------- 交互 ----------
export function mountTable(root, cfg, hooks = {}) {
  const card = $(`[data-table="${cfg.id}"]`, root);
  const state = tableStore(cfg.id);
  let openId = null;
  let pageRows = [];
  let timer = 0;

  const find = (id) => cfg.rows().find((row) => cfg.rowId(row) === id);
  const api = {
    state,
    refresh,
    find,
    selectedRows: () => cfg.rows().filter((row) => state.selected.has(cfg.rowId(row))),
    clearSelection() { state.selected.clear(); syncSelection(); },
    changed() { refresh(); hooks.onChange?.(); },
  };

  function markOpen() {
    $$('[data-row]', card).forEach((node) => node.classList.toggle('is-open', node.dataset.row === openId));
  }

  function syncSelection() {
    const count = state.selected.size;
    const allOnPage = pageRows.length > 0 && pageRows.every((row) => state.selected.has(cfg.rowId(row)));
    const someOnPage = pageRows.some((row) => state.selected.has(cfg.rowId(row)));
    $$('[data-row]', card).forEach((node) => {
      const on = state.selected.has(node.dataset.row);
      node.classList.toggle('is-selected', on);
      const box = $('[data-select]', node);
      if (box) box.checked = on;
    });
    card.classList.toggle('has-selection', count > 0);
    const bar = $('[data-batchbar]', card);
    if (!count) bar.innerHTML = '';
    else if (!bar.firstElementChild) bar.innerHTML = batchHtml(cfg, count, allOnPage);
    else $('.adm-batch-count b', bar).textContent = String(count);
    $$('[data-select-page]', card).forEach((box) => { box.checked = allOnPage; box.indeterminate = someOnPage && !allOnPage; });
  }

  function refresh() {
    const ids = new Set(cfg.rows().map(cfg.rowId));
    [...state.selected].forEach((id) => { if (!ids.has(id)) state.selected.delete(id); });
    const rows = applyFilters(cfg, state);
    const pages = Math.max(1, Math.ceil(rows.length / state.size));
    state.page = Math.min(Math.max(1, state.page), pages);
    pageRows = rows.slice((state.page - 1) * state.size, state.page * state.size);
    $('[data-tbody]', card).innerHTML = bodyHtml(cfg, state, pageRows);
    const slot = $('[data-empty]', card);
    if (slot) {
      const filtered = state.q || (cfg.filters ?? []).some((filter) => isActive(filter, state.filters[filter.key]));
      slot.append(emptyState({
        kind: filtered ? 'search' : (cfg.emptyKind ?? 'empty'),
        compact: true,
        title: filtered ? (cfg.emptyFiltered ?? '没有符合条件的记录') : (cfg.emptyTitle ?? '暂时没有记录'),
        text: filtered ? '换个关键词，或清除筛选条件再试试。' : (cfg.emptyText ?? ''),
        actions: filtered ? '<button type="button" class="btn btn-secondary" data-reset>清除搜索和筛选</button>' : '',
      }));
    }
    $('[data-pager]', card).innerHTML = rows.length ? pagerHtml(state, rows.length) : '';
    (cfg.filters ?? []).forEach((filter) => {
      const value = state.filters[filter.key];
      const badge = $(`[data-fcount="${filter.key}"]`, card);
      const active = isActive(filter, value);
      badge.hidden = !active;
      badge.textContent = filter.multi ? String(value?.length ?? 0) : '1';
      badge.closest('.adm-filter').classList.toggle('is-active', active);
    });
    $('[data-batchbar]', card).innerHTML = '';
    syncSelection();
    markOpen();
  }

  function openRow(id) {
    const row = find(id);
    if (!row || !cfg.onOpen) return;
    openId = id;
    markOpen();
    cfg.onOpen(row, api, () => { openId = null; markOpen(); });
  }

  function exportCsv() {
    const rows = applyFilters(cfg, state);
    const columns = cfg.exportCsv.columns;
    const lines = [columns.map(([header]) => header), ...rows.map((row) => columns.map(([, get]) => get(row)))];
    const text = lines.map((line) => line.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff', text], { type: 'text/csv;charset=utf-8' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: cfg.exportCsv.filename });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast(`已导出 ${rows.length} 条记录`, { iconName: 'download' });
  }

  function openFilter(button) {
    const filter = cfg.filters.find((item) => item.key === button.dataset.filter);
    const all = cfg.rows();
    openPopover(button, filterPanel(filter, state.filters[filter.key], all), {
      align: 'start',
      sheetTitle: `按${filter.label}筛选`,
      onMount(node, close) {
        node.addEventListener('change', () => {
          state.filters[filter.key] = $$('input[type="checkbox"]:checked', node).map((input) => input.value);
          state.page = 1;
          refresh();
          const clear = $('[data-fclear]', node);
          if (clear) clear.disabled = !state.filters[filter.key].length;
        });
        node.addEventListener('click', (event) => {
          const option = event.target.closest('[data-fopt]');
          if (option) { state.filters[filter.key] = option.dataset.fopt; state.page = 1; refresh(); close(); return; }
          if (event.target.closest('[data-fclear]')) { state.filters[filter.key] = []; state.page = 1; refresh(); close(); return; }
          if (event.target.closest('[data-fdone]')) close();
        });
      },
    });
  }

  function openSizeMenu(button) {
    openPopover(button, `<div class="adm-menu" role="menu" aria-label="每页条数">${PAGE_SIZES.map((size) => `<button type="button" class="menu-item" role="menuitemradio" aria-checked="${size === state.size}" data-pick-size="${size}"><span class="grow">每页 ${size} 条</span>${size === state.size ? `<span class="check">${icon('check', 's18')}</span>` : '<span class="adm-check-space"></span>'}</button>`).join('')}</div>`, {
      align: 'start',
      onMount(node, close) {
        node.addEventListener('click', (event) => {
          const pick = event.target.closest('[data-pick-size]');
          if (!pick) return;
          state.size = Number(pick.dataset.pickSize);
          state.page = 1;
          close();
          refresh();
          $('[data-size]', card)?.focus();
        });
      },
    });
  }

  function goTo(page, focusSelector) {
    state.page = page;
    refresh();
    if (card.getBoundingClientRect().top < 0) card.scrollIntoView({ block: 'start' });
    if (focusSelector) ($(focusSelector, card) ?? $('.page-btn[aria-current="page"]', card))?.focus();
  }

  const onInput = (event) => {
    const input = event.target.closest('[data-tsearch]');
    if (!input) return;
    input.closest('.search').classList.toggle('has-value', Boolean(input.value));
    clearTimeout(timer);
    timer = setTimeout(() => { state.q = input.value; state.page = 1; refresh(); }, 160);
  };
  const onChange = (event) => {
    const box = event.target;
    if (box.matches('[data-select]')) {
      if (box.checked) state.selected.add(box.dataset.select); else state.selected.delete(box.dataset.select);
      syncSelection();
    } else if (box.matches('[data-select-page]')) {
      pageRows.forEach((row) => { if (box.checked) state.selected.add(cfg.rowId(row)); else state.selected.delete(cfg.rowId(row)); });
      syncSelection();
    }
  };
  const onKeydown = (event) => {
    const jump = event.target.closest('[data-jump]');
    if (jump && event.key === 'Enter') {
      event.preventDefault();
      const pages = Math.max(1, Math.ceil(applyFilters(cfg, state).length / state.size));
      const n = Number.parseInt(jump.value, 10);
      if (!Number.isFinite(n)) { jump.value = ''; return; }
      goTo(Math.min(pages, Math.max(1, n)), '[data-jump]');
      return;
    }
    const search = event.target.closest('[data-tsearch]');
    if (search && event.key === 'Escape' && search.value) {
      event.stopPropagation();
      search.value = '';
      search.closest('.search').classList.remove('has-value');
      state.q = '';
      refresh();
    }
  };
  const onClick = (event) => {
    const target = event.target;
    if (target.closest('[data-tsearch-clear]')) {
      const input = $('[data-tsearch]', card);
      input.value = '';
      input.closest('.search').classList.remove('has-value');
      state.q = '';
      state.page = 1;
      refresh();
      input.focus();
      return;
    }
    const filterButton = target.closest('[data-filter]');
    if (filterButton) { openFilter(filterButton); return; }
    if (target.closest('[data-export]')) { exportCsv(); return; }
    const goto = target.closest('[data-goto]');
    if (goto) { if (!goto.disabled) goTo(Number(goto.dataset.goto), `[data-goto="${goto.dataset.goto}"][aria-current]`); return; }
    const size = target.closest('[data-size]');
    if (size) { openSizeMenu(size); return; }
    const sort = target.closest('[data-sort]');
    if (sort) {
      const key = sort.dataset.sort;
      const dir = state.sort?.key === key ? state.sort.dir : '';
      state.sort = dir === '' ? { key, dir: 'desc' } : dir === 'desc' ? { key, dir: 'asc' } : null;
      refresh();
      $(`[data-sort="${key}"]`, card)?.focus();
      return;
    }
    const batch = target.closest('[data-batch]');
    if (batch) { cfg.onBatch?.(batch.dataset.batch, api.selectedRows(), api); return; }
    if (target.closest('[data-batch-clear]')) { api.clearSelection(); return; }
    if (target.closest('[data-reset]')) {
      state.q = '';
      state.filters = {};
      state.page = 1;
      const input = $('[data-tsearch]', card);
      input.value = '';
      input.closest('.search').classList.remove('has-value');
      refresh();
      return;
    }
    const menu = target.closest('[data-row-menu]');
    if (menu) {
      const row = find(menu.dataset.rowMenu);
      openMenu(menu, cfg.menu(row), { title: cfg.rowName(row), onPick: (action) => cfg.onMenu(action, row, api) });
      return;
    }
    const open = target.closest('[data-open]');
    if (open) { openRow(open.dataset.open); return; }
    if (target.closest('a, button, input, label, select, textarea')) return;
    const rowNode = target.closest('[data-row]');
    if (rowNode) openRow(rowNode.dataset.row);
  };

  card.addEventListener('input', onInput);
  card.addEventListener('change', onChange);
  card.addEventListener('keydown', onKeydown);
  card.addEventListener('click', onClick);
  refresh();
  if (hooks.openId) openRow(hooks.openId);
  return { api, cleanup: () => clearTimeout(timer) };
}
