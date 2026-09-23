// 原图参照：单向跟随画布的同一范围（画布变 → 参照变；拖动参照窗不影响画布）。
// 图纸旋转 / 镜像后按同一变换绘制原图，对应关系依然可靠；没有可靠原图时只给提示，不猜。
import { icon } from '../../icons.js';
import { sourceImage } from './source.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** 由图纸的旋转 / 镜像记录推出「原图裁剪区归一化坐标 → 图纸归一化坐标」的仿射变换。 */
function orientation(ops) {
  let a = [[1, 0], [0, 1]];
  let t = [0, 0];
  const R = { rotate: [[0, -1], [1, 0], [1, 0]], 'mirror-h': [[-1, 0], [0, 1], [1, 0]], 'mirror-v': [[1, 0], [0, -1], [0, 1]] };
  for (const op of ops) {
    const [r0, r1, shift] = R[op];
    const m = [r0, r1];
    a = [[m[0][0] * a[0][0] + m[0][1] * a[1][0], m[0][0] * a[0][1] + m[0][1] * a[1][1]], [m[1][0] * a[0][0] + m[1][1] * a[1][0], m[1][0] * a[0][1] + m[1][1] * a[1][1]]];
    t = [m[0][0] * t[0] + m[0][1] * t[1] + shift[0], m[1][0] * t[0] + m[1][1] * t[1] + shift[1]];
  }
  return { a, t };
}

/** 在参照画布上画出与主画布同一范围的原图（等比包含），并用虚线框标出主画布的可见区。 */
export function paintReference(canvas, S, view, colors) {
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  if (!W || !H || !view.w || !S.source) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = colors.subtle;
  g.fillRect(0, 0, W, H);
  const s = Math.min(W / view.w, H / view.h);
  const tx = (x) => W / 2 + (x - view.w / 2) * s;
  const ty = (y) => H / 2 + (y - view.h / 2) * s;
  const p = S.pattern;
  const px = tx(view.ox);
  const py = ty(view.oy);
  const pw = p.width * view.cell * s;
  const ph = p.height * view.cell * s;
  const src = sourceImage(S.source, 520);
  const { a, t } = orientation(S.ops);
  const { x: cx, y: cy, w: cw, h: ch } = src.crop;
  const A = pw * a[0][0] / cw;
  const C = pw * a[0][1] / ch;
  const E = px + pw * t[0] - A * cx - C * cy;
  const B = ph * a[1][0] / cw;
  const D = ph * a[1][1] / ch;
  const F = py + ph * t[1] - B * cx - D * cy;
  g.save();
  g.setTransform(dpr * A, dpr * B, dpr * C, dpr * D, dpr * E, dpr * F);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src.image, 0, 0, src.iw, src.ih);
  g.restore();
  g.fillStyle = colors.subtle;
  g.globalAlpha = 0.7;
  g.beginPath();
  g.rect(0, 0, W, H);
  g.rect(px, py, pw, ph);
  g.fill('evenodd');
  g.globalAlpha = 1;
  g.strokeStyle = colors.accent;
  g.lineWidth = 1.5;
  g.setLineDash([5, 4]);
  g.strokeRect(tx(0) + 1, ty(0) + 1, view.w * s - 2, view.h * s - 2);
  g.setLineDash([]);
}

/** 画布右上角的原图胶囊：正常为缩略图 +「原图」；没有可靠原图时为警告样式。 */
export function referencePill(S, thumbURL) {
  if (!S.source) {
    if (S.noSourceReason === 'blank') return `<button class="ed-ref-pill" data-act="ref-missing" aria-haspopup="dialog">${icon('image-plus', 's16')}<span>添加原图</span></button>`;
    return `<button class="ed-ref-pill is-warning" data-act="ref-missing" aria-haspopup="dialog">${icon('triangle-alert', 's16')}<span>原图未对齐 · 重新选择</span></button>`;
  }
  return `<button class="ed-ref-pill" data-act="ref-open" aria-expanded="${S.ref.open}" aria-label="打开原图参照">${thumbURL ? `<img src="${thumbURL}" alt="">` : icon('image', 's16')}<span>原图</span></button>`;
}

export const MISSING_TEXT = {
  local: '本机没有找到这张设计的原图，所以不知道图纸的每一格对应原图的哪里。',
  reuse: '这张图纸是从豆社引用的，引用时没有带上可以逐格对应的原图。',
  blank: '空白画布还没有原图。添加一张后，可以在参照窗里对照着画。',
};

export function referenceWindow(S) {
  const collapsed = S.ref.collapsed;
  return `<section class="ed-ref-win ${collapsed ? 'is-collapsed' : ''}" data-ref-win role="dialog" aria-label="原图参照">
    <header class="ed-ref-head" data-ref-drag>
      ${icon('grip-vertical', 's16')}
      <b class="grow ellipsis">原图 · 跟随画布</b>
      <button class="icon-btn sm" data-act="ref-collapse" aria-label="${collapsed ? '展开' : '折叠'}" data-tip="${collapsed ? '展开' : '折叠'}">${icon(collapsed ? 'chevron-down' : 'chevron-up', 's18')}</button>
      <button class="icon-btn sm" data-act="ref-close" aria-label="关闭原图参照" data-tip="关闭" data-tip-align="end">${icon('x', 's18')}</button>
    </header>
    <div class="ed-ref-body"><canvas data-ref-canvas aria-label="与画布同一范围的原图"></canvas><span class="ed-ref-resize" data-ref-resize aria-hidden="true"></span></div>
  </section>`;
}

/** 让浮窗可拖动标题栏移动、拖右下角改变大小；位置与尺寸限制在画布区内。 */
export function bindReferenceWindow(win, wrap, S, onChange) {
  const bounds = () => wrap.getBoundingClientRect();
  function place() {
    const box = bounds();
    const w = clamp(S.ref.w, 220, Math.max(220, Math.min(560, box.width - 24)));
    const h = clamp(S.ref.h, 160, Math.max(160, Math.min(520, box.height - 24)));
    S.ref.w = w;
    S.ref.h = h;
    if (S.ref.x === null) S.ref.x = box.width - w - 16;
    if (S.ref.y === null) S.ref.y = 16;
    S.ref.x = clamp(S.ref.x, 8, Math.max(8, box.width - w - 8));
    S.ref.y = clamp(S.ref.y, 8, Math.max(8, box.height - (S.ref.collapsed ? 48 : h) - 8));
    win.style.left = `${S.ref.x}px`;
    win.style.top = `${S.ref.y}px`;
    win.style.width = `${w}px`;
    win.style.height = S.ref.collapsed ? '' : `${h}px`;
  }
  function track(event, apply) {
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY, rx: S.ref.x, ry: S.ref.y, rw: S.ref.w, rh: S.ref.h };
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (e) => { apply(e.clientX - start.x, e.clientY - start.y, start); place(); onChange(); };
    const up = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up); win.classList.remove('is-moving'); };
    win.classList.add('is-moving');
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  }
  win.querySelector('[data-ref-drag]').addEventListener('pointerdown', (event) => {
    if (event.target.closest('button')) return;
    track(event, (dx, dy, start) => { S.ref.x = start.rx + dx; S.ref.y = start.ry + dy; });
  });
  win.querySelector('[data-ref-resize]').addEventListener('pointerdown', (event) => {
    track(event, (dx, dy, start) => { S.ref.w = start.rw + dx; S.ref.h = start.rh + dy; });
  });
  place();
  return place;
}

/** 缩略图：原图裁剪区（与图纸对应的部分）。 */
export function referenceThumb(S, size = 28) {
  if (!S.source) return '';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.round(size * dpr);
  const g = canvas.getContext('2d');
  const src = sourceImage(S.source, 160);
  const { x, y, w, h } = src.crop;
  const side = Math.max(w, h);
  g.imageSmoothingQuality = 'high';
  g.drawImage(src.image, x + w / 2 - side / 2, y + h / 2 - side / 2, side, side, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}
