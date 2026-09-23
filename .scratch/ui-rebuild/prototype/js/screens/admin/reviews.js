// 作品审核台：左侧队列（进入时自动选中第一项）、右侧图纸与作者原图并排、核对清单、决定栏；J / K / A / R 快捷键。
import { icon } from '../../icons.js';
import { $, $$, esc, avatar, toast, emptyState } from '../../ui.js';
import { patternImage } from '../../beads.js';
import { BEADS } from '../../../motifs.js';
import { reviews, REVIEW_CHECKS, fmtAgo, fmtNum } from './data.js';
import { reasonDialog } from './overlay.js';
import { thumb, badge } from './cells.js';

let current = 0;
let forcedEmpty = false;

// 作者原图的近似：同一图案先按 1 格 1 像素画出，再平滑放大、模糊，叠在柔和的背景上，像一张照片而不是像素画。
const photoCache = new Map();
function photoImage(item, size = 360) {
  const key = `${item.id}|${size}`;
  if (photoCache.has(key)) return photoCache.get(key);
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.round(size * ratio);
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  const [from, to] = item.photo.map((beadKey) => BEADS[beadKey].hex);
  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, from);
  bg.addColorStop(1, to);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  const glow = ctx.createRadialGradient(size * 0.3, size * 0.22, 0, size * 0.3, size * 0.22, size * 0.85);
  glow.addColorStop(0, 'rgba(255,255,255,0.6)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  const { width, height, keys } = item.pattern;
  const small = document.createElement('canvas');
  small.width = width;
  small.height = height;
  const sctx = small.getContext('2d');
  keys.forEach((beadKey, index) => {
    if (!beadKey) return;
    sctx.fillStyle = BEADS[beadKey].hex;
    sctx.fillRect(index % width, Math.floor(index / width), 1, 1);
  });
  const inner = size * 0.74;
  const offset = (size - inner) / 2;
  const cell = inner / width;
  ctx.save();
  ctx.filter = `blur(${(cell * 1.2).toFixed(1)}px)`;
  ctx.fillStyle = 'rgba(28,28,30,0.16)';
  ctx.beginPath();
  ctx.ellipse(size / 2, offset + inner * 0.96, inner * 0.32, inner * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.filter = `blur(${(cell * 0.6).toFixed(1)}px)`;
  ctx.drawImage(small, offset, offset, inner, inner);
  ctx.filter = `blur(${(cell * 0.22).toFixed(1)}px)`;
  ctx.globalAlpha = 0.75;
  ctx.drawImage(small, offset, offset, inner, inner);
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  const url = canvas.toDataURL('image/jpeg', 0.9);
  photoCache.set(key, url);
  return url;
}

function queueHtml() {
  return reviews.map((item, index) => `<li><button type="button" class="adm-qitem" data-q="${index}" ${index === current ? 'aria-current="true"' : ''}>
    ${thumb(item.pattern, '', 'lg')}
    <span class="adm-qitem-main">
      <span class="adm-qitem-title"><span class="ellipsis">${esc(item.title)}</span>${item.revision > 1 ? badge([`R${item.revision}`, '']) : ''}</span>
      <span class="adm-qitem-meta ellipsis">${esc(item.author.name)} · ${fmtAgo(item.submittedMin)}</span>
    </span>
  </button></li>`).join('');
}

function reviewHtml(item) {
  const done = item.checks.filter(Boolean).length;
  return `<header class="adm-rv-head">
      <div class="adm-rv-title">
        <span class="adm-rv-line"><h2 class="t-title-2">${esc(item.title)}</h2>${badge(item.revision > 1 ? [`修订 R${item.revision}`, 'info'] : ['首次提交', ''])}</span>
        <p class="adm-rv-meta"><span class="adm-inline">${avatar(item.author, 'xs')}${esc(item.author.name)}</span><span>提交于 ${fmtAgo(item.submittedMin)}</span><span class="t-num">${item.pattern.width}×${item.pattern.height} · ${item.colorCount} 色 · ${fmtNum(item.beads)} 颗</span><span class="hide-mobile">标签：${item.tags.map(esc).join('、')}</span></p>
      </div>
      <div class="adm-rv-nav">
        <span class="t-num adm-muted">${current + 1} / ${reviews.length}</span>
        <button type="button" class="icon-btn sm" data-step="-1" ${current === 0 ? 'disabled' : ''} aria-label="上一项" data-tip="上一项 K">${icon('chevron-up', 's18')}</button>
        <button type="button" class="icon-btn sm" data-step="1" ${current === reviews.length - 1 ? 'disabled' : ''} aria-label="下一项" data-tip="下一项 J">${icon('chevron-down', 's18')}</button>
      </div>
    </header>
    ${item.lastReject || item.note ? `<div class="adm-rv-note">${item.lastReject ? `<p><b>上次驳回</b>${esc(item.lastReject)}</p>` : ''}${item.note ? `<p><b>作者说明</b>${esc(item.note)}</p>` : ''}</div>` : ''}
    <div class="adm-stages">
      <figure class="adm-stage"><figcaption><b>图纸</b><span class="t-num">${item.pattern.width}×${item.pattern.height} · 豆粒预览</span></figcaption><div class="adm-stage-art"><img src="${patternImage(item.pattern, 360)}" alt="${esc(item.title)}的图纸"></div></figure>
      <figure class="adm-stage"><figcaption><b>作者原图</b><span class="t-num">1080×1080 · JPG</span></figcaption><div class="adm-stage-art is-photo"><img src="${photoImage(item)}" alt="${esc(item.title)}的作者原图"></div></figure>
    </div>
    <fieldset class="adm-checklist" data-checklist>
      <legend><span>原创与许可核对</span><span class="t-num adm-muted" data-check-count>${done} / ${REVIEW_CHECKS.length}</span></legend>
      <div class="adm-checks">${REVIEW_CHECKS.map((text, index) => `<label class="checkbox"><input type="checkbox" data-check="${index}" ${item.checks[index] ? 'checked' : ''}><span>${esc(text)}</span></label>`).join('')}</div>
      <p class="adm-check-error" data-check-error hidden>${icon('circle-alert', 's16')}<span></span></p>
    </fieldset>
    <footer class="adm-decide">
      <button type="button" class="btn btn-danger-outline" data-decide="reject">${icon('x', 's18')}驳回</button>
      <span class="adm-kbd-hint"><span class="kbd">J</span> / <span class="kbd">K</span> 切换 · <span class="kbd">A</span> 通过 · <span class="kbd">R</span> 驳回</span>
      <button type="button" class="btn btn-primary" data-decide="approve">${icon('check', 's18')}通过并发布</button>
    </footer>`;
}

export default {
  id: 'reviews',
  label: '作品审核',
  desc: '逐项核对图纸与原图，通过后公开到发现页。',
  render(ctx) {
    forcedEmpty = ctx.query.get('empty') === '1';
    const id = ctx.query.get('id');
    const index = id ? reviews.findIndex((item) => item.id === id) : 0;
    current = Math.max(0, index);
    if (forcedEmpty || !reviews.length) return '<section class="adm-card adm-review-empty" data-review-empty></section>';
    return `<div class="adm-review" data-review>
      <aside class="adm-card adm-queue" aria-label="待审队列">
        <header class="adm-card-head"><h2>待审</h2><span class="adm-muted t-num" data-queue-count>${reviews.length} 件</span><span class="grow"></span><span class="adm-muted">最早提交在后</span></header>
        <ol class="adm-queue-list" data-queue>${queueHtml()}</ol>
      </aside>
      <section class="adm-card adm-rv" data-rv aria-live="polite">${reviewHtml(reviews[current])}</section>
    </div>`;
  },
  mount(root, ctx, shell) {
    const showEmpty = () => {
      const slot = $('[data-review-empty]', root);
      slot?.append(emptyState({ kind: 'designs', title: '审核队列已清空', text: '新的投稿会出现在这里；通过后会公开到发现页。', actions: '<a class="btn btn-secondary" href="#/admin/works">查看作品管理</a>' }));
    };
    if (forcedEmpty || !reviews.length) { showEmpty(); return null; }
    const render = (focusQueue = false) => {
      if (!reviews.length) {
        $('[data-review]', root).outerHTML = '<section class="adm-card adm-review-empty" data-review-empty></section>';
        showEmpty();
        return;
      }
      current = Math.min(current, reviews.length - 1);
      $('[data-queue]', root).innerHTML = queueHtml();
      $('[data-queue-count]', root).textContent = `${reviews.length} 件`;
      $('[data-rv]', root).innerHTML = reviewHtml(reviews[current]);
      const active = $('.adm-qitem[aria-current]', root);
      active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (focusQueue) active?.focus();
    };
    const select = (index, focusQueue) => { if (index < 0 || index >= reviews.length) return; current = index; render(focusQueue); };
    const decide = (item, verdict, reason = '') => {
      const index = reviews.indexOf(item);
      reviews.splice(index, 1);
      render();
      shell.refreshCounts();
      toast(verdict === 'approve' ? `已通过并发布「${item.title}」` : `已驳回「${item.title}」，理由已发给作者`, {
        iconName: verdict === 'approve' ? 'circle-check' : 'x',
        action: { label: '撤销', onClick() { reviews.splice(index, 0, item); current = index; if ($('[data-review]', root)) { render(); } else { ctx.rerender(); } shell.refreshCounts(); } },
      });
      if (reason) item.rejectReason = reason;
    };
    const approve = () => {
      const item = reviews[current];
      const missing = item.checks.filter((on) => !on).length;
      const error = $('[data-check-error]', root);
      if (missing) {
        error.hidden = false;
        $('span', error).textContent = `还有 ${missing} 项没有核对，逐项确认后才能发布`;
        $('[data-checklist]', root).classList.add('is-invalid');
        $(`[data-check="${item.checks.indexOf(false)}"]`, root)?.focus();
        return;
      }
      decide(item, 'approve');
    };
    const reject = () => {
      const item = reviews[current];
      reasonDialog({
        title: `驳回「${item.title}」`,
        subject: '作者会收到驳回通知，可以修改后重新提交（修订号加一）。',
        label: '驳回理由',
        hint: '写清楚哪里需要改，作者会看到原文。',
        quick: ['图纸与原图主体不一致', '疑似转载他人图纸', '含联系方式或广告', '标题或标签不恰当'],
        confirm: '驳回并通知作者',
        onConfirm(reason) { decide(item, 'reject', reason); },
      });
    };
    const onClick = (event) => {
      const q = event.target.closest('[data-q]');
      if (q) { select(Number(q.dataset.q)); return; }
      const step = event.target.closest('[data-step]');
      if (step) { select(current + Number(step.dataset.step)); return; }
      const action = event.target.closest('[data-decide]')?.dataset.decide;
      if (action === 'approve') approve();
      if (action === 'reject') reject();
    };
    const onChange = (event) => {
      const box = event.target.closest('[data-check]');
      if (!box) return;
      const item = reviews[current];
      item.checks[Number(box.dataset.check)] = box.checked;
      $('[data-check-count]', root).textContent = `${item.checks.filter(Boolean).length} / ${REVIEW_CHECKS.length}`;
      if (item.checks.every(Boolean)) { $('[data-check-error]', root).hidden = true; $('[data-checklist]', root).classList.remove('is-invalid'); }
    };
    const onKey = (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target.closest?.('input:not([type="checkbox"]), textarea, select, [contenteditable]')) return;
      if (document.querySelector('.overlay') || !$('[data-review]', root)) return;
      const key = event.key.toLowerCase();
      if (key === 'j') { event.preventDefault(); select(current + 1, true); }
      if (key === 'k') { event.preventDefault(); select(current - 1, true); }
      if (key === 'a') { event.preventDefault(); approve(); }
      if (key === 'r') { event.preventDefault(); reject(); }
    };
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    document.addEventListener('keydown', onKey);
    return () => { root.removeEventListener('click', onClick); root.removeEventListener('change', onChange); document.removeEventListener('keydown', onKey); };
  },
};
