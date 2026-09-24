/**
 * 豆粒渲染的画布颜色（令牌文件：canvas 不能读取 Tailwind 工具类，数值与 theme.css / 原型 beads.js 一致）。
 * 服务端缩略图（lib/render/thumbnail.ts）若要同观感，也从这里取值。
 */
export const BEAD_TOKENS = {
  /** 钉板底色 */
  board: '#ffffff',
  /** 空格上的钉子 */
  peg: '#ebebef',
  /** 方格模式的网格线 */
  grid: 'rgba(28,28,30,0.10)',
  /** 板缝线（主色 55%） */
  seam: 'rgba(49,96,230,0.55)',
  /** 高亮框（主色 90%） */
  highlight: 'rgba(49,96,230,0.9)',
  /** 浅色豆上的色号文字 */
  codeOnLight: 'rgba(28,28,30,0.78)',
  /** 深色豆上的色号文字 */
  codeOnDark: 'rgba(255,255,255,0.92)',
} as const;

/** 编辑器画布（票 08，原型 editor/viewport.js）：图纸外框、悬停 / 光标描边、高亮时淡化其余格子、原图参照的遮罩与视野框。 */
export const EDITOR_CANVAS = {
  /** 图纸外框与投影（--line-strong） */
  frame: '#d1d1d6',
  /** 悬停 / 光标的深墨内描边（--ink） */
  ink: '#1c1c1e',
  /** 悬停 / 光标的白色外描边，与高亮淡化层（--bg） */
  paper: '#ffffff',
  /** 参照窗底色（--bg-subtle） */
  subtle: '#f7f7f8',
  /** 参照窗里的视野框（--accent） */
  accent: '#3160e6',
} as const;

/** 作品详情查看器与分享图的画布颜色（原型 detail.js 读 --ink / --on-ink / --bg-subtle / --ink-3，数值同 theme.css）。 */
export const VIEWER_TOKENS = {
  ink: '#1c1c1e',
  onInk: '#ffffff',
  ink3: '#6e6e78',
  subtle: '#f7f7f8',
  /** 舞台上钉板的浮起投影（深墨 12%） */
  boardShadow: 'rgba(28,28,30,0.12)',
} as const;

/** 标志的 2×2 四颗豆（原型 app.js brand()）：红、黄、蓝、绿。 */
export const BRAND_BEAD_COLORS = ['#E0473F', '#FFD447', '#3F7FD9', '#47A35B'] as const;

/** 无头像时的首字底色：按 ID 从这几颗豆色里取（白字对比度均 ≥3:1，取自原型 data.js 的作者色）。 */
export const AVATAR_BEAD_COLORS = ['#1C1C1E', '#E0473F', '#F28B2C', '#3F7FD9', '#47A35B', '#8B6CC9'] as const;

/** 空状态插画用到的几颗「豆色」（取自原型 motifs.js 的示例色板）。 */
export const BEAD_SAMPLE_COLORS = {
  K: '#3A2A30',
  R: '#E0473F',
  Y: '#FFD447',
  G: '#47A35B',
  B: '#3F7FD9',
  O: '#F28B2C',
  V: '#8B6CC9',
  P: '#F59CB0',
  T: '#D49A5E',
  C: '#8FDCC8',
} as const;
