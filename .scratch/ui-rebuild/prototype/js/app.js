// 原型入口：哈希路由 + 站点外壳。页面模块见 js/screens/*.js，约定见 README.md。
import { loadIcons, icon } from './icons.js';
import { $, $$, el, esc, avatar, openPopover, closePopover, toggleLike, toast, isMobile, openDialog } from './ui.js';
import { WORKS, AUTHORS, HOT_SEARCHES, ME } from './data.js';
import { patternImage } from './beads.js';

const params = new URLSearchParams(location.search);
export const session = {
  get loggedIn() { return (sessionStorage.getItem('proto-guest') ?? (params.get('guest') === '1' ? '1' : '0')) !== '1'; },
  set loggedIn(value) { sessionStorage.setItem('proto-guest', value ? '0' : '1'); },
  user: ME,
  isAdmin: true,
};

const ROUTES = [
  [/^\/?$/, 'discover'],
  [/^\/search$/, 'discover'],
  [/^\/works\/([\w-]+)$/, 'detail'],
  [/^\/create$/, 'create'],
  [/^\/editor\/([\w-]+)$/, 'editor'],
  [/^\/me(?:\/(\w+))?$/, 'me'],
  [/^\/u\/([\w-]+)$/, 'me'],
  [/^\/admin(?:\/(\w+))?$/, 'admin'],
  [/^\/components$/, 'components'],
];

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, search = ''] = raw.split('?');
  return { path, query: new URLSearchParams(search) };
}

export function navigate(hash) {
  location.hash = hash;
}

const recent = JSON.parse(localStorage.getItem('proto-recent') ?? '["猫咪","樱花杯垫"]');
function remember(query) {
  const next = [query, ...recent.filter((item) => item !== query)].slice(0, 6);
  recent.splice(0, recent.length, ...next);
  localStorage.setItem('proto-recent', JSON.stringify(next));
}

function brand() {
  return `<a class="brand" href="#/" aria-label="豆色绘 BeadHue 首页"><span class="brand-mark" aria-hidden="true"><i style="--c:#e0473f"></i><i style="--c:#ffd447"></i><i style="--c:#3f7fd9"></i><i style="--c:#47a35b"></i></span><span class="brand-word"><b>豆色绘</b><small>BeadHue</small></span></a>`;
}

function searchField(value = '') {
  return `<form class="search compact ${value ? 'has-value' : ''}" role="search" data-search>
    ${icon('search', 's18')}
    <input type="search" name="q" value="${esc(value)}" placeholder="搜索图纸、标签或作者" aria-label="搜索图纸、标签或作者" autocomplete="off">
    <button type="button" class="icon-btn sm clear" data-clear aria-label="清除">${icon('x', 's16')}</button>
    <span class="kbd kbd-hint hide-mobile" aria-hidden="true">/</span>
  </form>`;
}

function topbar(screen, ctx) {
  const current = screen.nav;
  const link = (id, href, label) => `<a href="${href}" ${current === id ? 'aria-current="page"' : ''}>${label}</a>`;
  const account = session.loggedIn
    ? `<button class="avatar-btn" data-account aria-haspopup="menu" aria-expanded="false" aria-label="账号菜单">${icon('menu', 's18')}${avatar(session.user, 'sm')}</button>`
    : '<button class="btn btn-outline" data-login>登录</button>';
  // 每个视区只允许一个主按钮：页面自带主操作时（详情「用这张制作」、我的「新建」）把顶栏按钮降为次按钮，创作页直接不显示。
  const cta = screen.topbarCta ?? 'primary';
  const upload = cta === false ? '' : `<a class="btn ${cta === 'secondary' ? 'btn-outline' : 'btn-primary'} upload-btn" href="#/create" aria-label="上传图片" data-tip="上传图片">${icon('upload')}<span class="label">上传图片</span></a>`;
  return `<header class="topbar"><div class="container wide topbar-inner">
    ${brand()}
    <nav class="nav" aria-label="主导航">${link('discover', '#/', '发现')}${link('create', '#/create', '创作')}${link('me', '#/me', '我的')}</nav>
    <div class="topbar-search">${searchField(ctx.query.get('q') ?? '')}</div>
    <div class="topbar-actions">
      ${upload}
      ${account}
    </div>
  </div></header>`;
}

function mobileTop(screen, ctx) {
  if (screen.mobileTop) return `<div class="m-topbar">${screen.mobileTop(ctx)}</div>`;
  return `<div class="m-topbar">${brand()}<span class="grow"></span><a class="icon-btn" href="#/search" aria-label="搜索">${icon('search')}</a>${session.loggedIn ? `<a class="icon-btn" href="#/me" aria-label="我的">${avatar(session.user, 'sm')}</a>` : '<button class="btn btn-sm btn-outline" data-login>登录</button>'}</div>`;
}

function tabbar(screen) {
  const current = screen.nav;
  return `<nav class="tabbar" aria-label="主导航">
    <a href="#/" ${current === 'discover' ? 'aria-current="page"' : ''}>${icon('compass')}发现</a>
    <a class="create" href="#/create" aria-label="创作">${icon('plus')}</a>
    <a href="#/me" ${current === 'me' ? 'aria-current="page"' : ''}>${icon('user')}我的</a>
  </nav>`;
}

function footer() {
  return `<footer class="footer"><div class="container wide footer-inner">
    ${brand()}<span>免费、开源、无广告的拼豆图纸工具</span>
    <nav aria-label="页脚"><a href="#/">使用帮助</a><a href="#/">隐私说明</a><a href="#/">社区规范</a><a href="#/">关于</a><a href="#/">源码</a></nav>
  </div></footer>`;
}

function consent() {
  if (sessionStorage.getItem('proto-consent')) return '';
  return `<aside class="consent" aria-label="匿名使用统计">
    <h3>帮助我们改进豆色绘？</h3>
    <p>只统计功能使用次数和设备类型，不记录图片、图纸内容或搜索词。随时可在隐私设置里撤回。</p>
    <div class="actions"><button class="btn btn-sm btn-secondary" data-consent="no">不同意</button><button class="btn btn-sm btn-secondary" data-consent="yes">同意统计</button></div>
  </aside>`;
}

function protoTool() {
  const accent = document.documentElement.dataset.accent ?? 'blue';
  const swatch = (id, color, label) => `<button data-accent-set="${id}" style="background:${color}" aria-pressed="${accent === id}" aria-label="主色：${label}"></button>`;
  return `<div class="proto-tool" aria-label="原型评审工具">主色 ${swatch('blue', '#3160e6', '豆蓝')}${swatch('ink', '#1c1c1e', '墨黑')}${swatch('tomato', '#cf3f29', '番茄')}<span style="width:1px;height:16px;background:var(--line);margin:0 4px"></span><button class="btn btn-sm btn-ghost" style="height:24px;padding:0 8px;width:auto;box-shadow:none" data-toggle-guest>${session.loggedIn ? '切到未登录' : '切到已登录'}</button></div>`;
}

// ---------- 搜索建议面板 ----------
function suggestionPanel(query) {
  const q = query.trim();
  if (!q) {
    return `<div class="stack" style="gap:16px;padding:8px">
      ${recent.length ? `<section><div class="row" style="justify-content:space-between"><span class="menu-label" style="padding:0">最近搜索</span><button class="btn btn-sm btn-ghost" data-clear-recent>清空</button></div><div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px">${recent.map((item) => `<a class="chip outline" href="#/search?q=${encodeURIComponent(item)}">${icon('history', 's16')}${esc(item)}</a>`).join('')}</div></section>` : ''}
      <section><span class="menu-label" style="padding:0">大家在搜</span><div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px">${HOT_SEARCHES.map((item) => `<a class="chip" href="#/search?q=${encodeURIComponent(item)}">${esc(item)}</a>`).join('')}</div></section>
    </div>`;
  }
  const works = WORKS.filter((work) => work.title.includes(q) || work.tags.some((tag) => tag.includes(q))).slice(0, 5);
  const authors = Object.values(AUTHORS).filter((author) => author.name.includes(q)).slice(0, 3);
  return `<div class="stack" style="gap:4px">
    <a class="menu-item" href="#/search?q=${encodeURIComponent(q)}">${icon('search')}<span>搜索「<b style="color:var(--ink)">${esc(q)}</b>」</span><span class="trail">回车</span></a>
    ${works.length ? `<div class="menu-sep"></div><div class="menu-label">图纸</div>${works.map((work) => `<a class="menu-item" href="#/works/${work.id}"><img src="${patternImage(work.pattern, 64)}" alt="" style="width:32px;height:32px;border-radius:8px;background:var(--bg-subtle)"><span class="grow ellipsis">${esc(work.title)}</span><span class="trail t-num">${work.pattern.width}×${work.pattern.height}</span></a>`).join('')}` : ''}
    ${authors.length ? `<div class="menu-sep"></div><div class="menu-label">作者</div>${authors.map((author) => `<a class="menu-item" href="#/u/${author.id}">${avatar(author, 'sm')}<span>${esc(author.name)}</span></a>`).join('')}` : ''}
    ${!works.length && !authors.length ? '<p class="t-body-sm t-muted" style="padding:8px 10px">没有匹配的图纸或作者，回车搜索全部内容。</p>' : ''}
  </div>`;
}

function bindSearch(root) {
  const form = $('[data-search]', root);
  if (!form) return;
  const input = $('input', form);
  let panel = null;
  const refresh = () => {
    form.classList.toggle('has-value', Boolean(input.value));
    if (panel) panel.innerHTML = suggestionPanel(input.value);
  };
  input.addEventListener('focus', () => {
    panel = openPopover(form, suggestionPanel(input.value), { align: 'start', wide: true });
    if (panel) { panel.style.width = `${Math.max(form.offsetWidth, 440)}px`; }
  });
  input.addEventListener('input', () => { if (!panel || !panel.isConnected) panel = openPopover(form, '', { align: 'start', wide: true }); refresh(); });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = input.value.trim();
    closePopover();
    if (value) { remember(value); navigate(`/search?q=${encodeURIComponent(value)}`); }
  });
  $('[data-clear]', form).addEventListener('click', () => { input.value = ''; refresh(); input.focus(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) { event.preventDefault(); input.focus(); }
  });
}

function accountMenu(anchor) {
  const used = session.user.storageUsed;
  const total = session.user.storageTotal;
  openPopover(anchor, `
    <div class="row" style="gap:12px;padding:10px 10px 12px">${avatar(session.user, 'lg')}<div class="grow"><div class="t-title-3">${esc(session.user.name)}</div><div class="t-caption t-muted" style="font-weight:400">${esc(session.user.email)}</div></div></div>
    <div style="padding:0 10px 12px"><div class="row t-caption t-muted" style="justify-content:space-between;font-weight:400"><span>原图空间</span><span class="t-num">${used} / ${total} GB</span></div><div class="progress" style="margin-top:6px"><i style="width:${(used / total) * 100}%"></i></div></div>
    <div class="menu-sep"></div>
    <a class="menu-item" href="#/me">${icon('user')}我的主页</a>
    <a class="menu-item" href="#/me/designs">${icon('folder')}我的设计</a>
    <a class="menu-item" href="#/me/palettes">${icon('palette')}色板</a>
    <a class="menu-item" href="#/me/settings">${icon('settings')}账号设置</a>
    <div class="menu-sep"></div>
    <a class="menu-item" href="#/">${icon('circle-help')}帮助中心</a>
    <a class="menu-item" href="#/">${icon('lock')}隐私与数据</a>
    ${session.isAdmin ? `<div class="menu-sep"></div><a class="menu-item" href="#/admin">${icon('shield-check')}管理后台</a>` : ''}
    <div class="menu-sep"></div>
    <button class="menu-item" data-logout>${icon('log-out')}退出登录</button>`, { align: 'end' });
}

function loginDialog() {
  openDialog({
    title: '登录豆色绘',
    size: '',
    body: `<form class="stack" style="gap:16px" data-login-form novalidate>
      <p class="t-body-sm t-muted">不登录也能在本机创作。登录后设计与原图会同步到你的私人空间。</p>
      <div class="field" data-field="email"><label for="login-email">邮箱</label><input class="input" id="login-email" type="email" autocomplete="email" placeholder="you@example.com" autofocus><span class="error" hidden>${icon('circle-alert', 's16')}<span>请输入正确的邮箱地址</span></span></div>
      <div class="field" data-field="password"><div class="row" style="justify-content:space-between"><label for="login-password">密码</label><a class="t-link t-body-sm" href="#/">忘记密码？</a></div><input class="input" id="login-password" type="password" autocomplete="current-password"><span class="error" hidden>${icon('circle-alert', 's16')}<span>请输入密码</span></span></div>
      <button class="btn btn-primary btn-lg btn-block" type="submit">登录</button>
      <p class="t-body-sm t-muted" style="text-align:center">还没有账号？<a class="t-link" href="#/">注册</a></p>
    </form>`,
    onMount(dialog, close) {
      $('[data-login-form]', dialog).addEventListener('submit', (event) => {
        event.preventDefault();
        const email = $('#login-email', dialog);
        const password = $('#login-password', dialog);
        const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value);
        const passwordOk = password.value.length > 0;
        [['email', emailOk], ['password', passwordOk]].forEach(([name, ok]) => {
          const field = $(`[data-field="${name}"]`, dialog);
          field.classList.toggle('is-invalid', !ok);
          $('.error', field).hidden = ok;
        });
        if (!emailOk) { email.focus(); return; }
        if (!passwordOk) { password.focus(); return; }
        session.loggedIn = true; close(); render(); toast('已登录');
      });
    },
  });
}

// ---------- 渲染 ----------
const app = () => $('#app');
let cleanup = null;
const modules = {};

async function loadScreen(name) {
  if (!modules[name]) modules[name] = (await import(`./screens/${name}.js`)).default;
  return modules[name];
}

export async function render() {
  const { path, query } = parseHash();
  const match = ROUTES.map(([pattern, name]) => [path.match(pattern), name]).find(([m]) => m);
  const [found, name] = match ?? [[], 'discover'];
  const screen = await loadScreen(name);
  const ctx = { path, query, params: found.slice(1), session, navigate, rerender: render, loginDialog };
  cleanup?.();
  closePopover();
  document.title = `${typeof screen.title === 'function' ? screen.title(ctx) : screen.title ?? ''} · 豆色绘`;
  const root = app();
  const site = screen.shell !== 'bare';
  document.body.classList.toggle('has-tabbar', site && screen.tabbar !== false);
  root.innerHTML = site
    ? `${topbar(screen, ctx)}${mobileTop(screen, ctx)}<main class="page" id="main">${screen.render(ctx)}</main>${screen.footer === false ? '' : footer()}${screen.tabbar === false ? '' : tabbar(screen)}${consent()}${protoTool()}`
    : `${screen.render(ctx)}${protoTool()}`;
  bindSearch(root);
  cleanup = screen.mount?.(root, ctx) ?? null;
  if (!location.hash.includes('#top-keep')) window.scrollTo(0, 0);
}

function bindGlobal() {
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-skip]')) {
      event.preventDefault();
      const main = document.getElementById('main') ?? document.querySelector('main, [role="main"]');
      if (main) { main.setAttribute('tabindex', '-1'); main.focus(); }
      return;
    }
    const like = event.target.closest('[data-like]');
    if (like) {
      event.preventDefault();
      if (!session.loggedIn) { loginDialog(); return; }
      const on = toggleLike(like.dataset.like);
      $$(`[data-like="${like.dataset.like}"]`).forEach((node) => {
        node.setAttribute('aria-pressed', String(on));
        const count = node.querySelector('.like-count');
        if (count) count.textContent = String(Number(count.textContent) + (on ? 1 : -1));
      });
      toast(on ? '已加入「我的 · 喜欢」' : '已取消喜欢', { iconName: on ? 'heart' : 'circle-check' });
      return;
    }
    if (event.target.closest('[data-account]')) { accountMenu(event.target.closest('[data-account]')); return; }
    if (event.target.closest('[data-login]')) { loginDialog(); return; }
    if (event.target.closest('[data-logout]')) { closePopover(); session.loggedIn = false; render(); toast('已退出登录'); return; }
    if (event.target.closest('[data-clear-recent]')) { recent.splice(0); localStorage.setItem('proto-recent', '[]'); closePopover(); return; }
    const consentButton = event.target.closest('[data-consent]');
    if (consentButton) { sessionStorage.setItem('proto-consent', consentButton.dataset.consent); consentButton.closest('.consent').remove(); toast('偏好已保存'); return; }
    const accent = event.target.closest('[data-accent-set]');
    if (accent) {
      document.documentElement.dataset.accent = accent.dataset.accentSet;
      localStorage.setItem('proto-accent', accent.dataset.accentSet);
      $$('[data-accent-set]').forEach((node) => node.setAttribute('aria-pressed', String(node === accent)));
      return;
    }
    if (event.target.closest('[data-toggle-guest]')) { session.loggedIn = !session.loggedIn; render(); }
  });
  const onScroll = () => {
    const scrolled = window.scrollY > 4;
    $$('.topbar, .m-topbar').forEach((node) => node.classList.toggle('is-scrolled', scrolled));
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'proto-accent') { document.documentElement.dataset.accent = event.data.value; }
    if (event.data?.type === 'proto-guest') { session.loggedIn = !event.data.value; render(); }
    if (event.data?.type === 'proto-click') {
      (async () => {
        for (const selector of event.data.selectors ?? []) {
          await new Promise((done) => setTimeout(done, 450));
          document.querySelector(selector)?.click();
        }
      })();
    }
  });
}

document.documentElement.dataset.accent = params.get('accent') ?? localStorage.getItem('proto-accent') ?? 'blue';
if (window.self !== window.top) document.documentElement.classList.add('in-review');
await loadIcons();
bindGlobal();
window.addEventListener('hashchange', render);
await render();
