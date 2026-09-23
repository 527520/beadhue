/**
 * 组件总览页的示例图案（移植自原型 prototype/motifs.js，仅开发页使用）。
 * 豆色数据：十六进制色值只出现在这里（护栏测试的豆色数据例外）。
 */
import type { Pattern } from '@/lib/types';

export const BEADS = {
  K: { code: 'H7', hex: '#3A2A30', name: '可可黑' },
  W: { code: 'H1', hex: '#FBF8F1', name: '奶白' },
  s: { code: 'H3', hex: '#D9DADF', name: '浅雾灰' },
  S: { code: 'H5', hex: '#8E929C', name: '石板灰' },
  R: { code: 'F5', hex: '#E0473F', name: '番茄红' },
  D: { code: 'F8', hex: '#A92C35', name: '莓果红' },
  P: { code: 'F2', hex: '#F59CB0', name: '樱粉' },
  p: { code: 'F1', hex: '#FCD9E1', name: '浅樱粉' },
  O: { code: 'A7', hex: '#F28B2C', name: '橘橙' },
  o: { code: 'A4', hex: '#F8BE7A', name: '杏橙' },
  Y: { code: 'A3', hex: '#FFD447', name: '柠檬黄' },
  y: { code: 'A1', hex: '#FFF0B3', name: '奶油黄' },
  G: { code: 'B8', hex: '#47A35B', name: '叶绿' },
  g: { code: 'B4', hex: '#A8D774', name: '嫩芽绿' },
  E: { code: 'B12', hex: '#1F6B45', name: '墨绿' },
  C: { code: 'C3', hex: '#8FDCC8', name: '薄荷' },
  B: { code: 'C9', hex: '#3F7FD9', name: '晴空蓝' },
  b: { code: 'C5', hex: '#A9D2F5', name: '浅天蓝' },
  V: { code: 'D6', hex: '#8B6CC9', name: '葡萄紫' },
  v: { code: 'D2', hex: '#D4C2F2', name: '薰衣草' },
  T: { code: 'G6', hex: '#D49A5E', name: '焦糖' },
  t: { code: 'G2', hex: '#F2D3A6', name: '奶茶' },
  M: { code: 'G11', hex: '#7C4F36', name: '可可棕' },
} as const;

export type Key = keyof typeof BEADS;

const inEllipse = (u: number, v: number, cx: number, cy: number, rx: number, ry: number) => ((u - cx) / rx) ** 2 + ((v - cy) / ry) ** 2 <= 1;
const inCircle = (u: number, v: number, cx: number, cy: number, r: number) => inEllipse(u, v, cx, cy, r, r);
const inRect = (u: number, v: number, x0: number, y0: number, x1: number, y1: number) => u >= x0 && u <= x1 && v >= y0 && v <= y1;
function inPolygon(u: number, v: number, points: Array<[number, number]>) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if ((yi > v) !== (yj > v) && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inRotatedEllipse(u: number, v: number, cx: number, cy: number, rx: number, ry: number, angle: number) {
  const dx = u - cx;
  const dy = v - cy;
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  return ((dx * cos - dy * sin) / rx) ** 2 + ((dx * sin + dy * cos) / ry) ** 2 <= 1;
}
function starPoints(cx: number, cy: number, outer: number, inner: number, spikes = 5): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let i = 0; i < spikes * 2; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / spikes;
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
  return points;
}

// 每个图案返回某格的颜色键；null 为透明（不上豆）。
const MOTIFS: Record<string, { title: string; outline: Key; paint: (u: number, v: number, x: number, y: number) => Key | null }> = {
  strawberry: {
    title: '草莓小甜心',
    outline: 'K',
    paint(u, v, x, y) {
      if (inRect(u, v, 0.47, 0.08, 0.53, 0.22)) return 'E';
      const leaves: Array<[number, number]> = [[-0.2, 0.03], [-0.1, -0.02], [0, -0.04], [0.1, -0.02], [0.2, 0.03]];
      if (leaves.some(([dx, dy]) => inEllipse(u, v, 0.5 + dx, 0.26 + dy, 0.11, 0.055))) return 'G';
      const t = (v - 0.27) / 0.66;
      if (t < 0 || t > 1) return null;
      const half = t < 0.2 ? 0.4 * Math.sqrt(Math.max(0, 1 - ((0.2 - t) / 0.2) ** 2)) : 0.4 * Math.sqrt(Math.max(0, 1 - ((t - 0.2) / 0.8) ** 1.6));
      if (Math.abs(u - 0.5) > half) return null;
      if (inEllipse(u, v, 0.33, 0.42, 0.06, 0.1)) return 'p';
      if ((x + 2 * y) % 5 === 0 && y % 3 === 0 && Math.abs(u - 0.5) < half - 0.06) return 'y';
      return 'R';
    },
  },
  mushroom: {
    title: '红伞蘑菇',
    outline: 'K',
    paint(u, v) {
      if (v <= 0.54 && inEllipse(u, v, 0.5, 0.54, 0.45, 0.42)) {
        const dots: Array<[number, number, number]> = [[0.3, 0.33, 0.075], [0.56, 0.22, 0.085], [0.74, 0.4, 0.06], [0.47, 0.45, 0.05], [0.16, 0.48, 0.04]];
        return dots.some(([cx, cy, r]) => inCircle(u, v, cx, cy, r)) ? 'W' : 'R';
      }
      if (inRect(u, v, 0.12, 0.54, 0.88, 0.6) && Math.abs(u - 0.5) < 0.36) return 't';
      if (inRect(u, v, 0.33, 0.6, 0.67, 0.9) || inEllipse(u, v, 0.5, 0.9, 0.17, 0.05)) {
        if (inCircle(u, v, 0.43, 0.7, 0.03) || inCircle(u, v, 0.57, 0.7, 0.03)) return 'K';
        if (inCircle(u, v, 0.38, 0.77, 0.028) || inCircle(u, v, 0.62, 0.77, 0.028)) return 'P';
        return 'y';
      }
      return null;
    },
  },
  cat: {
    title: '橘猫团子',
    outline: 'K',
    paint(u, v) {
      if (inPolygon(u, v, [[0.15, 0.46], [0.2, 0.1], [0.44, 0.32]])) return inPolygon(u, v, [[0.21, 0.4], [0.23, 0.2], [0.36, 0.33]]) ? 'P' : 'O';
      if (inPolygon(u, v, [[0.85, 0.46], [0.8, 0.1], [0.56, 0.32]])) return inPolygon(u, v, [[0.79, 0.4], [0.77, 0.2], [0.64, 0.33]]) ? 'P' : 'O';
      if (!inEllipse(u, v, 0.5, 0.58, 0.41, 0.34)) return null;
      if (inCircle(u, v, 0.35, 0.55, 0.05) || inCircle(u, v, 0.65, 0.55, 0.05)) return inCircle(u, v, 0.335, 0.53, 0.018) || inCircle(u, v, 0.635, 0.53, 0.018) ? 'W' : 'K';
      if (inPolygon(u, v, [[0.46, 0.63], [0.54, 0.63], [0.5, 0.68]])) return 'P';
      if (inEllipse(u, v, 0.5, 0.72, 0.15, 0.09)) return inRect(u, v, 0.44, 0.71, 0.56, 0.73) && Math.abs(u - 0.5) > 0.02 ? 'M' : 'y';
      if (inCircle(u, v, 0.27, 0.67, 0.045) || inCircle(u, v, 0.73, 0.67, 0.045)) return 'P';
      if ([0.44, 0.5, 0.56].some((cx) => inRect(u, v, cx - 0.018, 0.27, cx + 0.018, 0.4))) return 'T';
      return 'o';
    },
  },
  heart: {
    title: '心动爱心',
    outline: 'D',
    paint(u, v) {
      const x = (u - 0.5) * 2.5;
      const y = -(v - 0.5) * 2.5 + 0.25;
      if ((x * x + y * y - 1) ** 3 - x * x * y ** 3 > 0) return null;
      if (inEllipse(u, v, 0.32, 0.34, 0.07, 0.05)) return 'W';
      if (inEllipse(u, v, 0.36, 0.4, 0.11, 0.08)) return 'P';
      return v > 0.66 ? 'D' : 'R';
    },
  },
  star: {
    title: '星星人',
    outline: 'M',
    paint(u, v) {
      if (!inPolygon(u, v, starPoints(0.5, 0.54, 0.48, 0.23))) return null;
      if (inCircle(u, v, 0.42, 0.53, 0.035) || inCircle(u, v, 0.58, 0.53, 0.035)) return 'K';
      if (inCircle(u, v, 0.35, 0.61, 0.04) || inCircle(u, v, 0.65, 0.61, 0.04)) return 'P';
      if (inRect(u, v, 0.46, 0.6, 0.54, 0.635)) return 'M';
      return inEllipse(u, v, 0.43, 0.36, 0.06, 0.1) ? 'y' : 'Y';
    },
  },
  icecream: {
    title: '双球冰淇淋',
    outline: 'K',
    paint(u, v, x, y) {
      if (inCircle(u, v, 0.6, 0.07, 0.05)) return 'D';
      if (inCircle(u, v, 0.5, 0.23, 0.17)) return inEllipse(u, v, 0.43, 0.18, 0.04, 0.03) ? 'W' : 'C';
      const drips: Array<[number, number]> = [[0.3, 0.55], [0.44, 0.58], [0.6, 0.56], [0.7, 0.53]];
      if (inCircle(u, v, 0.5, 0.42, 0.25) || drips.some(([cx, cy]) => inCircle(u, v, cx, cy, 0.045))) {
        if ((x * 7 + y * 3) % 11 === 0) return (['Y', 'B', 'G', 'W'] as const)[(x + y) % 4];
        return 'P';
      }
      if (inPolygon(u, v, [[0.27, 0.54], [0.73, 0.54], [0.5, 0.97]])) return (x + y) % 3 === 0 || (x - y + 99) % 3 === 0 ? 'T' : 't';
      return null;
    },
  },
  rainbow: {
    title: '云朵彩虹',
    outline: 'S',
    paint(u, v) {
      const clouds: Array<[number, number, number]> = [[0.16, 0.74, 0.1], [0.27, 0.7, 0.12], [0.36, 0.76, 0.08], [0.84, 0.74, 0.1], [0.73, 0.7, 0.12], [0.64, 0.76, 0.08]];
      if (clouds.some(([cx, cy, r]) => inCircle(u, v, cx, cy, r))) return 'W';
      if (v > 0.72) return null;
      const r = Math.hypot(u - 0.5, v - 0.72);
      const bands: Key[] = ['V', 'B', 'G', 'Y', 'O', 'R'];
      if (r < 0.2 || r > 0.47) return null;
      return bands[Math.min(5, Math.floor((r - 0.2) / 0.045))];
    },
  },
  chick: {
    title: '小黄鸡',
    outline: 'M',
    paint(u, v) {
      if (inCircle(u, v, 0.42, 0.92, 0.04) || inCircle(u, v, 0.58, 0.92, 0.04)) return 'O';
      if (inCircle(u, v, 0.47, 0.18, 0.05) || inCircle(u, v, 0.54, 0.15, 0.06)) return 'Y';
      if (!inCircle(u, v, 0.5, 0.56, 0.36)) return null;
      if (inCircle(u, v, 0.39, 0.5, 0.04) || inCircle(u, v, 0.61, 0.5, 0.04)) return 'K';
      if (inPolygon(u, v, [[0.44, 0.58], [0.56, 0.58], [0.5, 0.65]])) return 'O';
      if (inCircle(u, v, 0.31, 0.6, 0.045) || inCircle(u, v, 0.69, 0.6, 0.045)) return 'P';
      if (inEllipse(u, v, 0.72, 0.72, 0.1, 0.07)) return 'o';
      return 'Y';
    },
  },
  sakura: {
    title: '春日樱花',
    outline: 'D',
    paint(u, v) {
      if (inCircle(u, v, 0.5, 0.52, 0.085)) return inCircle(u, v, 0.5, 0.52, 0.04) ? 'O' : 'Y';
      for (let k = 0; k < 5; k += 1) {
        const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
        const notch = inCircle(u, v, 0.5 + 0.45 * Math.cos(a), 0.52 + 0.45 * Math.sin(a), 0.06);
        if (!notch && inRotatedEllipse(u, v, 0.5 + 0.25 * Math.cos(a), 0.52 + 0.25 * Math.sin(a), 0.22, 0.15, a)) {
          return inRotatedEllipse(u, v, 0.5 + 0.15 * Math.cos(a), 0.52 + 0.15 * Math.sin(a), 0.1, 0.06, a) ? 'P' : 'p';
        }
      }
      return null;
    },
  },
  watermelon: {
    title: '夏日西瓜',
    outline: 'E',
    paint(u, v, x, y) {
      if (v < 0.3) return null;
      const r = Math.hypot(u - 0.5, v - 0.3);
      if (r > 0.46) return null;
      if (r > 0.41) return 'G';
      if (r > 0.37) return 'g';
      if (r < 0.33 && (x * 5 + y * 3) % 13 === 0 && v > 0.36) return 'K';
      return 'R';
    },
  },
  frog: {
    title: '呱呱青蛙',
    outline: 'E',
    paint(u, v) {
      for (const cx of [0.3, 0.7]) {
        if (inCircle(u, v, cx, 0.36, 0.14)) {
          if (inCircle(u, v, cx + 0.015, 0.36, 0.045)) return 'K';
          return inCircle(u, v, cx, 0.36, 0.09) ? 'W' : 'G';
        }
      }
      if (!inEllipse(u, v, 0.5, 0.62, 0.43, 0.27)) return null;
      const smile = 0.72 - 0.9 * (u - 0.5) ** 2;
      if (Math.abs(u - 0.5) < 0.2 && Math.abs(v - smile) < 0.018) return 'E';
      if (inCircle(u, v, 0.23, 0.66, 0.05) || inCircle(u, v, 0.77, 0.66, 0.05)) return 'P';
      return inEllipse(u, v, 0.5, 0.74, 0.3, 0.1) ? 'g' : 'G';
    },
  },
  panda: {
    title: '熊猫滚滚',
    outline: 'K',
    paint(u, v) {
      if (inCircle(u, v, 0.2, 0.22, 0.12) || inCircle(u, v, 0.8, 0.22, 0.12)) return 'K';
      if (!inEllipse(u, v, 0.5, 0.55, 0.42, 0.37)) return null;
      if (inRotatedEllipse(u, v, 0.35, 0.52, 0.09, 0.065, 0.6) || inRotatedEllipse(u, v, 0.65, 0.52, 0.09, 0.065, -0.6)) {
        return inCircle(u, v, 0.36, 0.51, 0.022) || inCircle(u, v, 0.64, 0.51, 0.022) ? 'W' : 'K';
      }
      if (inEllipse(u, v, 0.5, 0.64, 0.05, 0.03)) return 'K';
      if (inCircle(u, v, 0.27, 0.67, 0.045) || inCircle(u, v, 0.73, 0.67, 0.045)) return 'p';
      return 'W';
    },
  },
};


/** 栅格化为图纸：程序化图案 + 自动描边，swap 可替换颜色键。 */
export function motifPattern(id: string, size: number, swap: Partial<Record<Key, Key>> = {}): Pattern {
  const motif = MOTIFS[id];
  const keys: Array<Key | null> = new Array(size * size).fill(null);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) keys[y * size + x] = motif.paint((x + 0.5) / size, (y + 0.5) / size, x, y);
  const outlined = keys.slice();
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (keys[y * size + x] === null) continue;
      const edge = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        return nx < 0 || ny < 0 || nx >= size || ny >= size || keys[ny * size + nx] === null;
      });
      if (edge) outlined[y * size + x] = motif.outline;
    }
  }
  return {
    width: size,
    height: size,
    cells: outlined.map((raw) => {
      const key = raw ? (swap[raw] ?? raw) : null;
      return key ? { hex: BEADS[key].hex, code: BEADS[key].code, transparent: false } : { hex: null, code: null, transparent: true };
    }),
  };
}

export function beadName(code: string | null): string {
  return Object.values(BEADS).find((bead) => bead.code === code)?.name ?? '';
}
