// 管理后台：自带外壳（侧栏 + 顶栏），与用户端同一套令牌。路由 #/admin/:section，ctx.params[0] 为 section。
import { icon } from '../icons.js';
import { $, $$, esc, avatar, openPopover, closePopover, openDialog } from '../ui.js';
import { counts } from './admin/data.js';
import overview from './admin/overview.js';
import reviews from './admin/reviews.js';
import { worksSection, tagsSection, batchesSection } from './admin/content.js';
import { commentsSection, reportsSection } from './admin/moderation.js';
import { usersSection, auditSection } from './admin/people.js';
import { logsSection, analyticsSection, systemSection } from './admin/ops.js';

const SECTIONS = {
  overview, reviews, comments: commentsSection, reports: reportsSection, works: worksSection, tags: tagsSection,
  batches: batchesSection, users: usersSection, analytics: analyticsSection, audit: auditSection, logs: logsSection, system: systemSection,
};
const NAV = [
  ['工作台', [['overview', 'layout-dashboard']]],
  ['内容', [['reviews', 'inbox'], ['comments', 'messages-square'], ['reports', 'flag'], ['works', 'grid-3x3'], ['tags', 'tags'], ['batches', 'layers']]],
  ['用户', [['users', 'users']]],
  ['系统', [['analytics', 'chart-column'], ['audit', 'scroll-text'], ['logs', 'activity'], ['system', 'server']]],
];
const COUNTED = ['reviews', 'comments', 'reports'];
const PREF_KEY = 'adm-side';
const sectionOf = (ctx) => (SECTIONS[ctx.params[0]] ? ctx.params[0] : 'overview');
const mq = { desk: () => matchMedia('(min-width: 1024px)').matches, tablet: () => matchMedia('(min-width: 768px) and (max-width: 1023px)').matches };
const prefCollapsed = () => localStorage.getItem(PREF_KEY) === 'collapsed';
const initialCompact = () => (mq.desk() ? prefCollapsed() : mq.tablet());

const MARK = '<span class="brand-mark" aria-hidden="true"><i style="--c:#e0473f"></i><i style="--c:#ffd447"></i><i style="--c:#3f7fd9"></i><i style="--c:#47a35b"></i></span>';
const brand = () => `<a class="brand adm-brand" href="#/admin" aria-label="豆色绘管理后台首页">${MARK}<span class="brand-word"><b>豆色绘</b></span><span class="adm-brand-tag">管理后台</span></a>`;

function navItem(id, iconName, active, c) {
  const section = SECTIONS[id];
  const count = COUNTED.includes(id) ? c[id] : 0;
  return `<a class="adm-nav-item" href="#/admin${id === 'overview' ? '' : `/${id}`}" ${active ? 'aria-current="page"' : ''} data-nav="${id}" aria-label="${section.label}${count ? `，${count} 项待处理` : ''}" data-tip="${section.label}" data-tip-side="right">
    ${icon(iconName)}<span class="adm-nav-label">${section.label}</span>${COUNTED.includes(id) ? `<span class="adm-count t-num" data-nav-count="${id}" ${count ? '' : 'hidden'}>${count}</span>` : ''}
  </a>`;
}

function sidebar(active) {
  const c = counts();
  return `<aside class="adm-side" id="adm-side" aria-label="后台导航">
    <div class="adm-side-head">
      ${brand()}
      <button type="button" class="icon-btn sm adm-side-toggle" data-adm-toggle aria-controls="adm-side" aria-label="收起侧栏" data-tip="收起侧栏" data-tip-side="right">${icon('panel-left', 's18')}</button>
      <button type="button" class="icon-btn sm adm-side-close" data-adm-drawer-close aria-label="关闭导航">${icon('x', 's18')}</button>
    </div>
    <nav class="adm-nav">${NAV.map(([group, items]) => `<div class="adm-nav-group" role="group" aria-label="${group}"><span class="adm-nav-group-label">${group}</span>${items.map(([id, iconName]) => navItem(id, iconName, id === active, c)).join('')}</div>`).join('')}</nav>
    <div class="adm-side-foot"><a class="adm-nav-item" href="#/" aria-label="返回豆色绘" data-tip="返回豆色绘" data-tip-side="right">${icon('arrow-left')}<span class="adm-nav-label">返回豆色绘</span></a></div>
  </aside>`;
}

function topbar(section, ctx) {
  const user = ctx.session.user;
  return `<header class="adm-top">
    <button type="button" class="icon-btn adm-menu-btn" data-adm-drawer aria-controls="adm-side" aria-expanded="false" aria-label="打开导航">${icon('menu')}</button>
    <a class="adm-top-brand" href="#/admin" aria-label="管理后台首页">${MARK}<span>管理后台</span></a>
    <nav class="adm-crumbs" aria-label="当前位置"><a href="#/admin">后台</a><span class="sep" aria-hidden="true">/</span><span aria-current="page">${section.label}</span></nav>
    <span class="grow"></span>
    <form class="search adm-search" role="search" data-adm-search>
      ${icon('search', 's16')}
      <input type="search" name="q" placeholder="搜索作品、用户或评论" aria-label="搜索作品、用户或评论" autocomplete="off">
      <span class="kbd" aria-hidden="true">/</span>
    </form>
    <button type="button" class="icon-btn adm-search-btn" data-adm-search-open aria-label="搜索">${icon('search')}</button>
    <button type="button" class="adm-account" data-adm-account aria-haspopup="menu" aria-expanded="false" aria-label="管理员账号菜单">${avatar(user, 'sm')}<span class="adm-account-name">${esc(user.name)}</span>${icon('chevron-down', 's16')}</button>
  </header>`;
}

function guard() {
  return `<div class="adm-guard"><div class="adm-card adm-guard-card">
    <span class="adm-guard-brand">${MARK}<b>豆色绘</b><span class="adm-brand-tag">管理后台</span></span>
    <h1 class="t-title-2">登录管理员账号后继续</h1>
    <p class="adm-muted">管理后台只对管理员和审核员开放。</p>
    <div class="adm-guard-actions"><a class="btn btn-ghost" href="#/">返回豆色绘</a><button type="button" class="btn btn-primary" data-login>登录</button></div>
  </div></div>`;
}

const SCOPES = [['works', '在作品中搜索', 'grid-3x3'], ['users', '在人员中搜索', 'users'], ['comments', '在评论中搜索', 'messages-square'], ['logs', '在运行日志中搜索', 'activity']];
const scopeMenu = (q) => `<div class="adm-menu" role="menu" aria-label="搜索范围">${SCOPES.map(([id, label, iconName], index) => `<a class="menu-item" role="menuitem" href="#/admin/${id}?q=${encodeURIComponent(q)}">${icon(iconName)}<span class="grow">${label}「<b class="adm-strong">${esc(q)}</b>」</span>${index === 0 ? '<span class="trail">回车</span>' : ''}</a>`).join('')}</div>`;

export default {
  shell: 'bare',
  title: (ctx) => (ctx.session.loggedIn ? `${SECTIONS[sectionOf(ctx)].label} · 管理后台` : '管理后台'),
  render(ctx) {
    if (!ctx.session.loggedIn) return guard();
    const id = sectionOf(ctx);
    const section = SECTIONS[id];
    return `<div class="adm" data-section="${id}" data-compact="${initialCompact()}">
      ${sidebar(id)}
      <div class="adm-scrim" data-adm-scrim></div>
      <div class="adm-main">
        ${topbar(section, ctx)}
        <main class="adm-page" id="main">
          <header class="adm-head"><div class="grow"><h1 class="t-title-1">${section.label}</h1><p>${section.desc}</p></div>${section.actions ? `<div class="adm-head-actions">${section.actions(ctx)}</div>` : ''}</header>
          ${section.render(ctx)}
        </main>
      </div>
    </div>`;
  },
  mount(root, ctx) {
    if (!ctx.session.loggedIn) return null;
    const shell = $('.adm', root);
    const side = $('.adm-side', shell);
    const main = $('.adm-main', shell);
    let railOpen = false;

    const applyCompact = () => {
      const compact = mq.desk() ? prefCollapsed() : mq.tablet() ? !railOpen : false;
      shell.dataset.compact = String(compact);
      shell.dataset.railOpen = String(mq.tablet() && railOpen);
      const toggle = $('[data-adm-toggle]', shell);
      const label = compact ? '展开侧栏' : '收起侧栏';
      toggle.setAttribute('aria-label', label);
      toggle.dataset.tip = label;
      toggle.setAttribute('aria-expanded', String(!compact));
    };
    const setDrawer = (open) => {
      shell.dataset.drawer = open ? 'open' : '';
      $('[data-adm-drawer]', shell).setAttribute('aria-expanded', String(open));
      main.inert = open;
      if (open) $('.adm-nav-item[aria-current]', side)?.focus();
    };
    const refreshCounts = () => {
      const c = counts();
      COUNTED.forEach((key) => {
        $$(`[data-nav-count="${key}"]`, shell).forEach((node) => { node.textContent = String(c[key]); node.hidden = !c[key]; });
        const link = $(`[data-nav="${key}"]`, shell);
        link?.setAttribute('aria-label', `${SECTIONS[key].label}${c[key] ? `，${c[key]} 项待处理` : ''}`);
      });
    };
    applyCompact();

    const onResize = () => { railOpen = false; if (!matchMedia('(max-width: 767px)').matches) setDrawer(false); applyCompact(); };
    const onClick = (event) => {
      const target = event.target;
      if (target.closest('[data-adm-toggle]')) {
        if (mq.desk()) localStorage.setItem(PREF_KEY, prefCollapsed() ? 'expanded' : 'collapsed');
        else railOpen = !railOpen;
        applyCompact();
        return;
      }
      if (target.closest('[data-adm-drawer]')) { setDrawer(true); return; }
      if (target.closest('[data-adm-drawer-close], [data-adm-scrim]')) { setDrawer(false); railOpen = false; applyCompact(); $('[data-adm-drawer]', shell)?.focus(); return; }
      if (railOpen && !target.closest('.adm-side')) { railOpen = false; applyCompact(); }
      const account = target.closest('[data-adm-account]');
      if (account) {
        const user = ctx.session.user;
        openPopover(account, `<div class="adm-acct-head">${avatar(user, 'lg')}<div class="grow"><b>${esc(user.name)}</b><span class="adm-muted">${esc(user.email)}</span></div><span class="badge official">管理员</span></div>
          <div class="menu-sep"></div>
          <a class="menu-item" href="#/">${icon('house')}返回豆色绘</a>
          <a class="menu-item" href="#/me">${icon('user')}我的主页</a>
          <a class="menu-item" href="#/me/settings">${icon('settings')}账号设置</a>
          <a class="menu-item" href="#/components">${icon('layout-grid')}组件总览</a>
          <div class="menu-sep"></div>
          <button type="button" class="menu-item" data-logout>${icon('log-out')}退出登录</button>`, { align: 'end' });
        return;
      }
      if (target.closest('[data-adm-search-open]')) {
        openDialog({
          title: '搜索后台',
          body: `<form class="search adm-sheet-search" data-sheet-search role="search">${icon('search', 's18')}<input type="search" name="q" placeholder="搜索作品、用户或评论" aria-label="搜索作品、用户或评论" autofocus autocomplete="off"></form><div data-sheet-scopes></div>`,
          onMount(dialog, close) {
            const input = $('input', dialog);
            input.addEventListener('input', () => { $('[data-sheet-scopes]', dialog).innerHTML = input.value.trim() ? scopeMenu(input.value.trim()) : ''; });
            $('[data-sheet-search]', dialog).addEventListener('submit', (submit) => { submit.preventDefault(); if (input.value.trim()) { close(); ctx.navigate(`/admin/works?q=${encodeURIComponent(input.value.trim())}`); } });
            dialog.addEventListener('click', (inner) => { if (inner.target.closest('a.menu-item')) close(); });
          },
        });
      }
    };
    const onKey = (event) => {
      if (event.key === 'Escape' && shell.dataset.drawer === 'open') { setDrawer(false); $('[data-adm-drawer]', shell)?.focus(); }
      if (event.key === 'Escape' && railOpen) { railOpen = false; applyCompact(); }
      if (event.key === '/' && !event.target.closest?.('input, textarea, [contenteditable]') && !document.querySelector('.overlay')) {
        const input = $('[data-adm-search] input', shell);
        if (input && input.offsetParent) { event.preventDefault(); input.focus(); }
      }
    };

    const form = $('[data-adm-search]', shell);
    const input = $('input', form);
    let panel = null;
    const showScopes = () => {
      const q = input.value.trim();
      if (!q) { closePopover(); panel = null; return; }
      if (!panel || !panel.isConnected) panel = openPopover(form, scopeMenu(q), { align: 'start' });
      else panel.innerHTML = scopeMenu(q);
      if (panel) panel.style.minWidth = `${form.offsetWidth}px`;
    };
    input.addEventListener('input', showScopes);
    input.addEventListener('focus', () => { if (input.value.trim()) showScopes(); });
    form.addEventListener('submit', (event) => { event.preventDefault(); const q = input.value.trim(); if (q) { closePopover(); ctx.navigate(`/admin/works?q=${encodeURIComponent(q)}`); } });

    shell.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    const id = sectionOf(ctx);
    const inner = SECTIONS[id].mount?.(root, ctx, { refreshCounts }) ?? null;
    return () => {
      inner?.();
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      closePopover();
    };
  },
};
