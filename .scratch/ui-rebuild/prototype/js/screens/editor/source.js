// 生成源：示例图案的「插画原图」、上传照片的取样量化，以及创作入口 → 编辑器的交接。
// 原型内的简化算法：逐格取样（主色 / 平均色）→ 亮度对比度 → 去背景（边界洪泛）→ 选出前 N 色 → 可选抖动。
import { BEADS, rasterize } from '../../../motifs.js';
import { BEAD_KEYS } from './catalog.js';

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const RGB = Object.fromEntries(BEAD_KEYS.map((key) => [key, hexToRgb(BEADS[key].hex)]));
const WHITE = [255, 255, 255];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgbCss = (rgb, alpha = 1) => `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]} / ${alpha})`;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 插画四周留白比例：示例图案画在内框里，像一张有背景的照片。
export const ART_PAD = 0.08;
const BACKDROP = { cat: 'b', strawberry: 'C', rainbow: 'b', frog: 'y', panda: 'g', icecream: 'v', sakura: 'b', watermelon: 'y', heart: 'p', star: 'b', mushroom: 'C', chick: 'b' };
const backdropRgb = (motif) => mix(RGB[BACKDROP[motif] ?? 'b'], WHITE, 0.62);

export const motifSource = (motif) => ({ kind: 'motif', motif, crop: { x: ART_PAD, y: ART_PAD, w: 1 - ART_PAD * 2, h: 1 - ART_PAD * 2 } });

// ---------- 插画渲染 ----------
const rasterCache = new Map();
function cachedRaster(motif, width, height) {
  const key = `${motif}|${width}|${height}`;
  if (!rasterCache.has(key)) {
    if (rasterCache.size > 40) rasterCache.delete(rasterCache.keys().next().value);
    rasterCache.set(key, rasterize(motif, width, height));
  }
  return rasterCache.get(key);
}

function thickenOutline(keys, w, h, extra) {
  const dist = new Int16Array(w * h);
  const queue = [];
  let outline = null;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (!keys[i]) continue;
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 || !keys[i - 1] || !keys[i + 1] || !keys[i - w] || !keys[i + w];
      if (edge) { dist[i] = 1; queue.push(i); outline ??= keys[i]; }
    }
  }
  if (!outline) return keys;
  const out = keys.slice();
  for (let q = 0; q < queue.length; q += 1) {
    const i = queue[q];
    out[i] = outline;
    if (dist[i] > extra) continue;
    const x = i % w;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
      if (j < 0 || j >= w * h || !keys[j] || dist[j]) continue;
      dist[j] = dist[i] + 1;
      queue.push(j);
    }
  }
  return out;
}

const artRasterCache = new Map();
function motifRaster(motif, res) {
  const key = `${motif}|${res}`;
  if (artRasterCache.has(key)) return artRasterCache.get(key);
  const keys = thickenOutline(rasterize(motif, res), res, res, Math.max(1, Math.round(res / 140)));
  const canvas = document.createElement('canvas');
  canvas.width = res;
  canvas.height = res;
  const g = canvas.getContext('2d');
  const image = g.createImageData(res, res);
  keys.forEach((k, i) => { if (k) image.data.set([...RGB[k], 255], i * 4); });
  g.putImageData(image, 0, 0);
  artRasterCache.set(key, canvas);
  return canvas;
}

const artCache = new Map();
/** 示例图案的平滑插画版：浅色底 + 柔和投影，用作示例缩略图和「原图」。size 为 CSS 像素。 */
export function illustration(motif, size = 256) {
  const px = Math.round(size * Math.min(2, window.devicePixelRatio || 1));
  const key = `${motif}|${px}`;
  if (artCache.has(key)) return artCache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const g = canvas.getContext('2d');
  const base = backdropRgb(motif);
  const glow = g.createRadialGradient(px * 0.5, px * 0.4, px * 0.05, px * 0.5, px * 0.5, px * 0.78);
  glow.addColorStop(0, rgbCss(mix(base, WHITE, 0.6)));
  glow.addColorStop(1, rgbCss(base));
  g.fillStyle = glow;
  g.fillRect(0, 0, px, px);
  const inner = px * (1 - ART_PAD * 2);
  g.save();
  g.shadowColor = rgbCss(RGB.K, 0.2);
  g.shadowBlur = px * 0.035;
  g.shadowOffsetY = px * 0.016;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(motifRaster(motif, clamp(Math.round(inner * 0.9), 192, 560)), px * ART_PAD, px * ART_PAD, inner, inner);
  g.restore();
  artCache.set(key, canvas);
  return canvas;
}
const urlCache = new Map();
export function illustrationURL(motif, size = 256) {
  const key = `${motif}|${size}`;
  if (!urlCache.has(key)) urlCache.set(key, illustration(motif, size).toDataURL('image/png'));
  return urlCache.get(key);
}

/** 画参照图用：返回图像与其中对应图纸的裁剪区（图像像素）。 */
export function sourceImage(source, cssSize = 480) {
  if (source.kind === 'photo') return { image: source.img, iw: source.natW, ih: source.natH, crop: source.crop };
  const image = illustration(source.motif, cssSize);
  const s = image.width;
  return { image, iw: s, ih: s, crop: { x: source.crop.x * s, y: source.crop.y * s, w: source.crop.w * s, h: source.crop.h * s } };
}

// ---------- 生成 ----------
export const sourceAspect = (source) => source.crop.h / source.crop.w;
export const patternHeight = (source, width) => clamp(Math.round(width * sourceAspect(source)), 1, 200);

function allowedKeys(kit) {
  return kit === 'all' || !kit ? BEAD_KEYS : BEAD_KEYS.slice(0, Math.min(Number(kit), BEAD_KEYS.length));
}
function distance(a, r, g, b) {
  const rm = (a[0] + r) / 2;
  const dr = a[0] - r;
  const dg = a[1] - g;
  const db = a[2] - b;
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}
function nearest(r, g, b, keys) {
  let best = keys[0];
  let bestD = Infinity;
  for (const key of keys) {
    const d = distance(RGB[key], r, g, b);
    if (d < bestD) { bestD = d; best = key; }
  }
  return best;
}

function motifGrid(source, width, height, sample) {
  const s = 1 - ART_PAD * 2;
  const region = { x: (source.crop.x - ART_PAD) / s, y: (source.crop.y - ART_PAD) / s, w: source.crop.w / s, h: source.crop.h / s };
  const W = Math.max(1, Math.round(width / region.w));
  const H = Math.max(1, Math.round(height / region.h));
  const factor = sample === 'average' ? clamp(Math.floor(720 / Math.max(W, H)), 1, 4) : 1;
  const full = cachedRaster(source.motif, W * factor, H * factor);
  const fw = W * factor;
  const ox = Math.round(region.x * W) * factor;
  const oy = Math.round(region.y * H) * factor;
  const rgb = new Float32Array(width * height * 3);
  const mask = new Uint8Array(width * height);
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      let r = 0; let g = 0; let b = 0; let n = 0;
      for (let dy = 0; dy < factor; dy += 1) {
        const y = oy + row * factor + dy;
        if (y < 0 || y >= H * factor) continue;
        for (let dx = 0; dx < factor; dx += 1) {
          const x = ox + col * factor + dx;
          if (x < 0 || x >= fw) continue;
          const key = full[y * fw + x];
          if (!key) continue;
          r += RGB[key][0]; g += RGB[key][1]; b += RGB[key][2]; n += 1;
        }
      }
      const i = row * width + col;
      if (n * 2 < factor * factor || !n) { mask[i] = 1; continue; }
      rgb[i * 3] = r / n; rgb[i * 3 + 1] = g / n; rgb[i * 3 + 2] = b / n;
    }
  }
  return { rgb, mask, background: backdropRgb(source.motif) };
}

function photoGrid(source, width, height, sample, keys) {
  const s = sample === 'average' ? 4 : 3;
  const canvas = document.createElement('canvas');
  canvas.width = width * s;
  canvas.height = height * s;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  const { x, y, w, h } = source.crop;
  g.drawImage(source.img, x, y, w, h, 0, 0, canvas.width, canvas.height);
  const data = g.getImageData(0, 0, canvas.width, canvas.height).data;
  const rgb = new Float32Array(width * height * 3);
  const mask = new Uint8Array(width * height);
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      let r = 0; let gg = 0; let b = 0; let n = 0; let clear = 0;
      const votes = new Map();
      for (let dy = 0; dy < s; dy += 1) {
        for (let dx = 0; dx < s; dx += 1) {
          const p = ((row * s + dy) * canvas.width + col * s + dx) * 4;
          if (data[p + 3] < 128) { clear += 1; continue; }
          if (sample === 'average') { r += data[p]; gg += data[p + 1]; b += data[p + 2]; n += 1; } else {
            const key = nearest(data[p], data[p + 1], data[p + 2], keys);
            votes.set(key, (votes.get(key) ?? 0) + 1);
          }
        }
      }
      const i = row * width + col;
      if (clear * 2 > s * s) { mask[i] = 1; continue; }
      if (sample === 'average') { rgb.set([r / n, gg / n, b / n], i * 3); } else {
        const top = [...votes].sort((a, c) => c[1] - a[1])[0][0];
        rgb.set(RGB[top], i * 3);
      }
    }
  }
  return { rgb, mask, background: null };
}

function removeBackground(rgb, mask, width, height, tolerance) {
  const at = (i) => [rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]];
  const corners = [0, width - 1, (height - 1) * width, height * width - 1].filter((i) => !mask[i]).map(at);
  if (!corners.length) return;
  const ref = [0, 1, 2].map((c) => corners.reduce((sum, color) => sum + color[c], 0) / corners.length);
  const limit = (tolerance * 3.2) ** 2;
  const near = (i) => (rgb[i * 3] - ref[0]) ** 2 + (rgb[i * 3 + 1] - ref[1]) ** 2 + (rgb[i * 3 + 2] - ref[2]) ** 2 <= limit;
  const seen = new Uint8Array(width * height);
  const stack = [];
  for (let col = 0; col < width; col += 1) stack.push(col, (height - 1) * width + col);
  for (let row = 0; row < height; row += 1) stack.push(row * width, row * width + width - 1);
  while (stack.length) {
    const i = stack.pop();
    if (seen[i]) continue;
    seen[i] = 1;
    if (!mask[i] && !near(i)) continue;
    mask[i] = 1;
    const x = i % width;
    if (x > 0) stack.push(i - 1);
    if (x < width - 1) stack.push(i + 1);
    if (i >= width) stack.push(i - width);
    if (i < width * (height - 1)) stack.push(i + width);
  }
}

/** 按参数把生成源变成图纸 { width, height, keys }。 */
export function generate(source, params) {
  const width = clamp(Math.round(params.width), 4, 200);
  const height = params.height ?? patternHeight(source, width);
  const allowed = allowedKeys(params.kit);
  const grid = source.kind === 'photo' ? photoGrid(source, width, height, params.sample, allowed) : motifGrid(source, width, height, params.sample);
  const { rgb, mask } = grid;
  const bright = (params.brightness ?? 0) * 1.28;
  const contrast = 1 + (params.contrast ?? 0) / 100;
  if (bright || contrast !== 1) {
    for (let i = 0; i < rgb.length; i += 1) rgb[i] = clamp((rgb[i] - 128) * contrast + 128 + bright, 0, 255);
  }
  if (source.kind === 'photo') {
    if (params.removeBg) removeBackground(rgb, mask, width, height, params.tolerance ?? 12);
  } else if (!params.removeBg) {
    for (let i = 0; i < mask.length; i += 1) if (mask[i]) { mask[i] = 0; rgb.set(grid.background, i * 3); }
  }
  const counts = new Map();
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i]) continue;
    const key = nearest(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2], allowed);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const palette = [...counts].sort((a, b) => b[1] - a[1]).slice(0, Math.max(2, params.colors ?? 24)).map(([key]) => key);
  const keys = new Array(width * height).fill(null);
  if (!palette.length) return { width, height, keys };
  const work = params.dither ? Float32Array.from(rgb) : rgb;
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i]) continue;
    const r = work[i * 3]; const g = work[i * 3 + 1]; const b = work[i * 3 + 2];
    const key = nearest(r, g, b, palette);
    keys[i] = key;
    if (!params.dither) continue;
    const err = [r - RGB[key][0], g - RGB[key][1], b - RGB[key][2]];
    const x = i % width;
    const spread = (j, f) => { if (j < mask.length && !mask[j]) for (let c = 0; c < 3; c += 1) work[j * 3 + c] += err[c] * f; };
    if (x < width - 1) spread(i + 1, 7 / 16);
    if (x > 0) spread(i + width - 1, 3 / 16);
    spread(i + width, 5 / 16);
    if (x < width - 1) spread(i + width + 1, 1 / 16);
  }
  return { width, height, keys };
}

// ---------- 创作入口 → 编辑器交接（同一页面会话内有效） ----------
let pending = null;
export function stashPhoto(entry) { pending = entry; }
export function pendingPhoto() { return pending; }
