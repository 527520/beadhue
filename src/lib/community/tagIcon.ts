/**
 * 类目条图标（R15-02）：`community_tags.icon` 的两种取值，浏览器与服务端共用。
 *
 * 1. 内置图标键：与原型 motifs 同名的像素图案，如 `star`、`cat`；
 * 2. 像素图标紧凑编码：`px:<宽>x<高>:<色1>.<色2>…:<格>`，宽高 8–16，最多 8 色（6 位 HEX，不带 #），
 *    格为按行展开的字符串，`.` 表示空格、`1`–`8` 表示第几种颜色。
 *    例：`px:8x8:E0473F.FFD447:..1111..` + 后续 7 行。
 */
import { z } from 'zod';

export const TAG_ICON_KEYS = [
  'strawberry', 'mushroom', 'cat', 'heart', 'star', 'icecream',
  'rainbow', 'chick', 'sakura', 'watermelon', 'frog', 'panda',
] as const;
export type TagIconKey = (typeof TAG_ICON_KEYS)[number];

export type TagIcon =
  | { kind: 'builtin'; key: TagIconKey }
  | { kind: 'pixels'; width: number; height: number; palette: string[]; cells: Array<number | null> };

const PIXEL_PATTERN = /^px:(\d{1,2})x(\d{1,2}):([0-9A-F]{6}(?:\.[0-9A-F]{6}){0,7}):([.1-8]+)$/u;

/** 解析图标取值；非法返回 null（调用方按「无图标」处理）。 */
export function parseTagIcon(value: string | null | undefined): TagIcon | null {
  if (!value) return null;
  if ((TAG_ICON_KEYS as readonly string[]).includes(value)) return { kind: 'builtin', key: value as TagIconKey };
  const match = PIXEL_PATTERN.exec(value);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  const palette = match[3].split('.').map((hex) => `#${hex}`);
  const raw = match[4];
  if (width < 8 || width > 16 || height < 8 || height > 16 || raw.length !== width * height) return null;
  const cells = [...raw].map((char) => (char === '.' ? null : Number(char) - 1));
  if (cells.some((index) => index !== null && index >= palette.length)) return null;
  return { kind: 'pixels', width, height, palette, cells };
}

/** 后台写入校验：null 清除图标；字符串必须是合法取值（HEX 统一转大写）。 */
export const tagIconSchema = z.string().trim().max(400).nullable().transform((value, ctx) => {
  if (value === null || value === '') return null;
  const normalized = value.startsWith('px:') ? value.replace(/:([0-9a-fA-F.]+):/u, (part) => part.toUpperCase()) : value;
  if (!parseTagIcon(normalized)) {
    ctx.addIssue({ code: 'custom', message: '图标需为内置图标键或 8–16 格像素图标编码' });
    return z.NEVER;
  }
  return normalized;
});
