// 表格单元格与抽屉里共用的小片段。
import { icon } from '../../icons.js';
import { esc, avatar } from '../../ui.js';
import { patternImage } from '../../beads.js';

export const thumb = (pattern, alt = '', cls = '') => `<img class="adm-thumb ${cls}" src="${patternImage(pattern, 96)}" alt="${esc(alt)}" loading="lazy" decoding="async">`;
export const pixel = (pattern, alt = '') => `<img class="adm-pixel" src="${patternImage(pattern, 56, { mode: 'flat', pad: 0, background: 'rgba(0,0,0,0)', base: null })}" alt="${esc(alt)}">`;
export const iconTile = (name) => `<span class="adm-icon-tile" aria-hidden="true">${icon(name, 's18')}</span>`;
export const badge = ([label, tone], { dot = false, iconName = '' } = {}) => `<span class="badge ${tone} ${dot ? 'dot' : ''}">${iconName ? icon(iconName) : ''}${esc(label)}</span>`;
export const person = (someone, size = 'xs') => `<span class="adm-person">${avatar(someone, size)}<span class="ellipsis">${esc(someone.name)}</span></span>`;
export const muted = (text) => `<span class="adm-muted">${esc(text)}</span>`;
export const mono = (text) => `<span class="t-mono adm-mono">${esc(text)}</span>`;
export const num = (text) => `<span class="t-num">${esc(text)}</span>`;

/** 表格主列：缩略图 / 头像 + 可聚焦的标题按钮 + 小号副信息。 */
export function titleCell(id, title, { lead = '', sub = '', extra = '' } = {}) {
  return `<div class="adm-cellmain">${lead}<div class="adm-cell-text"><span class="adm-cell-line"><button type="button" class="adm-cell-link" data-open="${esc(id)}">${esc(title)}</button>${extra}</span>${sub ? `<span class="adm-cell-sub">${sub}</span>` : ''}</div></div>`;
}

/** 抽屉里的键值列表。 */
export function dl(items) {
  return `<dl class="adm-dl">${items.filter(Boolean).map(([key, value, wide]) => `<div class="${wide ? 'is-wide' : ''}"><dt>${esc(key)}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
}

/** 抽屉里的区块。 */
export const block = (title, content, aside = '') => `<section class="adm-dw-sec"><header><h3>${esc(title)}</h3>${aside}</header>${content}</section>`;

/** 处理记录时间线。 */
export function timeline(items) {
  if (!items.length) return '<p class="adm-muted">还没有处理记录</p>';
  return `<ol class="adm-timeline">${items.map(([when, who, what]) => `<li><span class="t-num adm-timeline-when">${esc(when)}</span><span><b>${esc(who)}</b> ${esc(what)}</span></li>`).join('')}</ol>`;
}
