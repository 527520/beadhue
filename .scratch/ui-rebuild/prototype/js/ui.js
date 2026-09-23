// 原型通用 UI：弹窗 / 底部面板、弹出层、提示、作品卡、头像、空状态插画。
import { icon } from './icons.js';
import { patternImage, patternCanvas } from './beads.js';

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
export const isMobile = () => window.matchMedia('(max-width: 767px)').matches;
export const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function el(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

export function formatCount(value) {
  return value >= 10000 ? `${(value / 10000).toFixed(1)}万` : value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

export function avatar(person, size = '') {
  return `<span class="avatar ${size}" style="--av:${person.color}" aria-hidden="true">${esc(person.name.slice(0, 1))}</span>`;
}

// ---------- 点赞状态（原型内存） ----------
const liked = new Set(['w-icecream', 'w-star']);
export function isLiked(id) { return liked.has(id); }
export function toggleLike(id) { if (liked.has(id)) liked.delete(id); else liked.add(id); return liked.has(id); }

export function likeButton(work, cls = 'on-image') {
  const on = isLiked(work.id);
  return `<button class="icon-btn like-btn ${cls}" data-like="${work.id}" aria-pressed="${on}" aria-label="喜欢「${esc(work.title)}」">${icon('heart')}</button>`;
}

export function beadDots(usage, max = 6) {
  return `<span class="bead-dots" aria-hidden="true">${usage.slice(0, max).map((color) => `<i style="background:${color.hex}"></i>`).join('')}</span>`;
}

export function workCard(work, { size = 320 } = {}) {
  const badge = work.featured ? `<span class="badge featured">${icon('star', 'fill')}精选</span>` : work.official ? '<span class="badge on-image">官方</span>' : '';
  return `
  <article class="work-card">
    <div class="media">
      <img src="${patternImage(work.pattern, size)}" alt="${esc(work.title)}，${work.pattern.width}×${work.pattern.height} 拼豆图纸" loading="lazy" decoding="async">
      ${badge ? `<div class="badges">${badge}</div>` : ''}
      ${likeButton(work)}
    </div>
    <div class="body">
      <h3 class="title ellipsis">${esc(work.title)}</h3>
      <p class="meta"><span class="ellipsis">${esc(work.author.name)}</span><span class="size sep"></span><span class="size t-num">${work.pattern.width}×${work.pattern.height}</span><span class="sep"></span><span class="t-num">${work.colorCount} 色</span>${beadDots(work.usage)}</p>
    </div>
    <a class="stretched" href="#/works/${work.id}" aria-label="查看「${esc(work.title)}」"></a>
  </article>`;
}

export function skeletonCards(count = 10) {
  return Array.from({ length: count }, () => `<div class="work-card" aria-hidden="true"><div class="media skeleton"></div><div class="body"><div class="skeleton" style="height:16px;width:70%"></div><div class="skeleton" style="height:12px;width:50%;margin-top:6px"></div></div></div>`).join('');
}

// ---------- 空状态插画：空钉板上散落几颗豆 ----------
const ART = {
  search: { width: 9, height: 9, keys: '.........|..KKK....|.K...K...|.K...K...|.K...K...|..KKKK...|......K..|.......K.|.........' },
  designs: { width: 9, height: 9, keys: '.........|.........|...R.....|..RRR....|...R..Y..|.......Y.|..B......|.BBB..G..|..B......' },
  comments: { width: 9, height: 9, keys: '.........|.BBBBBBB.|.B.....B.|.B.Y.Y.B.|.B.....B.|.BBBBBBB.|..BB.....|..B......|.........' },
  likes: { width: 9, height: 9, keys: '.........|..RR.RR..|.RRRRRRR.|.RRRRRRR.|..RRRRR..|...RRR...|....R....|.........|.........' },
  empty: { width: 9, height: 9, keys: '.........|.........|.........|...Y.....|.........|.....R...|..B......|.........|.........' },
};
export function emptyArt(kind = 'empty', size = 120) {
  const spec = ART[kind] ?? ART.empty;
  const keys = spec.keys.split('|').join('').split('').map((c) => (c === '.' ? null : c));
  return patternCanvas({ id: `art-${kind}`, width: spec.width, height: spec.height, keys }, size, { pad: 0.04, background: 'rgba(0,0,0,0)' });
}
export function emptyState({ kind = 'empty', title, text, actions = '', compact = false }) {
  const node = el(`<div class="empty ${compact ? 'compact' : ''}"><div class="art"></div><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${actions ? `<div class="actions">${actions}</div>` : ''}</div>`);
  const art = emptyArt(kind, compact ? 72 : 120);
  art.style.width = '100%';
  art.style.height = '100%';
  node.querySelector('.art').append(art);
  return node;
}

// ---------- 提示 ----------
export function toast(message, { iconName = 'circle-check', action = null } = {}) {
  let region = $('.toast-region');
  if (!region) { region = el('<div class="toast-region" role="status" aria-live="polite"></div>'); document.body.append(region); }
  const node = el(`<div class="toast">${icon(iconName)}<span>${esc(message)}</span>${action ? `<button class="btn btn-sm">${esc(action.label)}</button>` : ''}</div>`);
  if (action) node.querySelector('button').addEventListener('click', () => { action.onClick?.(); node.remove(); });
  region.append(node);
  setTimeout(() => node.remove(), 3600);
}

// ---------- 弹窗（手机自动变底部面板） ----------
let openDialogs = [];
let lastPopoverAnchor = null;
export function openDialog({ title, body, foot = '', size = '', label = title, onMount, onClose }) {
  // 从弹出菜单里打开时，触发项会随菜单一起移除；关闭后把焦点还给菜单的触发按钮。
  const active = document.activeElement;
  const previous = active && active !== document.body && !active.closest('.popover') ? active : lastPopoverAnchor;
  const overlay = el(`<div class="overlay" role="presentation"><div class="dialog ${size}" role="dialog" aria-modal="true" aria-label="${esc(label)}"><div class="sheet-handle" aria-hidden="true"></div><header class="dialog-head"><h2>${esc(title)}</h2><button class="icon-btn sm" data-close aria-label="关闭">${icon('x')}</button></header><div class="dialog-body"></div>${foot ? `<footer class="dialog-foot">${foot}</footer>` : ''}</div></div>`);
  const bodyNode = overlay.querySelector('.dialog-body');
  if (typeof body === 'string') bodyNode.innerHTML = body; else bodyNode.append(body);
  const close = () => {
    overlay.remove();
    openDialogs = openDialogs.filter((item) => item !== close);
    document.documentElement.style.overflow = openDialogs.length ? 'hidden' : '';
    onClose?.();
    if (previous?.isConnected) previous.focus();
  };
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target.closest('[data-close]')) close();
  });
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); }
    if (event.key === 'Tab') {
      const focusable = $$('button:not(:disabled), [href], input:not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])', overlay);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  document.body.append(overlay);
  document.documentElement.style.overflow = 'hidden';
  openDialogs.push(close);
  onMount?.(overlay.querySelector('.dialog'), close);
  requestAnimationFrame(() => (overlay.querySelector('[autofocus]') ?? overlay.querySelector('.dialog-body input, .dialog-body button') ?? overlay.querySelector('[data-close]'))?.focus());
  return close;
}

// ---------- 弹出层（桌面锚定；手机转为底部面板） ----------
let activePopover = null;
export function closePopover() {
  if (!activePopover) return;
  activePopover.node.remove();
  activePopover.anchor?.setAttribute('aria-expanded', 'false');
  document.removeEventListener('pointerdown', activePopover.outside, true);
  document.removeEventListener('keydown', activePopover.keys, true);
  activePopover = null;
}
export function openPopover(anchor, html, { align = 'end', wide = false, sheetTitle = '', onMount } = {}) {
  if (activePopover?.anchor === anchor) { closePopover(); return null; }
  closePopover();
  if (isMobile() && sheetTitle) {
    const wrapper = el(`<div>${html}</div>`);
    openDialog({ title: sheetTitle, body: wrapper, onMount: (dialog, close) => onMount?.(dialog, close) });
    return null;
  }
  const node = el(`<div class="popover ${wide ? 'wide' : ''}" role="dialog">${html}</div>`);
  document.body.append(node);
  const rect = anchor.getBoundingClientRect();
  const width = node.offsetWidth;
  let left = align === 'end' ? rect.right - width : align === 'center' ? rect.left + rect.width / 2 - width / 2 : rect.left;
  left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
  let top = rect.bottom + 8;
  if (top + node.offsetHeight > window.innerHeight - 12) top = Math.max(12, rect.top - node.offsetHeight - 8);
  node.style.left = `${left}px`;
  node.style.top = `${top}px`;
  node.style.setProperty('--origin', align === 'end' ? 'top right' : 'top left');
  anchor.setAttribute('aria-expanded', 'true');
  lastPopoverAnchor = anchor;
  const outside = (event) => { if (!node.contains(event.target) && !anchor.contains(event.target)) closePopover(); };
  const keys = (event) => { if (event.key === 'Escape') { closePopover(); anchor.focus(); } };
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('keydown', keys, true);
  activePopover = { node, anchor, outside, keys };
  onMount?.(node, closePopover);
  return node;
}
window.addEventListener('hashchange', closePopover);
window.addEventListener('resize', closePopover);
