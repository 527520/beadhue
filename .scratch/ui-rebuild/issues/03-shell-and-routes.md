# 03 站点外壳、导航、搜索与路由

Status: ready-for-agent
Completion: complete
Blocked by: 01、02

先读 [实施指南](../implementation-guide.md)。原型：`prototype/js/app.js`、`prototype/styles/layout.css`、`prototype/js/ui.js`（登录弹窗、弹出层、提示）。

## 范围

1. **桌面顶栏**（`SiteHeader` 重写）：标志（2×2 豆粒 + 字标）｜文字导航「发现 / 创作 / 我的」+ 深墨下划线｜胶囊搜索（聚焦出建议面板：最近搜索（本机）、大家在搜、匹配图纸与作者，接 `search/suggest`；回车进入 `/?q=`；`/` 快捷键）｜「上传图片」按钮（页面可声明降为描边或隐藏，规则同原型 `topbarCta`；创作页不显示）｜头像菜单（原图空间用量、我的主页、我的设计、色板、账号设置、帮助、隐私、管理员入口、退出）；未登录显示「登录」按钮。滚动后出现发丝边。768–1023 收紧规则照原型。
2. **手机**：页面自定义顶栏（默认：标志 + 搜索 + 通知铃铛占位 / 头像）；底栏「发现 · ＋ · 我的」，中间主色圆钮；二级页（详情、编辑器）隐藏底栏；安全区。
3. **统计同意浮卡（D69）**：替换现有横幅位置与样式，逻辑与接口不变。
4. **页脚**、**跳到主内容**（聚焦主区域，不触发路由）。
5. **登录弹窗**：站内需要登录的操作（点赞、下载、举报、评论、公开等）弹出登录弹窗（手机底部面板），字段级错误；登录成功后留在原页面并继续原操作。`/login` 等账号页按同一视觉改版（居中卡片），注册、找回密码、重置、邮箱验证流程与文案逻辑不变。
6. **路由（D66）**：新增 `/me` 布局与子路由骨架（内容由票 06 填）、`/u/[publicAuthorId]` 骨架（票 05 填）；重定向 `/community` → `/`、`/designs` → `/me`、`/community/mine` → `/me/public`、`/account` → `/me/settings`、`/create` → `/app`（保留查询参数）；更新站内所有链接、sitemap、robots、`proxy.ts` 的节流路径表。
7. 旧 `SiteHeader`、`HomeAuthNav`、侧栏等外壳组件不再被引用（文件留给票 13 删除）。
8. **Toast 容器**移到根布局（票 01 目前只包在 `/dev/ui`），全站可用。
9. **E2E 端口可配置**：`tests/e2e/serverProcess.ts`、`globalSetup.ts`、`playwright.config.mts` 支持环境变量 `E2E_PORT`（默认 3100），以便后续票在隔离工作树里并行跑 E2E；补一条单元测试。

## 验收

- 桌面 1440 / 1024 / 768 与手机 390 / 350 的顶栏、底栏、搜索面板、头像菜单、登录弹窗与原型一致。
- 重定向有测试；E2E 01（账号流程）及依赖导航的用例更新并通过（Chromium）。
- 门禁全绿。

## Comments

### 实施记录（2026-09-23，提交 80d7c2f … 10ebe37）

**做了什么**
- 外壳 `src/components/shell/`：`SiteShell`（页面各自声明 `nav` / `topbarCta` / `tabbar` / `footer` / `mobileTop` / `account` / `consent` / `query` / `searchExtras` / `onNavigate`，对应原型 screen 约定）；桌面顶栏（2×2 豆粒标志、文字导航 + 深墨下划线、胶囊搜索、上传图片、头像菜单 / 登录；滚动发丝边；768–1023 收紧：去 BEADHUE、搜索撑满、上传只剩图标 + Tooltip、隐藏「/」）；手机顶栏（默认 标志 + 搜索 + 头像/登录，发现页为 标志 + 搜索 + 通知铃铛占位；页面可自定义，提供 `MobileTopBack/Title/Spacer`）；底栏「发现 · ＋ · 我的」（安全区，二级页不渲染）；页脚；统计同意浮卡（D69，逻辑沿用 AnalyticsConsent，保存后 Toast「偏好已保存」）；跳到主内容（聚焦 #main，仍是片段链接）。
- 搜索：桌面建议面板不走 portal（紧跟输入框，Tab 可进入建议项）：空关键词为最近搜索（本机 `beadhue:recent-searches`，≤6）+ 大家在搜（`search/suggest?q=`），输入后防抖取匹配图纸 / 作者；回车 `/?q=`；「/」快捷键。手机点放大镜在外壳内切换为全屏搜索页（主内容隐藏、底栏保留，原型 #/search）。
- 头像菜单：姓名邮箱、原图空间（打开时取 `/api/originals/usage`）、我的主页、我的设计、色板、账号设置、帮助中心、隐私与数据、管理后台（审核员 / 管理员）、退出登录（Toast + 刷新）。
- 登录弹窗 `LoginDialogProvider`（根布局，手机底部面板）：`useLoginDialog()`、`useRequireLogin(action)`（已登录直接做，否则登录成功后继续原操作）、`LoginLink`（旧页面「登录后继续」入口：弹窗登录后 `router.refresh()`）。表单 `LoginForm` 与 /login 共用，错误挂在字段下；未验证邮箱在弹窗里提示去账号设置。
- 账号页（登录、注册、找回 / 重置密码、邮箱验证）改为 SiteShell + 居中卡片（`AuthShell`），新组件重写；流程与文案不变，错误改挂到对应字段（注册的 credentialsInvalid 按 zod 首个出错字段挂），其余表单级错误在提交按钮上方（`FormAlert`）。
- 根布局：`AppProviders`（ToastProvider、登录弹窗、同意恢复、偏好迁移、原图续传），不再包 `.beadhue-ui`；`viewportFit: cover`、themeColor 白。`useToast` 无 Provider 时静默；`/dev/ui` 用根布局的 Toast。
- 登录态 `useAuthStatus`：页面级快照（useSyncExternalStore），切页不闪；返回值增加 `publicAuthorId`、`role`；新增 `ensureAuthStatus()`。
- 旧页面只换外壳：内容包在 `LegacyScope`（`.beadhue-ui[data-theme=candy]`）里，原 SiteHeader 的标题行改用 `LegacyPageHeading`；工作台编辑中隐藏手机顶栏 / 底栏 / 页脚 / 浮卡，桌面顶栏保留到票 08，外壳跳转经 `onNavigate` 先保存。
- 路由（D66）：`next.config` redirects（`src/lib/routes/legacyRedirects.ts`）308：/community → /、/designs → /me、/community/mine → /me/public、/account → /me/settings、/create → /app，查询参数保留。/me 布局骨架（外壳 + 链接式页签；设置页无页签、手机顶栏为返回 + 标题）与 /me、/me/public、/me/likes（第一页喜欢的图纸）、/me/palettes、/me/settings；/palettes 公开页；/u/[publicAuthorId] 骨架（头像、名字、官方徽标、三项统计、作品网格，不存在 404）。旧页面主体移到 `DesignsView` / `CommunityMineView` / `AccountSettingsView` / `PalettesView`。
- 站内链接、sitemap（去掉 /community）、robots（禁 /me）、proxy 节流表（/、/community/<uuid>、/u/<id>、sitemap、robots）、登录默认回跳 /me、允许回到发现页 /（含参数）、页面浏览统计归类。
- E2E 端口：`E2E_PORT`（默认 3100，非法值报错）驱动 dev 服务、Playwright baseURL、`BASE_URL`；dev 日志按端口分文件；去掉用例里写死的 3100。
- 组件补充：`Field` 的 `labelAside`、错误 `role="alert"`，`FormAlert` / `FormNotice`；`MenuLinkItem`；SearchField 有值时清除与快捷键并存（原型如此）；令牌 `--shadow-fab`、`--blur-md` 与工具类 `page-container(-wide)`、`h-tabbar-safe`、`pb-tabbar-safe`、`bottom-above-tabbar`、`min-h-page`。

**验证**
- `npm run typecheck` / `npm run lint` / `npm run brand:check`：通过。
- `npm test`：244 文件，1842 通过、13 跳过、0 失败（新增外壳单测 10 条、重定向 3 条、统计归类 1 条、E2E 端口 3 条）。
- E2E Chromium：01 全部 5 条通过（含新增「旧路由 308 保留参数」「登录弹窗后留在原页」）；06：26 通过 / 3 失败，均为基线失败（项目操作栏、移动工作台两条的上传后需点「生成图纸」，/app 的 `step-ticket-nav` axe）；原基线里的 `workspace-mobile-nav` / `workspace-sidebar` 两类失败已修复。另跑 04/11/12/13/14/16/17×2/18 共 9 个文件，与 397f326 基线（隔离工作树同一组，31 条失败）逐条对比，本票引入的 7 条回归已全部修掉并重跑通过；剩余失败与基线相同（旧工作台流程、旧发现页选择器，归票 04/07/08）。
- 视觉：`tools/shoot-shell.mjs proto|impl` 在 1440/1024/768/390/350 截取顶栏、游客顶栏、搜索面板（空 / 输入）、头像菜单、登录弹窗与字段错误、手机登录底部面板、统计浮卡、手机全屏搜索页、我的 / 设置 / 详情 / 创作 / 作者页顶栏、页脚（`evidence/impl/03/`，未入库），逐张与原型对照一致。

**与原型的有意偏差**
- 手机全屏搜索页的「最近搜索」也给「清空」（原型只有桌面有）；「按类目看看」留 `searchExtras` 插槽给票 04（需要类目像素图标数据）。
- 登录表单「密码」标签与「邮箱」同样式（原型选择器漏掉，字重字号不一致）。
- 通知铃铛是占位：游客打开登录弹窗，登录后显示未读圆点、点开提示未读条数；弹出层由票 11 做。
- 手机发现页顶栏按原型没有登录入口（游客从「我的」或需要登录的操作进入登录）。
- 编辑中的工作台桌面仍显示站点顶栏（原型为独立工作区），等票 08 的编辑器顶栏。
- 旧页面内容在 `.beadhue-ui` 里保持原样（纸色底、旧 `.beadhue-ui` 移动端底部留白），随各页重做消失。

**遗留**
- 06 / 04 / 11 / 12 / 13 / 16 / 17 / 18 中与旧工作台、旧发现页相关的基线失败，由重做对应页面的票修。
- 404 / 错误页暂无站点外壳（套 LegacyScope 保持原样），票 12 处理。
- /u 与 /me/likes 只显示第一页；分页、分享图、卡片点赞由票 05 / 06 补齐。
