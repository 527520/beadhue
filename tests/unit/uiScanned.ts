/**
 * 令牌护栏扫描范围（uiGuardrails）：全部页面与组件目录，外加画布渲染里用到工具类的几个模块。
 * 与 src/app/theme.css 的 @source 同一份清单，护栏会核对。
 */
export const SCANNED = ['src/app', 'src/components', 'src/lib/render/beads.ts', 'src/lib/render/tagIconArt.ts', 'src/lib/render/viewer.ts', 'src/lib/render/poster.ts'];

/** 不扫描：接口路由（没有界面）、拿不到全站样式表只能写内联样式的根错误边界。 */
export const UNSCANNED = ['src/app/api/', 'src/app/global-error.tsx'];
