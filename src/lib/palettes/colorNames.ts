/**
 * 色号清单里的「名称」（R15）：内置色板目录只有色号、HEX 与分组，没有官方颜色名，
 * 这里按 HEX 推导一个确定的中文色系名（如「浅蓝」「深红」「棕」），方便用户在清单里辨认。
 * 这是描述性名称，不是品牌命名；同一 HEX 永远得到同一个名字。
 */

function toHsl(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/iu.exec(hex);
  if (!match) return null;
  const [r, g, b] = [match[1], match[2], match[3]].map((part) => parseInt(part, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

function hueFamily(h: number): string {
  if (h < 15 || h >= 345) return '红';
  if (h < 45) return '橙';
  if (h < 68) return '黄';
  if (h < 85) return '黄绿';
  if (h < 160) return '绿';
  if (h < 195) return '青';
  if (h < 255) return '蓝';
  if (h < 290) return '紫';
  return '玫红';
}

export function describeColorName(hex: string): string {
  const hsl = toHsl(hex);
  if (!hsl) return '未知色';
  const [h, s, l] = hsl;
  if (l >= 0.95 || (l >= 0.88 && s < 0.35)) return '白';
  if (l < 0.1) return '黑';
  if (s < 0.12) return l >= 0.7 ? '浅灰' : l >= 0.4 ? '灰' : l >= 0.2 ? '深灰' : '黑';
  const family = hueFamily(h);
  if ((family === '橙' || family === '黄') && l < 0.45) return l < 0.25 ? '深棕' : '棕';
  if ((family === '红' || family === '玫红') && l >= 0.72) return '粉';
  if (l >= 0.75) return `浅${family}`;
  if (l < 0.3) return `深${family}`;
  return family;
}
