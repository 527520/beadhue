// 发现页：吸顶像素类目条 + 筛选 / 排序 + 作品网格；/search 为搜索结果与手机全屏搜索。
import { icon } from '../icons.js';
import { $, $$, esc, workCard, skeletonCards, emptyState, openPopover, closePopover, isMobile, toast } from '../ui.js';
import { WORKS, CATEGORIES, HOT_SEARCHES } from '../data.js';
import { pixelIcon } from '../beads.js';

const SORTS = [['rec', '推荐'], ['new', '最新发布'], ['likes', '最多喜欢'], ['reuses', '最多引用']];
const FILTERS = {
  size: { label: '尺寸', options: [['s', '小于 30 格'], ['m', '30–40 格'], ['l', '40 格以上']] },
  colors: { label: '颜色数', options: [['few', '6 色以内'], ['mid', '7–10 色'], ['many', '10 色以上']] },
  spec: { label: '制作规格', options: [['5mm', '5mm 标准豆'], ['2.6mm', '2.6mm 迷你豆']] },
  since: { label: '发布时间', options: [['7', '一周内'], ['30', '一个月内']] },
};

function readState(query) {
  return {
    q: query.get('q') ?? '',
    cat: query.get('cat') ?? 'all',
    sort: query.get('sort') ?? 'rec',
    size: query.get('size') ?? '',
    colors: query.get('colors') ?? '',
    spec: query.get('spec') ?? '',
    since: query.get('since') ?? '',
  };
}

function filterWorks(state) {
  let list = WORKS.filter((work) => {
    if (state.cat === 'featured' && !work.featured) return false;
    if (state.cat !== 'all' && state.cat !== 'featured' && !work.tags.includes(state.cat)) return false;
    if (state.q && !(work.title.includes(state.q) || work.tags.some((tag) => tag.includes(state.q)) || work.author.name.includes(state.q))) return false;
    const size = work.pattern.width;
    if (state.size === 's' && size >= 30) return false;
    if (state.size === 'm' && (size < 30 || size > 40)) return false;
    if (state.size === 'l' && size <= 40) return false;
    if (state.colors === 'few' && work.colorCount > 6) return false;
    if (state.colors === 'mid' && (work.colorCount < 7 || work.colorCount > 10)) return false;
    if (state.colors === 'many' && work.colorCount <= 10) return false;
    if (state.spec === '2.6mm') return false;
    if (state.since && work.daysAgo > Number(state.since)) return false;
    return true;
  });
  const by = {
    rec: (a, b) => Number(b.featured) - Number(a.featured) || b.likes - a.likes,
    new: (a, b) => a.daysAgo - b.daysAgo,
    likes: (a, b) => b.likes - a.likes,
    reuses: (a, b) => b.reuses - a.reuses,
  }[state.sort];
  list = [...list].sort(by);
  return list;
}

function hrefWith(state, patch) {
  const next = { ...state, ...patch };
  const search = new URLSearchParams(Object.entries(next).filter(([key, value]) => value && !(key === 'cat' && value === 'all') && !(key === 'sort' && value === 'rec')));
  const base = next.q ? '#/search' : '#/';
  const text = search.toString();
  return text ? `${base}?${text}` : base;
}

const activeFilterCount = (state) => ['size', 'colors', 'spec', 'since'].filter((key) => state[key]).length;

function filterPanel(state, draft) {
  const count = filterWorks({ ...state, ...draft }).length;
  return `<div class="filter-panel">
    ${Object.entries(FILTERS).map(([key, group]) => `
      <section class="filter-group"><h3>${group.label}</h3><div class="filter-options">
        ${group.options.map(([value, label]) => `<button type="button" class="chip outline ${draft[key] === value ? 'is-selected' : ''}" data-filter="${key}" data-value="${value}" aria-pressed="${draft[key] === value}">${label}</button>`).join('')}
      </div></section>`).join('')}
    <footer class="filter-foot"><button type="button" class="btn btn-ghost" data-filter-clear>清除全部</button><button type="button" class="btn btn-primary" data-filter-apply ${count ? '' : 'disabled'}>${count ? `显示 ${count} 张图纸` : '没有符合的图纸'}</button></footer>
  </div>`;
}

function sortMenu(state) {
  return SORTS.map(([value, label]) => `<a class="menu-item" role="menuitemradio" aria-checked="${state.sort === value}" href="${hrefWith(state, { sort: value })}">${label}${state.sort === value ? `<span class="check">${icon('check', 's18')}</span>` : ''}</a>`).join('');
}

function mobileSearchPanel(state) {
  const recent = JSON.parse(localStorage.getItem('proto-recent') ?? '[]');
  return `<div class="m-search-body container">
    ${recent.length ? `<section><h2 class="t-caption t-muted">最近搜索</h2><div class="chip-row">${recent.map((item) => `<a class="chip outline" href="#/search?q=${encodeURIComponent(item)}">${icon('history', 's16')}${esc(item)}</a>`).join('')}</div></section>` : ''}
    <section><h2 class="t-caption t-muted">大家在搜</h2><div class="chip-row">${HOT_SEARCHES.map((item) => `<a class="chip" href="#/search?q=${encodeURIComponent(item)}">${esc(item)}</a>`).join('')}</div></section>
    <section><h2 class="t-caption t-muted">按类目看看</h2><div class="m-search-cats">${CATEGORIES.slice(1).map((cat) => `<a class="m-search-cat" href="${hrefWith({ ...state, q: '' }, { cat: cat.id })}"><span data-icon="${cat.id}"></span>${cat.label}</a>`).join('')}</div></section>
  </div>`;
}

export default {
  nav: 'discover',
  title: (ctx) => (ctx.query.get('q') ? `“${ctx.query.get('q')}”的搜索结果` : '发现'),
  mobileTop(ctx) {
    if (ctx.path === '/search') {
      const q = ctx.query.get('q') ?? '';
      return `<a class="icon-btn" href="#/" aria-label="返回">${icon('arrow-left')}</a>
        <form class="search m-search ${q ? 'has-value' : ''}" data-m-search role="search">${icon('search', 's18')}<input type="search" name="q" value="${esc(q)}" placeholder="搜索图纸、标签或作者" aria-label="搜索" ${q ? '' : 'autofocus'}><button type="button" class="icon-btn sm clear" data-m-clear aria-label="清除">${icon('x', 's16')}</button></form>`;
    }
    return `<a class="brand" href="#/" aria-label="豆色绘首页"><span class="brand-mark" aria-hidden="true"><i style="--c:#e0473f"></i><i style="--c:#ffd447"></i><i style="--c:#3f7fd9"></i><i style="--c:#47a35b"></i></span><span class="brand-word"><b>豆色绘</b></span></a><span class="grow"></span><a class="icon-btn" href="#/search" aria-label="搜索">${icon('search')}</a><button class="icon-btn" aria-label="通知" data-notify>${icon('bell')}</button>`;
  },
  render(ctx) {
    const state = readState(ctx.query);
    const searching = ctx.path === '/search';
    if (searching && !state.q && isMobile()) return mobileSearchPanel(state);
    const works = filterWorks(state);
    const filters = activeFilterCount(state);
    const cat = CATEGORIES.find((item) => item.id === state.cat) ?? CATEGORIES[0];
    const sortLabel = SORTS.find(([value]) => value === state.sort)[1];
    const chips = ['size', 'colors', 'spec', 'since'].filter((key) => state[key]).map((key) => {
      const label = FILTERS[key].options.find(([value]) => value === state[key])?.[1];
      return `<a class="chip is-selected" href="${hrefWith(state, { [key]: '' })}" aria-label="移除筛选：${label}">${label}<span class="remove">${icon('x', 's16')}</span></a>`;
    });
    const showIntro = !searching && state.cat === 'all' && !filters && !sessionStorage.getItem('proto-intro-closed');
    return `
      <div class="cats-bar" data-cats-bar><div class="container wide cats-inner">
        <nav class="cats" aria-label="类目">${CATEGORIES.map((item) => `<a class="cat" href="${hrefWith(state, { cat: item.id })}" aria-pressed="${item.id === state.cat}"><span data-icon="${item.id}"></span>${item.label}</a>`).join('')}</nav>
        <div class="cats-tools">
          <button class="btn btn-outline filter-btn ${filters ? 'has-count' : ''}" data-open-filter aria-haspopup="dialog">${icon('sliders-horizontal')}<span class="hide-mobile">筛选</span>${filters ? `<span class="count-badge">${filters}</span>` : ''}</button>
          <button class="btn btn-outline" data-open-sort aria-haspopup="menu">${icon('arrow-up-down')}<span class="hide-mobile">${sortLabel}</span></button>
        </div>
      </div></div>
      <div class="container wide discover">
        ${showIntro ? `<aside class="intro-strip" data-intro><span class="intro-beads" aria-hidden="true"><i></i><i></i><i></i></span><p><b>第一次来？</b><span class="hide-mobile">上传一张喜欢的图片，几秒生成可以照着拼的图纸。</span><span class="show-mobile">点下方 ＋ 上传图片，几秒生成图纸。</span></p><a class="btn btn-sm btn-outline hide-mobile" href="#/create">看看怎么做</a><button class="icon-btn sm" data-close-intro aria-label="不再显示">${icon('x', 's18')}</button></aside>` : ''}
        ${searching || state.cat !== 'all' || chips.length ? `<header class="result-head">
          <div class="grow"><h1 class="t-title-1">${searching ? `“${esc(state.q)}”` : esc(cat.label)}</h1><p class="t-body-sm t-muted"><span class="t-num">${works.length}</span> 张图纸${searching ? ' · 标题、标签和作者都会被搜索' : ''}</p></div>
          ${searching ? `<a class="btn btn-ghost" href="#/">${icon('x', 's18')}清除搜索</a>` : ''}
        </header>` : ''}
        ${chips.length ? `<div class="chip-row active-filters">${chips.join('')}<a class="btn btn-sm btn-ghost" href="${hrefWith(state, { size: '', colors: '', spec: '', since: '' })}">全部清除</a></div>` : ''}
        <section aria-label="作品">
          ${works.length ? `<div class="work-grid" data-grid>${works.map((work) => workCard(work)).join('')}</div>
          <div class="load-more"><button class="btn btn-secondary" data-load-more>加载更多</button></div>` : '<div data-empty></div>'}
        </section>
      </div>`;
  },
  mount(root, ctx) {
    const state = readState(ctx.query);
    for (const slot of $$('[data-icon]', root)) {
      const cat = CATEGORIES.find((item) => item.id === slot.dataset.icon);
      if (cat) slot.replaceWith(pixelIcon(cat.icon, isMobile() ? 24 : 28));
    }
    const empty = $('[data-empty]', root);
    if (empty) {
      empty.replaceWith(emptyState({
        kind: 'search',
        title: state.q ? `没有找到“${state.q}”相关的图纸` : '没有符合条件的图纸',
        text: '换个关键词，或去掉一些筛选条件再试试。',
        actions: `<a class="btn btn-secondary" href="#/">清除搜索和筛选</a>`,
      }));
      const hot = document.createElement('div');
      hot.className = 'chip-row empty-hot';
      hot.innerHTML = HOT_SEARCHES.map((item) => `<a class="chip" href="#/search?q=${encodeURIComponent(item)}">${esc(item)}</a>`).join('');
      $('.empty', root)?.append(hot);
    }
    const bar = $('[data-cats-bar]', root);
    const listeners = new AbortController();
    const onScroll = () => bar?.classList.toggle('is-stuck', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true, signal: listeners.signal });

    root.addEventListener('click', (event) => {
      if (event.target.closest('[data-close-intro]')) { sessionStorage.setItem('proto-intro-closed', '1'); $('[data-intro]', root)?.remove(); return; }
      if (event.target.closest('[data-notify]')) { toast('暂无新通知', { iconName: 'bell' }); return; }
      const sortButton = event.target.closest('[data-open-sort]');
      if (sortButton) { openPopover(sortButton, `<div role="menu" aria-label="排序">${sortMenu(state)}</div>`, { align: 'end', sheetTitle: '排序' }); return; }
      const filterButton = event.target.closest('[data-open-filter]');
      if (filterButton) {
        const draft = { size: state.size, colors: state.colors, spec: state.spec, since: state.since };
        const bind = (container, close) => {
          container.addEventListener('click', (inner) => {
            const option = inner.target.closest('[data-filter]');
            if (option) {
              draft[option.dataset.filter] = draft[option.dataset.filter] === option.dataset.value ? '' : option.dataset.value;
              container.querySelector('.filter-panel').outerHTML = filterPanel(state, draft);
              return;
            }
            if (inner.target.closest('[data-filter-clear]')) { Object.keys(draft).forEach((key) => { draft[key] = ''; }); container.querySelector('.filter-panel').outerHTML = filterPanel(state, draft); return; }
            if (inner.target.closest('[data-filter-apply]')) { close(); ctx.navigate(hrefWith(state, draft).slice(1)); }
          });
        };
        openPopover(filterButton, filterPanel(state, draft), { align: 'end', wide: true, sheetTitle: '筛选', onMount: bind });
        return;
      }
      if (event.target.closest('[data-load-more]')) {
        const grid = $('[data-grid]', root);
        const button = event.target.closest('[data-load-more]');
        button.classList.add('is-loading');
        grid.insertAdjacentHTML('beforeend', skeletonCards(isMobile() ? 4 : 5));
        setTimeout(() => {
          $$('[aria-hidden="true"].work-card', grid).forEach((node) => node.remove());
          button.classList.remove('is-loading');
          button.disabled = true;
          button.textContent = '已经到底了';
        }, 1200);
      }
    }, { signal: listeners.signal });
    const mForm = $('[data-m-search]', root);
    if (mForm) {
      const input = $('input', mForm);
      input.addEventListener('input', () => mForm.classList.toggle('has-value', Boolean(input.value)));
      $('[data-m-clear]', mForm).addEventListener('click', () => { input.value = ''; mForm.classList.remove('has-value'); input.focus(); });
      mForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const value = input.value.trim();
        if (!value) return;
        const recent = JSON.parse(localStorage.getItem('proto-recent') ?? '[]');
        localStorage.setItem('proto-recent', JSON.stringify([value, ...recent.filter((item) => item !== value)].slice(0, 6)));
        ctx.navigate(`/search?q=${encodeURIComponent(value)}`);
      });
    }
    return () => { listeners.abort(); closePopover(); };
  },
};
