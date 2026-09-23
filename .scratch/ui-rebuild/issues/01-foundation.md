# 01 设计令牌、组件底座与豆粒渲染

Status: ready-for-agent
Completion: not-started
Blocked by: —

先读 [实施指南](../implementation-guide.md)。

## 范围

1. **依赖**：`@base-ui/react`、`lucide-react`、`class-variance-authority`、`tailwind-merge`、`clsx`、`react-day-picker`。先确认各包在 React 19 + Next 16 下可用，并确认 Base UI 组件不会运行时注入无 nonce 的 `<style>`；如有组件注入样式，查 Base UI 的 CSP / nonce 方案接入 `x-nonce`（参考 `src/app/layout.tsx` 与 ADR-0008），做不到就不用该组件。
2. **令牌**：把 `prototype/styles/tokens.css` 的全部令牌写进 Tailwind v4 `@theme`（颜色、字体、字阶、间距、圆角、阴影、控件高度、动效时长与曲线、断点），命名与原型一致，让 `bg-accent`、`text-ink-3`、`rounded-lg`、`shadow-float`、`h-control-md` 这类工具类可用。新建 `src/app/theme.css`（或同等位置），不要在旧 `globals.css` / `beadhue.css` 上叠加；旧文件本票不删。字体沿用 `public/fonts/ui/fonts.css`（`BeadHue Text`，`BeadHue Round` 只给标志）。
3. **组件**（`src/components/ui/`，shadcn 风格：`cva` 变体 + `cn()`，源码可读、只用令牌）。逐个对照 `prototype/styles/components.css` 与 design.md §3 的形态与状态：
   Button（primary / secondary / outline / ghost / danger / danger-outline；sm / md / lg；图标；loading；disabled）、IconButton（普通 / filled / on / on-image；sm / md / lg；必须 aria-label）、LikeButton（落位动效）、Chip（默认 / 选中 / 描边 / 可移除 / 计数）、SearchField（胶囊、聚焦浮起、清除、快捷键提示）、Input / Textarea / Field（标签、提示、字段级错误）、Select（Base UI Select，桌面弹出 / 手机底部面板）、Checkbox、Radio、Switch、Slider、NumberField、Tabs（链接式与按钮式，下划线选中）、SegmentedControl（ToggleGroup，只用于模式切换）、Menu（勾选项、危险项、分隔、标签）、Popover、Dialog（**桌面居中弹窗 / 手机底部面板自动切换**，拖动条、焦点陷阱与归还、Esc、遮罩关闭、软键盘避让；尺寸 sm/md/lg/full）、Sheet（右侧抽屉）、Toast（Base UI Toast，深墨胶囊、可带操作）、Tooltip（悬停延迟、触屏不显示、弹层打开时不显示）、Badge（中性 / 信息 / 成功 / 警告 / 危险 / 精选 / 官方 / 图片上）、Avatar（首字 + 按 id 取豆粒色）、EmptyState（豆粒插画 + 标题 + 说明 + 操作）、Skeleton、Pagination（通栏单行 / 窄屏简化）、Progress、Table 基础样式、Kbd、Separator。
4. **豆粒渲染**：把 `prototype/js/beads.js` 移植为 `src/lib/render/beads.ts`（`drawPattern` 的 bead / flat 模式、网格、板缝、色号、高亮；`patternCanvas`；像素图标），输入为现有 `Pattern` 类型；配 `<BeadImage>`（客户端 canvas，懒渲染、DPR 适配）与 `<PixelIcon>`。原型的空状态插画（ART）移植为 EmptyState 的插画。
5. **组件总览页**：`/dev/ui`（非生产环境可访问，生产 `notFound()`），照 `prototype/js/screens/components.js` 展示全部组件的变体与状态，作为后续票的视觉对照基准。
6. **护栏测试**：新增单元测试扫描 `src/components/ui/**`、`src/lib/render/beads.ts` 以及之后新写的页面目录（给出可扩展的目录清单），禁止十六进制色值、任意字号 / 圆角 / 阴影写法（`text-[13px]`、`rounded-[10px]`、内联 `#xxxxxx` 等）；令牌文件与豆色数据除外。

## 验收

- `/dev/ui` 在 1440 与 390 下与原型 `#/components` 逐项一致（截图对照）。
- 组件单元测试覆盖：变体渲染、禁用、loading、Dialog 焦点陷阱与 Esc、手机宽度下 Dialog 变底部面板、Select 键盘操作、Tooltip 在触屏不出现、LikeButton aria-pressed。
- 生产构建后运行 E2E `08-production-runtime`（需要生产服务，按该用例说明）或最少在 dev 下确认控制台无 CSP 报错。
- 门禁：typecheck / lint / brand:check / 受影响测试全绿。
