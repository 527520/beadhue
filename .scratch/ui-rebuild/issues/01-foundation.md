# 01 设计令牌、组件底座与豆粒渲染

Status: ready-for-agent
Completion: complete
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

## Comments

### 实施记录（2026-09-23，提交 1282cd2 … 见 git log）

**做了什么**
- 依赖：`@base-ui/react` 1.8.0（锁定）、`react-day-picker` 10.0.1（锁定，本票只装不用，产物只有静态 CSS）、`lucide-react` ^1.47.0、`class-variance-authority` ^0.7.1、`tailwind-merge` ^3.7.0、`clsx` ^2.1.1。锁文件里 npm 顺手删掉的 `libc` 字段与 fsevents 的 `dev` 标记已还原。
- 旧 `src/components/ui/` 整体迁到 `src/components/legacy-ui/`（65 个文件只改 import 路径）：macOS 大小写不敏感，`Button.tsx` 与 shadcn 的 `button.tsx` 不能共存。票 13 直接删整个目录。
- 令牌：新文件 `src/app/theme.css`，独立 Tailwind 构建。与旧构建共存的约束（票 13 收回）：
  1. 工具类放最后一层 `ui`（`@layer theme, base, components, utilities, ui`），不管样式表先后都压过旧构建同名工具类；
  2. 不引入 preflight（复用旧构建的，避免重复 preflight 改写旧输入框字号）；
  3. 与旧 `:root` 变量同名的令牌（ink、状态色、圆角、字体、默认过渡）写在 `@theme inline`，只内联进工具类、不输出变量，所以旧样式与 `:root:has(.beadhue-ui)` 改不到它们；
  4. `source(none)` + 显式 `@source`（`components/ui`、`app/dev`、`lib/render/beads.ts`），后续票新目录要登记，护栏测试会核对；
  5. 新界面基础排版只作用于 `[data-ui]`（新页面根与各弹层根）。
  字阶 7 级 + 控件内字号（footnote 13 / topbar 17 / tabbar 11 / micro 10 / avatar-*），手机端字阶与 `--spacing-control-md`（触屏 44）、`--spacing-gutter`、`--spacing-topbar` 用媒体查询改变量。动效 `duration-press/state/enter`、`ease-standard`、`animate-*`（关键帧统一 `ui-` 前缀，不撞旧关键帧名）；焦点环 `focus-ring`。
- 旧全局规则隔离：`globals.css` 里 4 组不分层规则（触屏 44px 命中区、`button` 最小宽 / 高 44、输入框字号）追加零特异性的 `:where(:not([data-slot], [data-ui] *))`，只排除新组件与新界面区域，旧元素的层叠不变（designSystem 护栏的正则仍命中）。`ConsentPlacement` 对 `/dev/` 不套 `.beadhue-ui` 外壳与旧页脚。
- 组件（`src/components/ui/`，cva + `cn()`，`data-slot` 标记）：button、icon-button、like-button、chip（含 RemovableChip）、search-field、input / textarea、field、select（桌面 Base UI Select，手机底部面板列表）、checkbox / radio / switch、slider / number-field、tabs（按钮式 + 链接式 TabLinks）/ segmented-control（ToggleGroup）、menu（勾选、危险项、分隔、分组标签、静态样张）、popover（sheetTitle 时手机变底部面板）、dialog（桌面 Base UI Dialog / 手机 Base UI Drawer：拖动条、下滑关闭、VirtualKeyboardProvider；sm/md/lg/full；DialogSample 静态样张）、sheet（桌面右侧 480 / 手机底部面板）、toast（Base UI Toast，深墨胶囊、可带动作、4 秒）、tooltip（300ms、触屏不显示、触发器弹层打开时不显示）、badge、avatar、empty-state、skeleton、pagination（通栏 / 窄屏简化，`pageItems` 省略号）、progress、table、kbd、separator、bead-image / pixel-icon、work-card（作品卡 / 设计卡外框 + BeadDots，容器查询）。内置文案进 `zh-CN.ts` 的 `ui`。
- 豆粒渲染：`src/lib/render/beads.ts`（drawPattern bead / flat、网格、板缝、色号、高亮；paintPatternCanvas / patternCanvas；keysPattern；空状态插画；colorUsage），输入为现有 `Pattern`；画布颜色放 `beadTokens.ts`（令牌文件，服务端缩略图可复用）。
- `/dev/ui`：照原型 `#/components` 24 个区块，生产环境 `notFound()`；示例图案由原型 `motifs.js` 移植（`src/app/dev/ui/motifs.ts`，豆色数据）。
- 护栏：`tests/unit/uiGuardrails.test.ts`（可扩展目录清单 `SCANNED`；禁十六进制 / rgb 字面量、调色板色、任意字号 / 圆角 / 阴影 / 颜色、内联字号圆角阴影；禁引用 legacy-ui 与旧类；核对 theme.css 层与 @source；规则自检）。`designSystem.test.ts` 的旧圆角护栏与「中文字面量」护栏排除新目录 / 开发页（前者由新护栏接管；开发页演示文案不进 zh-CN.ts，免得增大每页首屏 JS）。
- 工具：`.scratch/ui-rebuild/tools/shoot-kit.mjs`（原型 / 实现整页截图 + 区块坐标）、`compare-kit.py`（逐区块并排或上下叠放）、`probe-kit.mjs`（运行时 `<style>`、Tab 焦点圈定与归还、旧样式干扰计算样式比对）。

**CSP 核查**
- Base UI 只有两处会渲染 `<style>`：Select（alignItemWithTrigger）与 ScrollArea 的隐藏滚动条规则，走 CSPContext；`<script>` 只在 Tabs.Indicator / Slider.Thumb 显式 `renderBeforeHydration` 时出现。根布局包 `<CSPProvider nonce={x-nonce} disableStyleElements>`，隐藏滚动条规则在 theme.css 静态提供。`@base-ui/utils` 的 StoreInspector（调试工具，组件不引用）与 date-fns 的 CDN polyfill 不进包。lucide / cva / tailwind-merge / clsx / floating-ui / react-day-picker 无运行时样式注入。
- 开发环境逐个打开 Select、菜单、排序、筛选弹出层、搜索建议、弹窗、抽屉、Toast、Tooltip：MutationObserver 记录到的新增 `<style>` 只有 Next 开发工具自带的字体（`/about` 旧页面同样 32 条违规、同源 next-devtools），Base UI 为 0。
- 生产构建（`BEADHUE_E2E_BUILD=1 npm run build`）+ `next start`：`/dev/ui` → 404；`/about` `/help` `/login` 为严格 `style-src-elem 'self' 'nonce-…'`，无 nonce 的 `<style>` 0 个、样式违规 0；唯一一条违规是 zod 的 `allowsEval` 探测（script-src eval，已被 try/catch，重构前就有）。E2E 08 需要 PostgreSQL + 会话令牌，本机没有，未跑。

**验证**
- `npm run typecheck` / `npm run lint` / `npm run brand:check`：通过。
- `npm test`：231 文件，1755 通过、13 跳过；`e2eServerProcess.test.ts` 4 条在沙箱里连不上本地端口而失败，放开权限单独重跑 6/6 通过。新增 beads 11 条、组件 17 条、护栏 12 条。
- E2E（Chromium）`06-accessibility-responsive` + `01-auth-journey`：18 通过 / 6 失败 / 1 跳过；切到基线 3205da7 跑同一组，失败的就是同样 6 条（旧工作台选择器 `workspace-mobile-nav` / `workspace-sidebar` / `/app` axe scrollable-region），与本票无关。
- 浏览器核查（probe-kit）：弹窗 Tab 8 次焦点不离开弹窗（仅经过 Base UI 焦点哨兵）、Esc 后焦点回到触发器；Tooltip 悬停出现；去掉旧样式规则前后，`[data-ui]` 内全部元素 16 项计算样式在 1440 与 390（触屏）下差异 0。
- 截图对照：原型与实现在 1440 / 1024 / 768 / 390 / 350 整页截图并逐区块比对（`evidence/impl/01/`，未入库），无横向溢出；逐区块肉眼一致。

**与原型的有意偏差**
- `/dev/ui` 不带站点外壳（桌面顶栏、手机底栏属票 03）；手机顶栏只做「返回 + 标题」。
- 菜单在手机上仍是锚定弹出层（原型操作菜单 / 排序在手机是底部面板）：Base UI Menu 的项必须在 Menu 根里，底部面板版留给用到它的页面票按需用 Popover(sheetTitle) 组合。
- 建议面板样张锚定到「聚焦」搜索框（原型同），但由旁边按钮触发。
- 滑杆用 Base UI Slider（原型是原生 range + accent-color），轨道 4px、深墨拇指 16px，观感接近但不是原生外观。
- 开关禁用态只改文字颜色与光标，与原型一致；复选禁用加了浅底。
- 字距 `.01em`（按钮）、菜单项行高 1.3 取了最近的令牌（无字距、`leading-tight`），肉眼无差。

**遗留**
- 旧页面里 12 处 `rounded-sm/lg/xl` 与少量 `text-ink` / 状态色工具类会拿到新值（类名全局唯一，新层在后），出现在旧编辑器色块、分享链接框等处，随对应页面重做消失。
- ToastProvider 目前只包在 `/dev/ui`；票 03 外壳里挪到根布局。
- `react-day-picker` 已装未用（后台日期范围，票 10）。
- 后续新页面目录要同时登记到 `theme.css` 的 `@source` 与 `uiGuardrails.test.ts` 的 `SCANNED`；`data-ui` 只加在新界面区域上，不要包住旧页面内容（会让旧元素失去触屏 44px 下限）。
