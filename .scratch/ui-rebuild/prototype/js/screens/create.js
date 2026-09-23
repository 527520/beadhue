// 创作入口：落区 + 两个次入口 + 示例 + 最近的设计。选图后「新建图纸」弹窗一次设好裁剪、尺寸、颜色与色板。
// 查询参数：drag=1 强制显示拖入态；pick=w-cat 直接打开示例的新建弹窗；blank=1 打开空白画布弹窗。
import { icon } from '../icons.js';
import { $, $$, esc, toast, openDialog, openPopover } from '../ui.js';
import { WORKS, DESIGNS } from '../data.js';
import { patternImage, patternCanvas } from '../beads.js';
import * as cat from './editor/catalog.js';
import { illustrationURL, generate, stashPhoto } from './editor/source.js';

const SAMPLES = ['w-cat', 'w-strawberry', 'w-rainbow', 'w-frog'].map((id) => WORKS.find((work) => work.id === id));
const STATUS = { draft: '', stitching: '跟拼中', published: '已公开' };
const MAX_BYTES = 20 * 1024 * 1024;
const ART = 1000;

function recentCard(design) {
  const status = design.status === 'stitching' ? `跟拼中 ${design.progress}%` : STATUS[design.status];
  return `<a class="cr-recent-card" href="#/editor/${design.id}">
    <img src="${patternImage(design.pattern, 112)}" alt="" loading="lazy">
    <span class="grow"><span class="cr-recent-name ellipsis">${esc(design.name)}</span><span class="cr-recent-meta ellipsis t-num">${[status, `${design.size}×${design.size}`, design.updated].filter(Boolean).join(' · ')}</span></span>
  </a>`;
}

/** 选择按钮与弹出层：色板 / 规格，弹窗与编辑器同一套。 */
function bindPickers(dialog, state, onChange) {
  dialog.addEventListener('click', (event) => {
    const button = event.target.closest('[data-cr-pick]');
    if (!button) return;
    const kind = button.dataset.crPick;
    const html = kind === 'palette' ? cat.paletteMenu(state.palette) : cat.specMenu(state.spec, state.palette);
    openPopover(button, html, {
      align: 'start',
      sheetTitle: kind === 'palette' ? '选择色板' : '制作规格',
      onMount(node, close) {
        cat.liftPopover(node);
        node.addEventListener('click', (e) => {
          const item = e.target.closest('[data-pick-palette], [data-pick-spec]');
          if (!item || item.disabled) return;
          close();
          if (item.dataset.pickPalette) {
            state.palette = item.dataset.pickPalette;
            const spec = cat.fitSpec(state.palette, state.spec);
            state.specNote = spec !== state.spec ? `${cat.paletteById(state.palette).name} 只支持 ${cat.paletteSizes(cat.paletteById(state.palette))}，已改为 ${cat.specById(spec).label}` : '';
            state.spec = spec;
          } else { state.spec = item.dataset.pickSpec; state.specNote = ''; }
          onChange();
        });
      },
    });
  });
}
function pickersHTML(state) {
  const palette = cat.paletteById(state.palette);
  return `<div class="field"><span class="field-label">色板</span>${cat.pickerButton({ attr: 'data-cr-pick="palette"', label: cat.paletteLabel(palette), prefix: cat.paletteBand(palette), aria: '色板' })}</div>
    <div class="field"><span class="field-label">制作规格</span>${cat.pickerButton({ attr: 'data-cr-pick="spec"', label: cat.specById(state.spec).label, aria: '制作规格' })}${state.specNote ? `<span class="hint">${esc(state.specNote)}</span>` : ''}</div>`;
}

// ---------- 新建图纸 ----------
function openNewDrawing(input, ctx) {
  const isPhoto = input.kind === 'photo';
  const natW = isPhoto ? input.natW : ART;
  const natH = isPhoto ? input.natH : ART;
  const state = { ratio: 'original', crop: { x: 0, y: 0, w: natW, h: natH }, width: 58, custom: false, colors: 24, palette: 'mard-291', spec: '5-29', specNote: '', removeBg: true };
  const board = () => cat.specById(state.spec).board;
  const height = () => Math.max(1, Math.min(200, Math.round((state.width * state.crop.h) / state.crop.w)));
  const aspect = () => {
    if (state.ratio === 'square') return 1;
    if (state.ratio === 'board') {
      const cols = Math.max(1, Math.ceil(state.width / board()));
      return Math.max(1, Math.round((cols * natH) / natW)) / cols;
    }
    return natH / natW;
  };
  const source = () => (isPhoto
    ? { kind: 'photo', img: input.img, natW, natH, crop: { ...state.crop } }
    : { kind: 'motif', motif: input.motif, crop: { x: state.crop.x / ART, y: state.crop.y / ART, w: state.crop.w / ART, h: state.crop.h / ART } });

  function setRatio(ratio) {
    state.ratio = ratio;
    const a = aspect();
    let w = natW;
    let h = w * a;
    if (h > natH) { h = natH; w = h / a; }
    state.crop = { x: (natW - w) / 2, y: (natH - h) / 2, w, h };
  }

  const settingsHTML = () => {
    const b = board();
    const { cols, rows, total } = cat.boardsOf(state.width, height(), b);
    return `<div class="field"><span class="field-label">图纸宽度</span>
        <div class="cr-chips">${cat.boardWidths(b).map(({ boards, width }) => `<button type="button" class="chip" data-cr-width="${width}" aria-pressed="${!state.custom && state.width === width}">${boards} 板 · ${width}</button>`).join('')}<button type="button" class="chip" data-cr-custom aria-pressed="${state.custom}">自定义</button></div>
        ${state.custom ? `<label class="cr-num"><input class="input" type="number" min="20" max="200" value="${state.width}" data-cr-width-input aria-label="自定义宽度（格）"><span>格</span><span class="hint">20–200</span></label>` : ''}
        <span class="hint t-num">${state.width} × ${height()} 格 · ${cols} × ${rows} 块板（共 ${total} 块）</span>
      </div>
      <div class="field"><div class="cr-field-head"><label class="field-label" for="cr-colors">颜色数</label><output class="cr-value t-num" data-cr-colors-out>${state.colors} 色</output></div>
        <input id="cr-colors" class="range" type="range" min="8" max="48" value="${state.colors}" data-cr-colors>
        <span class="hint">颜色越多越接近原图，要买的豆子种类也越多</span></div>
      ${pickersHTML(state)}
      <label class="cr-switch"><span class="grow"><span class="field-label">去背景</span><span class="hint">从图片四边向内去掉相近的底色</span></span><input type="checkbox" class="switch" data-cr-bg ${state.removeBg ? 'checked' : ''}></label>`;
  };

  const body = `<div class="cr-new">
    <div class="cr-crop">
      <div class="cr-stage" data-stage><img class="cr-img" data-img src="${isPhoto ? input.url : illustrationURL(input.motif, 440)}" alt="所选图片" draggable="false"><div class="cr-dim" data-dim aria-hidden="true"><span class="cr-hole" data-hole></span></div>
        <div class="cr-frame" data-frame tabindex="0" role="group" aria-label="取景框，方向键移动">${['nw', 'ne', 'sw', 'se'].map((c) => `<span class="cr-handle ${c}" data-handle="${c}" aria-hidden="true"></span>`).join('')}</div>
      </div>
      <div class="cr-crop-bar">
        <div class="seg" role="group" aria-label="裁剪比例">${[['original', '原图'], ['square', '1:1'], ['board', '按底板']].map(([id, text]) => `<button type="button" class="seg-item" data-ratio="${id}" aria-pressed="${state.ratio === id}">${text}</button>`).join('')}</div>
        <span class="hint" data-crop-hint>拖动取景框选择要拼的部分</span>
      </div>
    </div>
    <div class="cr-settings">
      <div class="cr-preview"><div class="cr-preview-art" data-preview></div><div class="cr-preview-text"><span class="t-caption t-muted">结果预览</span><b class="t-num" data-preview-size></b><span class="t-body-sm t-muted t-num" data-preview-meta></span></div></div>
      <div class="cr-settings-fields" data-settings>${settingsHTML()}</div>
    </div>
  </div>`;

  openDialog({
    title: '新建图纸',
    size: 'lg',
    body,
    foot: '<button type="button" class="btn btn-secondary" data-close>取消</button><button type="button" class="btn btn-primary" data-generate>生成图纸</button>',
    onClose() { if (isPhoto && !input.kept) URL.revokeObjectURL(input.url); },
    onMount(dialog, close) {
      dialog.classList.add('cr-dialog');
      const stage = $('[data-stage]', dialog);
      const img = $('[data-img]', dialog);
      const frame = $('[data-frame]', dialog);
      let box = { x: 0, y: 0, k: 1 };
      let previewTimer = 0;

      function layout() {
        const sw = stage.clientWidth;
        const sh = stage.clientHeight;
        const k = Math.min((sw - 24) / natW, (sh - 24) / natH);
        box = { k, x: (sw - natW * k) / 2, y: (sh - natH * k) / 2 };
        Object.assign(img.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${natW * k}px`, height: `${natH * k}px` });
        placeFrame();
      }
      function placeFrame() {
        const { x, y, w, h } = state.crop;
        Object.assign($('[data-dim]', dialog).style, { left: `${box.x}px`, top: `${box.y}px`, width: `${natW * box.k}px`, height: `${natH * box.k}px` });
        Object.assign($('[data-hole]', dialog).style, { left: `${x * box.k}px`, top: `${y * box.k}px`, width: `${w * box.k}px`, height: `${h * box.k}px` });
        Object.assign(frame.style, { left: `${box.x + x * box.k}px`, top: `${box.y + y * box.k}px`, width: `${w * box.k}px`, height: `${h * box.k}px` });
      }
      function preview() {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(() => {
          const pattern = generate(source(), { width: state.width, colors: state.colors, removeBg: state.removeBg, sample: 'dominant' });
          const slot = $('[data-preview]', dialog);
          slot.replaceChildren(patternCanvas(pattern, 112, { mode: 'flat', pad: 0.04 }));
          const used = new Set(pattern.keys.filter(Boolean)).size;
          $('[data-preview-size]', dialog).textContent = `${pattern.width} × ${pattern.height} 格`;
          $('[data-preview-meta]', dialog).textContent = `${cat.specById(state.spec).mm} · 约 ${cat.fmt(pattern.keys.filter(Boolean).length)} 颗 · ${used} 色`;
        }, 60);
      }
      function refreshSettings() {
        const fields = $('[data-settings]', dialog);
        const focus = document.activeElement?.matches('[data-cr-width-input]');
        fields.innerHTML = settingsHTML();
        if (focus) { const n = $('[data-cr-width-input]', fields); n.focus(); }
        $$('[data-ratio]', dialog).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ratio === state.ratio)));
        if (state.ratio === 'board') {
          const cols = Math.ceil(state.width / board());
          $('[data-crop-hint]', dialog).textContent = `按整块底板取景 · ${cols} × ${Math.round(cols * aspect())} 块`;
        } else $('[data-crop-hint]', dialog).textContent = '拖动取景框选择要拼的部分';
        preview();
      }

      // 取景框：拖动移动，四角等比缩放（比例由分段决定）
      const minSide = Math.min(natW, natH) * 0.15;
      frame.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        frame.setPointerCapture(event.pointerId);
        frame.focus({ preventScroll: true });
        const handle = event.target.closest('[data-handle]')?.dataset.handle;
        const start = { px: event.clientX, py: event.clientY, crop: { ...state.crop } };
        const a = state.crop.h / state.crop.w;
        const move = (e) => {
          const dx = (e.clientX - start.px) / box.k;
          const dy = (e.clientY - start.py) / box.k;
          const c = start.crop;
          if (!handle) {
            state.crop.x = Math.max(0, Math.min(natW - c.w, c.x + dx));
            state.crop.y = Math.max(0, Math.min(natH - c.h, c.y + dy));
          } else {
            const left = handle.includes('w');
            const topSide = handle.includes('n');
            const ax = left ? c.x + c.w : c.x;
            const ay = topSide ? c.y + c.h : c.y;
            let w = Math.max(left ? c.w - dx : c.w + dx, (topSide ? c.h - dy : c.h + dy) / a, minSide);
            w = Math.min(w, left ? ax : natW - ax, (topSide ? ay : natH - ay) / a);
            const h = w * a;
            state.crop = { x: left ? ax - w : ax, y: topSide ? ay - h : ay, w, h };
          }
          placeFrame();
          preview();
        };
        const up = () => { frame.removeEventListener('pointermove', move); frame.removeEventListener('pointerup', up); frame.removeEventListener('pointercancel', up); refreshSettings(); };
        frame.addEventListener('pointermove', move);
        frame.addEventListener('pointerup', up);
        frame.addEventListener('pointercancel', up);
      });
      frame.addEventListener('keydown', (event) => {
        const step = (event.shiftKey ? 0.05 : 0.01) * Math.max(natW, natH);
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
        if (!d) return;
        event.preventDefault();
        state.crop.x = Math.max(0, Math.min(natW - state.crop.w, state.crop.x + d[0]));
        state.crop.y = Math.max(0, Math.min(natH - state.crop.h, state.crop.y + d[1]));
        placeFrame();
        preview();
      });

      dialog.addEventListener('click', (event) => {
        const ratio = event.target.closest('[data-ratio]');
        if (ratio) { setRatio(ratio.dataset.ratio); placeFrame(); refreshSettings(); return; }
        const width = event.target.closest('[data-cr-width]');
        if (width) { state.width = Number(width.dataset.crWidth); state.custom = false; if (state.ratio === 'board') setRatio('board'); placeFrame(); refreshSettings(); return; }
        if (event.target.closest('[data-cr-custom]')) { state.custom = true; refreshSettings(); $('[data-cr-width-input]', dialog)?.focus(); }
      });
      dialog.addEventListener('input', (event) => {
        if (event.target.matches('[data-cr-colors]')) { state.colors = Number(event.target.value); $('[data-cr-colors-out]', dialog).textContent = `${state.colors} 色`; preview(); }
      });
      dialog.addEventListener('change', (event) => {
        const t = event.target;
        if (t.matches('[data-cr-bg]')) { state.removeBg = t.checked; preview(); }
        if (t.matches('[data-cr-width-input]')) {
          const n = Math.round(Number(t.value));
          state.width = Number.isFinite(n) ? Math.max(20, Math.min(200, n)) : state.width;
          if (state.ratio === 'board') { setRatio('board'); placeFrame(); }
          refreshSettings();
        }
      });
      bindPickers(dialog, state, () => { if (state.ratio === 'board') { setRatio('board'); placeFrame(); } refreshSettings(); });

      $('[data-generate]', dialog).addEventListener('click', (event) => {
        event.currentTarget.classList.add('is-loading');
        const q = new URLSearchParams({ w: state.width, c: state.colors, p: state.palette, s: state.spec, bg: state.removeBg ? '1' : '0', t: Date.now().toString(36) });
        setTimeout(() => {
          if (isPhoto) {
            input.kept = true;
            stashPhoto({ img: input.img, url: input.url, natW, natH, crop: { ...state.crop }, name: input.name });
            close();
            ctx.navigate(`/editor/new-photo?${q}`);
          } else {
            const c = state.crop;
            q.set('crop', [c.x, c.y, c.w, c.h].map((v) => (v / ART).toFixed(4)).join(','));
            close();
            ctx.navigate(`/editor/new-${input.motif}?${q}`);
          }
        }, 800);
      });

      const observer = new ResizeObserver(layout);
      observer.observe(stage);
      img.decode?.().catch(() => {}).finally(layout);
      layout();
      refreshSettings();
    },
  });
}

// ---------- 空白画布 ----------
function openBlank(ctx) {
  const state = { boards: 2, custom: false, w: 58, h: 58, palette: 'mard-291', spec: '5-29', specNote: '' };
  const board = () => cat.specById(state.spec).board;
  const sync = () => { if (!state.custom) { state.w = state.boards * board(); state.h = state.w; } };
  const bodyHTML = () => `<div class="cr-form">
      <div class="field"><span class="field-label">尺寸</span>
        <div class="cr-chips">${cat.boardWidths(board()).map(({ boards, width }) => `<button type="button" class="chip" data-blank-boards="${boards}" aria-pressed="${!state.custom && state.boards === boards}">${boards} 板 · ${width}×${width}</button>`).join('')}<button type="button" class="chip" data-blank-custom aria-pressed="${state.custom}">自定义</button></div>
        ${state.custom ? `<div class="cr-wh"><label class="cr-num"><input class="input" type="number" min="20" max="200" value="${state.w}" data-blank-w aria-label="宽（格）"><span>宽</span></label><span class="t-muted">×</span><label class="cr-num"><input class="input" type="number" min="20" max="200" value="${state.h}" data-blank-h aria-label="高（格）"><span>高</span></label><span class="hint">20–200 格</span></div>` : ''}
        <span class="hint t-num">${state.w} × ${state.h} 格 · 共 ${cat.boardsOf(state.w, state.h, board()).total} 块底板</span>
      </div>
      ${pickersHTML(state)}
    </div>`;
  openDialog({
    title: '从空白画布开始',
    body: bodyHTML(),
    foot: '<button type="button" class="btn btn-secondary" data-close>取消</button><button type="button" class="btn btn-primary" data-create>创建画布</button>',
    onMount(dialog, close) {
      const body = $('.dialog-body', dialog);
      const refresh = () => { sync(); body.innerHTML = bodyHTML(); };
      dialog.addEventListener('click', (event) => {
        const b = event.target.closest('[data-blank-boards]');
        if (b) { state.boards = Number(b.dataset.blankBoards); state.custom = false; refresh(); return; }
        if (event.target.closest('[data-blank-custom]')) { state.custom = true; refresh(); $('[data-blank-w]', dialog)?.focus(); }
      });
      dialog.addEventListener('change', (event) => {
        const t = event.target;
        const clampN = (v, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(20, Math.min(200, n)) : d; };
        if (t.matches('[data-blank-w]')) { state.w = clampN(t.value, state.w); refresh(); }
        if (t.matches('[data-blank-h]')) { state.h = clampN(t.value, state.h); refresh(); }
      });
      bindPickers(dialog, state, refresh);
      $('[data-create]', dialog).addEventListener('click', () => {
        close();
        ctx.navigate(`/editor/new-blank?${new URLSearchParams({ w: state.w, h: state.h, p: state.palette, s: state.spec, t: Date.now().toString(36) })}`);
      });
    },
  });
}

export default {
  shell: 'site',
  nav: 'create',
  tabbar: true,
  topbarCta: false,
  title: '创作',
  render(ctx) {
    const dragging = ctx.query.get('drag') === '1';
    return `<div class="cr" data-create>
      <header class="cr-head">
        <h1 class="t-display">创作一张拼豆图纸</h1>
        <p>上传一张图片，按底板数和颜色数生成可以照着拼的图纸，之后还能逐格修改。</p>
      </header>
      <section class="cr-drop ${dragging ? 'is-dragging' : ''}" data-drop aria-label="选择图片">
        <div class="cr-drop-inner">
          <span class="cr-drop-icon">${icon('image-plus', 's24')}</span>
          <h2 class="t-title-2"><span class="cr-when-idle">拖入图片，或点击选择</span><span class="cr-when-drag">松开即可添加图片</span><span class="cr-when-touch">选择一张图片开始</span></h2>
          <p class="t-body-sm t-muted cr-formats">支持 JPEG、PNG、WebP、HEIC，单张不超过 20 MB</p>
          <button type="button" class="btn btn-primary btn-lg" data-choose>${icon('upload')}选择图片</button>
          <p class="cr-error" data-drop-error role="alert" hidden></p>
        </div>
        <input type="file" accept="image/*" hidden data-file>
      </section>
      <div class="cr-alt">
        <button type="button" class="cr-alt-card" data-blank>
          <span class="cr-alt-icon">${icon('grid-3x3')}</span>
          <span class="grow"><span class="cr-alt-title">从空白画布开始</span><span class="cr-alt-text">按底板尺寸新建，自己一格一格画</span></span>
          ${icon('chevron-right', 's18')}
        </button>
        <button type="button" class="cr-alt-card" data-import>
          <span class="cr-alt-icon">${icon('file-up')}</span>
          <span class="grow"><span class="cr-alt-title">导入项目文件</span><span class="cr-alt-text">继续编辑从豆色绘导出的 .json 文件</span></span>
          ${icon('chevron-right', 's18')}
        </button>
        <input type="file" accept=".json,application/json" hidden data-import-file>
      </div>
      <section class="cr-sec" aria-labelledby="cr-samples">
        <div class="cr-sec-head"><h2 class="t-title-2" id="cr-samples">用示例试试</h2><p class="t-body-sm t-muted">点一张示例，走一遍裁剪、设置和生成</p></div>
        <div class="cr-samples">${SAMPLES.map((work) => `<button type="button" class="cr-sample" data-sample="${work.id}" aria-label="用示例「${esc(work.title)}」新建图纸">
          <span class="cr-sample-art"><img src="${illustrationURL(work.motif, 220)}" alt="" loading="lazy"></span>
          <span class="cr-sample-name">${esc(work.title)}</span>
        </button>`).join('')}</div>
      </section>
      <section class="cr-sec" aria-labelledby="cr-recent">
        <div class="cr-sec-head is-row"><h2 class="t-title-2" id="cr-recent">最近的设计</h2><a class="t-link t-body-sm" href="#/me">全部设计</a></div>
        <div class="cr-recent">${DESIGNS.slice(0, 3).map(recentCard).join('')}</div>
      </section>
      <p class="cr-privacy">${icon('lock', 's16')}<span>图片只在你的浏览器里处理；登录后原图会自动保存到私人空间</span></p>
    </div>`;
  },
  mount(root, ctx) {
    const page = $('[data-create]', root);
    const drop = $('[data-drop]', page);
    const fileInput = $('[data-file]', page);
    const errorNode = $('[data-drop-error]', page);
    const forced = ctx.query.get('drag') === '1';

    const showError = (text) => { errorNode.hidden = !text; errorNode.innerHTML = text ? `${icon('circle-alert', 's16')}<span>${esc(text)}</span>` : ''; };
    function takeFile(file) {
      if (!file) return;
      showError('');
      if (!file.type.startsWith('image/') && !/\.heic$/i.test(file.name)) { showError(`「${file.name}」不是图片。请选择 JPEG、PNG、WebP 或 HEIC 图片。`); return; }
      if (file.size > MAX_BYTES) { showError('图片超过 20 MB。请压缩或裁剪后再上传。'); return; }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => openNewDrawing({ kind: 'photo', img, url, natW: img.naturalWidth, natH: img.naturalHeight, name: file.name.replace(/\.[^.]+$/, '') || '未命名设计' }, ctx);
      img.onerror = () => {
        URL.revokeObjectURL(url);
        showError(/heic/i.test(file.type + file.name) ? '当前浏览器无法读取 HEIC 图片，请先转成 JPEG 或 PNG。' : '这张图片无法读取，文件可能已损坏。换一张试试。');
      };
      img.src = url;
    }
    fileInput.addEventListener('change', () => { takeFile(fileInput.files[0]); fileInput.value = ''; });
    drop.addEventListener('click', (event) => { if (!event.target.closest('.cr-error')) fileInput.click(); });

    let depth = 0;
    const hasFiles = (event) => [...(event.dataTransfer?.types ?? [])].includes('Files');
    const onEnter = (event) => { if (!hasFiles(event)) return; event.preventDefault(); depth += 1; drop.classList.add('is-dragging'); };
    const onOver = (event) => { if (hasFiles(event)) event.preventDefault(); };
    const onLeave = () => { depth = Math.max(0, depth - 1); if (!depth && !forced) drop.classList.remove('is-dragging'); };
    const onDrop = (event) => { if (!hasFiles(event)) return; event.preventDefault(); depth = 0; if (!forced) drop.classList.remove('is-dragging'); takeFile(event.dataTransfer.files[0]); };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);

    const importInput = $('[data-import-file]', page);
    importInput.addEventListener('change', () => {
      const file = importInput.files[0];
      importInput.value = '';
      if (!file) return;
      if (!/\.json$/i.test(file.name)) { toast('这不是豆色绘项目文件。请选择从「导出 → 导出项目文件」保存的 .json 文件', { iconName: 'circle-alert' }); return; }
      toast(`已导入「${file.name.replace(/\.json$/i, '')}」`, { iconName: 'file-up', action: { label: '打开', onClick: () => ctx.navigate('/editor/d-cat') } });
    });

    page.addEventListener('click', (event) => {
      const sample = event.target.closest('[data-sample]');
      if (sample) { openNewDrawing({ kind: 'motif', motif: WORKS.find((w) => w.id === sample.dataset.sample).motif }, ctx); return; }
      if (event.target.closest('[data-blank]')) { openBlank(ctx); return; }
      if (event.target.closest('[data-import]')) importInput.click();
    });

    const pick = SAMPLES.find((w) => w.id === ctx.query.get('pick'));
    if (pick) requestAnimationFrame(() => openNewDrawing({ kind: 'motif', motif: pick.motif }, ctx));
    if (ctx.query.get('blank') === '1') requestAnimationFrame(() => openBlank(ctx));

    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  },
};
