# ADR-0027: 前端技术栈与 CSP 约束

- Status: accepted
- Date: 2026-09-24
- Related: ADR-0007（历史：`'unsafe-inline'`）, ADR-0008（请求级 nonce CSP）, ADR-0023（界面部分由本决策取代）, D64, D65

## Context

R15 要把用户端与管理后台整体重建到 `.scratch/ui-rebuild/prototype/` 的设计（D65）。重构前的界面由两层手写样式组成：
`globals.css` 约 3,200 行与 `beadhue.css` 约 4,200 行，控件来自 `react-aria-components` 的品牌化封装（D54）。
同一套类名在 `<button>` / `<a>` / `<label>` 上高度不同、未定义的类被多处引用（R13、R14 已记录的根因），
新页面每做一张都要再加一段全局样式，层叠冲突只能靠更高的特异性压住。

原型需要的是一套可组合的通用组件：弹窗在手机上变底部面板、菜单、选择器、弹出层、Toast、Tooltip、分段控件、
滑杆、复选 / 单选 / 开关、分页、表格、日期范围等，而且要满足三条既有约束：

1. 生产 CSP 不放宽（ADR-0008）：`script-src` 只认请求 nonce + `'strict-dynamic'`，`style-src-elem` 只认 `'self'` 与 nonce；
   `style-src-attr 'unsafe-inline'` 允许（React 的 `style` 属性与定位库需要），但**不能在运行时插入无 nonce 的 `<style>`**。
2. 所有界面文案集中在 `src/messages/zh-CN.ts`（D7）。
3. 首页、详情页首屏 JS 不高于重构前。

## Decision

1. **组件模式：shadcn/ui 式的源码组件，而不是组件库依赖。** 组件源码放 `src/components/ui/`，由我们自己维护；
   变体用 `class-variance-authority`，类名合并用 `clsx` + `tailwind-merge`（`cn()`），每个组件根带 `data-slot` 标记。
2. **行为原语：Base UI（`@base-ui/react`，锁定版本）。** 弹窗、抽屉（手机底部面板）、菜单、选择器、弹出层、Toast、
   Tooltip、Tabs、ToggleGroup、Slider、NumberField、Checkbox / Radio / Switch 均由它提供焦点陷阱与归还、键盘与读屏语义；
   样式全部由我们用令牌工具类写。图标统一 `lucide-react`（默认 20px、线宽 1.75）；后台日期范围用 `react-day-picker`，只用其静态 CSS。
3. **样式：Tailwind v4 设计令牌。** 令牌（颜色、字阶、圆角、阴影、间距、动效、断点）写在 `src/app/theme.css` 的 `@theme`，
   取自原型 `tokens.css`；组件与页面只用映射到令牌的工具类。组件与页面代码里不得出现十六进制 / `rgb()` 色值、
   调色板默认色、任意字号 / 圆角 / 阴影 / 颜色值与内联字号圆角阴影；画布颜色只能放在令牌文件
   （`src/lib/render/beadTokens.ts`、豆色数据文件等）。
4. **关闭 Base UI 的运行时 `<style>` 注入，改由 `theme.css` 静态提供。** 核查结果：Base UI 只有 Select
   （`alignItemWithTrigger`）与 ScrollArea 的隐藏滚动条规则会渲染 `<style>`，走 CSP 上下文；
   只有 Tabs.Indicator / Slider.Thumb 在显式 `renderBeforeHydration` 时渲染 `<script>`。根布局包
   `<CSPProvider nonce={x-nonce} disableStyleElements>`：nonce 只留给可选的预水合脚本，`<style>` 一律不插；
   隐藏滚动条规则写进 `theme.css`；Select 不开 `alignItemWithTrigger`；两处 `renderBeforeHydration` 不开。
   lucide、cva、clsx、tailwind-merge、floating-ui、react-day-picker 均无运行时样式注入。
   新增任何 Base UI 组件或第三方界面库，都要先确认它不插入 `<style>` / `<script>`，否则按 ADR-0008 拒绝，不放宽策略。
5. **新旧目录过渡与登记。** 旧组件整体移到 `src/components/legacy-ui/`（macOS 文件系统大小写不敏感，旧 `Button.tsx`
   与新 `button.tsx` 不能同目录），只供尚未重做的页面使用，新代码不得引用。过渡期两套 Tailwind 构建共存：
   新构建的工具类放最后一层 `ui`（`@layer theme, base, components, utilities, ui`）、不引入 preflight、
   与旧 `:root` 同名的令牌写在 `@theme inline`；`theme.css` 用 `source(none)` + 显式 `@source`，
   新界面的基础排版只作用于 `[data-ui]` 根（页面根与各弹层根）。**每新建一个页面或组件目录，必须同时登记到
   `theme.css` 的 `@source` 与 `tests/unit/uiScanned.ts` 的 `SCANNED` 清单**，否则工具类不会生成、护栏也扫不到。
   R15 票 13 删除 `legacy-ui/`、`beadhue.css`、旧组件类与 `react-aria-components` 后，`globals.css` 只留令牌、字体与极少量基础规则。
6. **护栏测试。** `tests/unit/uiGuardrails.test.ts` 扫描 `SCANNED` 清单：禁止第 3 条列出的写法、禁止引用 `legacy-ui`
   与旧样式类、核对 `theme.css` 的层顺序与 `@source` 登记，并对规则本身做自检（违规样例必须被拦住）。
   CSP 行为继续由生产运行时 E2E 验证（ADR-0008），不以单测替代。
7. **弹出层层级约定。** 弹窗与抽屉遮罩 z-80；Popover / Menu / Select 定位层 z-85（弹窗里直接用，不再各自抬层）；
   Tooltip z-88；Toast z-90。弹窗内需要拖动的区域加 `data-base-ui-swipe-ignore`，否则手机底部面板会把拖动当作下滑关闭。
   编辑器里成百个同类按钮不逐个包 Tooltip（每个都订阅媒体查询、建 Base UI 根），用原生 `title` 或单个委托提示。
8. **文案与服务端边界。** 组件内置文案进 `zh-CN.ts` 的 `ui` 段；cva 函数与其他普通函数若在 `'use client'` 文件里，
   服务端组件不能调用，给服务端用的常量与纯函数放在不带 `'use client'` 的模块。

## Consequences

- 样式从「全局类 + 层叠」变为「组件内令牌工具类」：同一组件在任何元素上尺寸一致，删除旧样式后不再有层叠冲突；
  代价是页面代码里的类名串变长，视觉一致性依赖令牌与护栏而不是评审记忆。
- 组件源码在仓库内，升级 Base UI 需要逐个组件核对行为与 CSP（第 4 条的核查要随版本重做）；锁定版本号正是为此。
- CSP 边界不变：生产仍只有带 nonce 的 `<style>` / `<script>`；开发环境 Next 自带工具的样式违规与本决策无关。
- 过渡期存在两套构建与两套组件目录，靠 `data-ui` 隔离；在票 13 删除旧层之前，旧页面里少量同名工具类会拿到新值，属已知现象。
- 新目录忘记登记会表现为「工具类不生效」或「护栏没扫到」，这是本方案最常见的失误，已写进实施指南与本 ADR。

## Rejected alternatives

- **继续用 `react-aria-components` 封装**：可访问性好，但它的组件样式与状态属性和原型的组件形态差距大，
  且保留它意味着两套原语并存；R15 以后删除它（D64）。
- **Radix UI（shadcn 默认原语）**：同样可行；Base UI 的抽屉（手机底部面板、下滑关闭、虚拟键盘）与 CSP 开关
  （`CSPProvider disableStyleElements`）更贴合本项目「手机底部面板 + 严格 CSP」的组合。
- **CSS-in-JS（运行时生成样式）**：运行时插入 `<style>` 直接违反 ADR-0008，逐个补 nonce 等于把策略放宽到组件层。
- **放宽为 `style-src 'unsafe-inline'`**：最省事，但会让 ADR-0008 收回的那层纵深防御在样式注入上失效（ADR-0007 的教训）。
