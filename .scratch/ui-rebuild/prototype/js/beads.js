// 图纸渲染：bead = 钉板上带孔的圆豆（缩略图与详情默认），flat = 方格（编辑用）。
import { BEADS } from '../motifs.js';

const DPR = () => Math.min(2, window.devicePixelRatio || 1);

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(hex, target, amount) {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * amount)).join(',')})`;
}
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 在 ctx 上以 (x, y) 为左上角、每格 cell 像素绘制图纸。 */
export function drawPattern(ctx, pattern, opts) {
  const { x = 0, y = 0, cell, mode = 'bead', grid = false, seams = false, codes = false, board = 29, pegs = true, highlight = null } = opts;
  const { width, height, keys } = pattern;
  const w = width * cell;
  const h = height * cell;
  ctx.save();
  if (mode === 'bead') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, w, h);
    const r = cell * 0.47;
    const hole = cell * 0.14;
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        const key = keys[row * width + col];
        const cx = x + col * cell + cell / 2;
        const cy = y + row * cell + cell / 2;
        if (!key) {
          if (pegs && cell >= 4) {
            ctx.fillStyle = '#ebebef';
            ctx.beginPath();
            ctx.arc(cx, cy, Math.max(0.6, cell * 0.09), 0, Math.PI * 2);
            ctx.fill();
          }
          continue;
        }
        const hex = BEADS[key].hex;
        ctx.fillStyle = hex;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        if (cell >= 7) {
          if (cell >= 10) {
            ctx.strokeStyle = mix(hex, '#000000', 0.1);
            ctx.lineWidth = Math.max(0.5, cell * 0.04);
            ctx.stroke();
          }
          ctx.fillStyle = mix(hex, '#ffffff', 0.66);
          ctx.beginPath();
          ctx.arc(cx, cy, hole, 0, Math.PI * 2);
          ctx.fill();
        } else if (cell >= 4) {
          ctx.fillStyle = mix(hex, '#ffffff', 0.5);
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(0.5, hole * 0.8), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  } else {
    if (opts.base !== null) {
      ctx.fillStyle = opts.base || '#ffffff';
      ctx.fillRect(x, y, w, h);
    }
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        const key = keys[row * width + col];
        if (!key) continue;
        ctx.fillStyle = BEADS[key].hex;
        ctx.fillRect(x + col * cell, y + row * cell, cell, cell);
      }
    }
    if (grid && cell >= 5) {
      ctx.strokeStyle = 'rgba(28,28,30,0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let col = 0; col <= width; col += 1) { const px = Math.round(x + col * cell) + 0.5; ctx.moveTo(px, y); ctx.lineTo(px, y + h); }
      for (let row = 0; row <= height; row += 1) { const py = Math.round(y + row * cell) + 0.5; ctx.moveTo(x, py); ctx.lineTo(x + w, py); }
      ctx.stroke();
    }
    if (seams) {
      ctx.strokeStyle = 'rgba(49,96,230,0.55)';
      ctx.lineWidth = Math.max(1.5, cell * 0.08);
      ctx.beginPath();
      for (let col = board; col < width; col += board) { const px = x + col * cell; ctx.moveTo(px, y); ctx.lineTo(px, y + h); }
      for (let row = board; row < height; row += board) { const py = y + row * cell; ctx.moveTo(x, py); ctx.lineTo(x + w, py); }
      ctx.stroke();
    }
    if (codes && cell >= 18) {
      ctx.font = `600 ${Math.round(cell * 0.3)}px ui-monospace, Menlo, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let row = 0; row < height; row += 1) {
        for (let col = 0; col < width; col += 1) {
          const key = keys[row * width + col];
          if (!key) continue;
          const bead = BEADS[key];
          ctx.fillStyle = luminance(bead.hex) > 0.45 ? 'rgba(28,28,30,0.78)' : 'rgba(255,255,255,0.92)';
          ctx.fillText(bead.code, x + col * cell + cell / 2, y + row * cell + cell / 2 + 0.5);
        }
      }
    }
  }
  if (highlight) {
    ctx.strokeStyle = highlight.color || 'rgba(49,96,230,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + highlight.col * cell, y + highlight.row * cell, (highlight.w || 1) * cell, (highlight.h || 1) * cell);
  }
  ctx.restore();
  return { w, h };
}

/** 生成一个方形画布：图纸居中、按比例适配，四周留 pad 比例的钉板边。 */
export function patternCanvas(pattern, size, { mode = 'bead', pad = 0.08, background = '#ffffff', ...rest } = {}) {
  const canvas = document.createElement('canvas');
  const ratio = DPR();
  const width = typeof size === 'number' ? size : size.width;
  const height = typeof size === 'number' ? size : size.height;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  const inner = Math.min(width, height) * (1 - pad * 2);
  const cell = inner / Math.max(pattern.width, pattern.height);
  const pw = cell * pattern.width;
  const ph = cell * pattern.height;
  drawPattern(ctx, pattern, { x: (width - pw) / 2, y: (height - ph) / 2, cell, mode, ...rest });
  return canvas;
}

const urlCache = new Map();
/** 同一图案重复使用时缓存成 dataURL，列表里用 <img> 更省。 */
export function patternImage(pattern, size, opts = {}) {
  const key = `${pattern.id}|${size}|${JSON.stringify(opts)}`;
  if (!urlCache.has(key)) urlCache.set(key, patternCanvas(pattern, size, opts).toDataURL('image/png'));
  return urlCache.get(key);
}

/** 像素小图标（类目条）：平铺方格、无网格。 */
export function pixelIcon(pattern, px = 28) {
  return patternCanvas(pattern, px, { mode: 'flat', pad: 0, background: 'rgba(0,0,0,0)', base: null });
}
