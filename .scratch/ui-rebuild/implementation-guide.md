# R15 实施指南（每张票都先读）

仓库：`/Users/wuqian/project/doupu/doupu`，分支 `feat/beadhue-ui-rebuild`。产品「豆色绘 / BeadHue」：Next.js 16（App Router，读 `node_modules/next/dist/docs/` 里的对应指南再写代码）+ React 19 + TypeScript + Drizzle + PostgreSQL（开发 / 测试用 PGlite）。

## 必读

1. [spec.md](spec.md)：目标、不变量、决策 D64–D72、路由、接口、门禁。
2. [design.md](design.md)：令牌、组件规范、逐屏设计。
3. 你这张票对应的原型：`prototype/js/screens/*.js`、`prototype/styles/screens/*.css`，以及共享的 `prototype/styles/{tokens,base,components,layout}.css`、`prototype/js/{ui,beads,data}.js`。**原型是验收基准**：结构、层级、文案、间距、状态、响应式行为都照它实现。原型里的模拟数据换成真实接口。
4. 验收截图：`evidence/prototype-final/*.png`（桌面 1440 与手机 390）。更多状态（弹层、菜单、抽屉、未登录等）用 `tools/shoot-prototype.mjs`、`shoot-states.mjs`、`shoot-detail.mjs`、`shoot-create-editor.mjs`、`shoot-me.mjs` 从原型重新生成到 `evidence/prototype/`（该目录不入库）。
5. `CONTEXT.md` 与 `docs/adr/`（业务合同），`AGENTS.md`。

## 查看原型

在仓库根目录 `python3 -m http.server 4180`，打开 `http://127.0.0.1:4180/.scratch/ui-rebuild/prototype/index.html#/…`（评审页 `review.html`）。

## 运行应用与种子数据

```bash
ulimit -n 65536
PORT=3100 NEXT_TELEMETRY_DISABLED=1 DATABASE_URL= PGLITE_DATA_DIR= BEADHUE_E2E_SEED=1 BEADHUE_E2E_BUILD=1 \
RATE_LOGIN=1000 RATE_REGISTER=1000 RATE_TOKEN=1000 RATE_COMMUNITY_WRITE_USER_HOUR=10000 RATE_COMMUNITY_WRITE_IP_HOUR=10000 \
RATE_PUBLIC_READ_IP_HOUR=20000 RATE_PUBLIC_PAGE_IP_MINUTE=5000 RATE_ORIGINAL_USER_MINUTE=1000 RATE_ORIGINAL_USER_HOUR=10000 \
RATE_ORIGINAL_IP_MINUTE=1000 RATE_ORIGINAL_IP_HOUR=10000 RATE_SYNC_WRITE=10000 LOGIN_FAILURE_THRESHOLD=1000 \
node node_modules/next/dist/bin/next dev -p 3100 -H 127.0.0.1
```

内存库，重启即清空。种子账号：`e2e-admin@example.com` / `e2e-user@example.com` / `e2e-moderator@example.com`，密码 `E2e-pass-123!`。`node .scratch/ui-rebuild/tools/capture-current.mjs seed` 可补 12 件样例作品、标签、点赞与 4 份云端设计（脚本内有接口用法，可按新接口调整）。E2E 自己会在 3100 起服务，跑 E2E 前先停掉手动起的服务。

沙箱提示：开发服务、Playwright、端口访问需要 `required_permissions: ["all"]`；Playwright 需 `PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright"`；npm 走公司镜像需要 `full_network`，并用 `--cache ./.npm-cache`；`npm install` 若只改写了锁文件无关元数据（如删掉 `libc` 字段）要还原。

## 实现约定

- 组件：`src/components/ui/` 下的 shadcn 风格组件（票 01 建立）。页面只组合这些组件与 Tailwind 工具类；颜色、字号、圆角、阴影、间距一律用令牌（`bg-bg-subtle`、`text-ink-3`、`rounded-lg` 等映射到 `@theme`），不写十六进制、不写任意值。
- 图标：`lucide-react`，默认 20px、线宽 1.75。纯图标按钮必须有 `aria-label`，桌面配 Tooltip。
- 每视区最多一个主按钮；选中态深墨；禁用不用半透明；错误挂在字段下；空状态主按钮唯一。
- 响应式：移动优先；断点只用 sm/md/lg/xl/2xl；卡片内部用容器查询。
- 文案进 `src/messages/zh-CN.ts`，照原型措辞；动作命名前后一致；单位「颗」。
- 旧组件与旧样式：本票替换掉的页面不再引用旧类；旧文件在票 13 统一删除，删除前不要让新代码依赖它们。
- 数据库变更：新迁移编号从 0020 起，带 down 文件与 drizzle 快照；更新 `db/schema.ts`；PGlite 集成测试覆盖。
- 测试：新增 / 修改的组件与接口要有单元或集成测试；受影响的 E2E 同步改（选择器优先用 role 与可见文案）。

## 验收（提交前自己跑完）

1. `npm run typecheck && npm run lint && npm run brand:check`
2. `npm test`（或至少受影响的 vitest 项目；最后一张票跑全量）
3. 受影响的 E2E：`npx playwright test tests/e2e/<文件> --project=chromium`
4. 视觉对照：起应用，用 Playwright 在 1440 / 1024 / 768 / 390 / 350 截取你负责的页面和状态，与原型同状态截图并排检查（可参考 `tools/shoot-prototype.mjs`、`tools/shoot-final.mjs` 的写法），用 Read 工具亲自看图，修到一致。截图放 `.scratch/ui-rebuild/evidence/impl/<票号>/`。
5. 在票文件末尾 `## Comments` 下写实施记录：做了什么、验证结果（命令与数字）、与原型的有意偏差及原因、遗留问题。把票头 `Completion:` 改为 `complete`。

## 后续票须知（票 01、02 完成后补充）

- **新组件**在 `src/components/ui/`（shadcn 风格，Base UI 原语）；**旧组件**已整体移到 `src/components/legacy-ui/`，只供尚未重做的页面使用，票 13 删除。新代码不要 import `legacy-ui`。
- **令牌与样式**：`src/app/theme.css` 是新的 Tailwind 构建（最后一层 `ui`）。新建页面或组件目录时，必须同时登记到 `theme.css` 的 `@source` 和护栏测试 `tests/unit/uiGuardrails.test.ts` 的 `SCANNED` 清单。
- **`data-ui`**：只加在新界面区域的根元素上（开启新基础排版并隔离旧全局规则）；不要包住旧内容。
- **组件总览** `/dev/ui`（仅非生产）是视觉对照基准；豆粒渲染在 `src/lib/render/beads.ts`（`<BeadImage>`、`<PixelIcon>`），画布颜色在 `beadTokens.ts`。
- **CSP**：Base UI 的运行时样式已由根布局的 CSPProvider 关闭并由 `theme.css` 静态提供；新增 Base UI 组件时确认不插入 `<style>` / `<script>`（Tabs.Indicator、Slider.Thumb 不要开 `renderBeforeHydration`）。
- **接口**：票 02 的全部新接口与变更接口的请求 / 响应示例在 `issues/02-backend-apis.md` 的 Comments；缩略图地址带 `?v=2`；详情 `colorUsage` 未登录为 null；列表登录时每项带 `liked`。
- **E2E 基线**：合入 01、02 后 Chromium 上有 6 条 E2E 在基线就失败（旧工作台选择器与 `/app` 的 axe 问题），重做对应页面的票负责修复；不要把它们当成你的回归，也不要跳过。
- **并行**：部分票会在隔离工作树里并行。E2E 端口用环境变量 `E2E_PORT`（票 03 起支持，默认 3100），开发服务端口自选（3101+），避免和别的代理冲突。隔离工作树的 `node_modules` 不能是指向工作树外的软链（Turbopack 拒绝），用 `cp -cR`（APFS 克隆，十几秒）。

## 后续票须知（票 03 完成后补充）

- **外壳**：页面自己渲染 `<SiteShell nav=… topbarCta=… tabbar=… footer=… mobileTop=…>`（`src/components/shell/site-shell.tsx`，约定同原型 screen 的 nav / tabbar / topbarCta / mobileTop）。它渲染唯一的 `<main id="main">`，页面内不要再写 `<main>`；外壳各部分自带 `data-ui`，页面的新界面根自己加 `data-ui`。手机自定义顶栏用 `MobileTopBack` / `MobileTopTitle` / `MobileTopSpacer`；工作台类页面用 `onNavigate(href)` 拦截外壳里的跳转。
- **旧内容**：尚未重做的页面把旧内容包在 `LegacyScope`（`src/components/layout/`）里，旧标题行用 `LegacyPageHeading`；重做页面时去掉这两层。旧页面主体已移到 `DesignsView`、`CommunityMineView`、`AccountSettingsView`、`PalettesView`，`/me/*` 与 `/palettes` 只是薄壳。
- **登录**：需要登录的操作用 `useRequireLogin()(action)`（登录弹窗成功后继续原操作）；只要一个入口按钮用 `useLoginDialog()?.open({ onSuccess })`；旧式「登录后继续」链接用 `LoginLink`。登录态 `useAuthStatus()` 带 `role`、`publicAuthorId`；单测里连续渲染要 `resetAuthStatusCache()`。
- **提示**：`useToast()` 全站可用（根布局 ToastProvider），无 Provider 时静默；不要再自己包 ToastProvider。
- **搜索**：`SiteShell` 的 `query` 回填顶栏搜索框（发现页传 `q`）；`searchExtras` 放进手机全屏搜索页（票 04 的「按类目看看」）。建议数据 `useSearchSuggest`，最近搜索 `rememberSearch` / `useRecentSearches`。
- **新目录登记**：护栏目录清单移到 `tests/unit/uiScanned.ts`（uiGuardrails 与 designSystem 共用），同时登记 `src/app/theme.css` 的 `@source`。已登记：components/{ui,shell,auth,works}、app/{me,u,login,register,forgot-password,reset-password,verify-email,dev}。
- **服务端组件**：`buttonVariants()` 等 cva 函数在 `'use client'` 文件里，服务端组件不能调用，要么放进客户端小组件，要么渲染组件本身。
- **路由**：旧路由重定向表在 `src/lib/routes/legacyRedirects.ts`；登录默认回跳 `/me`，允许回到 `/`；E2E 登录后的地址按新路由写。
- **统计同意**：浮卡文案「不同意」「同意统计」，地标名「匿名使用统计」；E2E 关闭它用 `getByRole('button', { name: '不同意', exact: true })`。
- **截图**：`tools/shoot-shell.mjs proto|impl [状态…]`（实现侧 `IMPL_BASE`、登录态由 `shoot-shell-login.mjs` 生成）可作为各票截图脚本的起点。

## 提交

每张票完成后本地提交一次（可分几个提交），信息用中文，如 `feat(ui): R15-01 设计令牌与组件底座`。只 `git add` 与本票相关的文件；**不要**提交 `.scratch/site-ux/*.png`、`.scratch/ui-polish-2026/evidence/`（用户已有改动）和 `.scratch/ui-rebuild/evidence/` 下的截图（体积大）。不 push，不建 PR。

## 后续票须知（票 07 完成后补充）

- **/app 路由**：无 `id` 是创作入口，不恢复任何设计（`?new=1` 同义）；新设计（生成首版、空白画布、导入）进入编辑器时工作台用 `showDesignQuery(id)` 把地址换成 `/app?id=`，刷新回到同一份。编辑器里「重新上传 / 新建」回入口用 `clearDesignQuery()`。单测恢复设计要先 `history.replaceState(null, '', '/app?id=…')`。
- **首版生成**在「新建图纸」弹窗里完成：`firstDrawingRef` 为真时 `applyImageCrop` 不切 `step`，`regenerate` 的 onSuccess 才进入 `workspace`；取消生成留在弹窗。票 08 重做编辑器时不要在首版提交前渲染编辑器。
- **入口 / 编辑器分界**：`Workbench` 渲染在 `step === 'upload' || (step === 'crop' && !pattern)` 时早返回新入口（`CreateEntry` + 弹窗），其余仍是旧工作台（`LegacyScope`）。票 08 只需替换后半段；已有图纸时的重新裁剪仍是旧 `CropDialog`（`step === 'crop' && pattern`）。
- **共用选择器**：`src/components/create/choice-pickers.tsx`（`PalettePicker` / `SpecPicker` / `PaletteBand`）与 `palette-choices.ts`（`buildPaletteChoices(cloud)`、`specChoices`、`fitSpec`、`paletteSizes`）按原型 catalog.js 做，编辑器的换色板、规格菜单直接复用；选项值约定 `builtin:<id>` / `custom:<id>`，工作台 `draftFromChoice()` 把它转成生成草稿。
- **弹出层层级**：`Popover` / `Menu` / `Select` 统一 z-85，高于弹窗与抽屉遮罩（z-80），弹窗里直接用即可（合并票 10 时去掉了票 07 的 `raised`）；提示条 z-90。弹窗内需要拖动的区域加 `data-base-ui-swipe-ignore`，否则手机底部面板会把拖动当成下滑关闭。
- **预览 Worker**：需要实时预览时用 `createGenerateWorkerClient()` 另起一个实例（见 `use-pattern-preview.ts`），不要复用工作台的 `runGenerate` 单例（latest-only，会取消正在进行的真实生成）。
- **E2E**：上传后要在弹窗里生成，用 `uploadAndGenerate(page, file)` 或 `uploadFile` + `generateFromDialog(page)`；入口主按钮名是「选择图片」（exact），文件输入仍是「图片文件选择器」。首页已无落区，E2E 从顶栏「创作」进入 `/app`。
- **开发服务**：同一工作目录里 `next dev` 只能起一个实例，跑 E2E（3100）前要先停掉手动起的 3101。

## 后续票须知（票 04 完成后补充）

- **作品卡**：公开作品一律用 `CommunityWorkCard`（`src/components/works/community-work-card.tsx`，带可直接点的喜欢、徽标、容器查询元信息）和 `WorkGrid` / `WorkCardSkeleton`（2/3/4/5/6 列）；一页作品的简单网格用 `SimpleWorkGrid`。喜欢逻辑在 `useWorkLike`（未登录弹登录，成功后继续并刷新页面）。
- **发现页地址**：拼 `/` 的链接用 `discoverHref(state, patch)`（`works/discover/discover-state.ts`，服务端也可用）；详情页面包屑「发现 / 动物」链到 `discoverHref(readDiscoverState({}), { cat: '动物' })` 即 `/?cat=动物`。
- **类目图标**：`tagIconPattern(parseTagIcon(tag.icon))` → `<PixelIcon>`（`src/lib/render/tagIconArt.ts`，豆色数据文件，已加入护栏 TOKEN_FILES）；后台标签管理的图标预览可直接复用。
- **客户端文件里的普通函数服务端不能调用**（不止 cva）：给服务端页面用的常量 / 纯函数放在不带 `'use client'` 的模块。
- **E2E 与手动开发服务不能同目录并存**：Next 16 检测到同一目录已有 `next dev` 会拒绝再起（E2E 报「dev server did not become ready」），跑 E2E 前先停掉手动服务。开发服务首次编译某个 API 路由可能整页重载并打断进行中的请求，E2E 里第一次调用前可先 GET 预热。
- **手机顶栏**：`MobileTopbarFrame` 现在是 `<header>`（banner 地标，与桌面顶栏按宽度二选一显示），页面自定义的手机顶栏内容无需再包地标。

## 后续票须知（票 08 完成后补充）

- **组件拆分**：编辑器 UI 全在 `src/components/editor-workspace/`（见票 08 实现记录）。`EditorWorkspace` 只收 props，不碰存储与生成；业务回调都来自 `Workbench`。画布编辑事务在 `useEditorDocument`，相机在 `useEditorViewport`，几何 / 缩放档 / 颜色文案等纯函数在 `editor-model.ts`（可单测）。
- **模式切换入口**：顶栏「编辑 | 跟拼」分段（`role=group name=模式`，按钮 `aria-pressed`）→ `onModeChange`，由 `Workbench` 的 `tab` 状态驱动（`mode={tab === "stitch" ? "stitch" : "edit"}`、`onModeChange={setTab}`）；跟拼内容由 `stitchView` prop 传入（目前是旧 `StitchView` 包在 `LegacyScope`）。票 09/后续重做跟拼时替换这个 prop 即可。
- **手机布局挂载点**：`Workbench` 里 `if (!narrow && pattern)` 分支渲染 `EditorWorkspace`（`narrow = useIsMobile()`，<768）；手机仍走其后的旧工作台。票 09 做手机编辑器时在这里加 `narrow` 分支，复用 `useEditorDocument` / `EditorCanvas`（已支持触控：精确落笔松手提交、双指缩放、移动超阈值转平移）和各面板组件；`notifyUndoable` 目前只在非手机时弹提示条。
- **E2E 辅助**（`tests/e2e/helpers.ts`）：`beadsText(n)`（画布读屏摘要「共 N 颗」，是 sr-only，用 `toBeAttached`）、`openPanelTab`、`recropButton` / `openRecrop`、`chooseEditorMenu(page, '导出'|'分享'|'更多', 项)`、`waitSaved`、`modeButton`。项目文件输入「项目文件选择器」、原图输入「原图文件选择器」常驻，可直接 `setInputFiles`。
- **性能**：编辑器里成百个同类按钮不要逐个包 `Tooltip`（每个都订阅 media query、建 Base UI 根，开发服务上会越过 03 的 100ms 长任务门禁），用原生 `title` 或单个委托提示。

## 后续票须知（票 05 完成后补充）

- **详情页组件**在 `src/components/works/detail/`：`PatternViewer`（可复用的只读图纸查看器，`source` 为完整图纸或服务端大图）、`ActionMenu`（桌面菜单 / 手机底部面板的操作菜单）、`ReportDialog`（作品 / 评论举报）、`copyText`、`relativeTime` / `formatCount`（`detail-format.ts`，服务端可用）。
- **画布颜色**：详情查看器与分享图的颜色在 `beadTokens.VIEWER_TOKENS`，叠加层（网格、板块编号、色号）在 `lib/render/viewer.ts`，画布字体常量 `CANVAS_FONT_*`。
- **评论接口**：`GET /api/community/works/:id/comments?order=desc` 最新在前，游标带方向，不能与升序游标混用。
- **需要登录后继续的操作**：`ensureAuthStatus()` 记下原登录态 → `useRequireLogin()(action)`，原来是游客就 `router.refresh()` 再执行；依赖登录后才有的数据（如图纸）时记一个待办标记，等新 props 到了再执行（见 `DetailView` 的下载）。不要给整页加 `key={loggedIn}`，会丢掉待办。
- **Playwright**：`aria-disabled="true"` 的按钮会被判为不可点，测试锁定态点击要 `force: true` 或只断言属性。
- **E2E 顺序依赖**：`12` 整文件连跑时，前面投稿 / 引用用例成功后审核队列多出项目，后台两条用例会失败（单独跑通过）。

## 后续票须知（票 06 完成后补充）

- **「我的」上下文**：`/me` 布局在服务端读登录者与统计，页面里用 `useMe()`（`src/components/me/me-context.tsx`）拿 `viewer`、`stats`、`refreshStats()`；没有 Provider 时按游客处理。
- **更多操作菜单**：`ActionMenu`（`src/components/me/action-menu.tsx`）桌面锚定菜单、手机底部面板（标题为对象名），动作延后一拍执行，弹窗关闭时焦点能回到「…」；单选菜单用 `ChoiceMenu`，确认弹窗用 `ConfirmDialog`（`locked` 用于结果未确认、只能重试的写操作）。
- **按需挂载的弹窗**（`{open ? <Dialog open /> : null}`）关闭即卸载，Base UI 来不及归还焦点：打开时记下入口元素，关闭后手动 focus（见色板页 `remember` / `restore`）。
- **设计缩略图**：已同步设计直接用 `designThumbnailUrl(id, revision)`（`lib/community/thumbnailUrl.ts`，浏览器可用），不必改同步层结构；未同步用本机图纸 `<BeadImage>`。
- **E2E 选择器**：设计卡 `[data-slot="design-card"]`，整卡链接名「打开「名称」（状态）」；公开作品卡 `[data-slot="own-work-card"]`；更多操作按钮名「「名称」的更多操作」，菜单项为 `menuitem`。
- **新接口**：`GET /api/me/sessions`、`POST /api/me/sessions/revoke-others`、`GET /api/originals/designs`（示例见票 06 Comments）。

## 后续票须知（票 11 完成后补充）

- **通知铃铛**：`NotificationBell`（`src/components/notifications/`）由外壳自己放：桌面顶栏「上传图片」左侧（`account` 为真且已登录），发现页手机顶栏（`mobileTop="discover"`，`sheet` 变体开底部面板）。游客不渲染铃铛，发现页手机顶栏的铃铛位回落为「登录」。页面不要再自己放铃铛；别的手机顶栏要铃铛时用 `<NotificationBell sheet />`。
- **未读数**：`useUnreadCount(email)` 是页面级共享仓库（两个铃铛只发一次请求），挂载（每页各自渲染 SiteShell，换页即重新挂载；不用 `usePathname`，免得各测试的 `next/navigation` mock 都要补）、窗口聚焦 / 标签页回到前台时刷新，3 秒内的重复触发合并；别处改了通知状态可调 `setUnreadCount(n)` / `refreshUnreadCount({ force: true })`。单测连续渲染要 `resetUnreadStore()`（和 `resetAuthStatusCache()` 一起）。
- **跳转约定**：通过 / 恢复 → `/community/<workId>`；新评论 → `/community/<workId>#comment-<commentId>`（与后台举报「公开页」同一锚点）；未通过 / 下架 → `/me/public`。**票 05 重做详情时评论项保留 `id="comment-<id>"`，评论是客户端加载的话，加载完按地址里的 hash 滚到那一条**；票 06 的 `/me/public` 要能看到驳回原因。
- **空状态插画**：`EmptyState kind="notifications"`（豆粒金铃铛，`beads.ts` 的 ART）。
- **E2E**：铃铛可访问名称是「通知」或「有 N 条未读通知」，徽标 `[data-slot="unread-badge"]`，面板是名为「通知」的 dialog；打开即把露出的条目标为已读，断言未读数要在打开之前做。用例 `tests/e2e/19-notifications.spec.ts` 经接口投稿、后台界面审核。
- **开发服务**：隔离工作树里长时间运行的 `next dev` 偶尔会对已存在的 API 路由返回 HTML 404（路由表过期），重启即恢复；看到「路由存在却 404、响应是 HTML」先重启再排查。

## 后续票须知（票 12 完成后补充）

- **文章版式**：静态说明类页面用 `src/components/pages/article.tsx` 的 `ArticlePage`（720px 窄栏 `max-w-article`、eyebrow + title-1 + 导语、三项以上自动出目录：≥1280 左侧吸顶，更窄为可展开「本页目录」）+ `ArticleSection`（锚点 id、title-2、让出吸顶顶栏）+ `ArticleText`；正文链接用 `articleLink`（常显下划线，axe `link-in-text-block` 要求）。长串（哈希、邮箱）已由 `wrap-anywhere` 兜住。
- **整页空状态**：404、错误边界、失效链接用 `StatePage`（`src/components/pages/state-page.tsx`，内部是 `EmptyState page`：h1 + title-2 + 大号豆粒插画）；链接按钮用 `StateLink`（服务端页面可直接渲染）。豆粒插画新增 `lost`（问号）、`broken`（叹号）。这类二级整页 `tabbar={false}`、`topbarCta="secondary"`，视区只留一个主按钮。段级 `not-found.tsx` 仿 `src/app/s/[token]/not-found.tsx`。
- **错误边界**：Next 16.3 起用 `retry` 属性（会重新取数），不要再用 `reset`；上报运行日志统一调 `reportClientError(error, fallback)`（`src/components/pages/report-client-error.ts`），站点与后台错误边界都已接入。`global-error.tsx` 拿不到样式表，只能内联样式（不在护栏扫描内）。
- **只读分享页**：`ShareView` 复用详情页 `PatternViewer`（完整图纸，色号 / 方格不锁）与制作卡导出的 `Stat`、`ColorList`；清单用 `summarizePatternColors`（与详情同口径，单位「颗」）。分享时间取 `design_shares.created_at`（服务端格式化）。令牌校验、浏览计数、noindex 未改。
- **统计偏好**：隐私页的新控件 `ConsentPreferences` 复用 `useAnalyticsPreference` / `chooseAnalyticsConsent`，同意按钮文案「同意匿名统计」（E2E 08 依赖）；账号设置页若也要放偏好，直接复用它。旧 `AnalyticsConsentSettings` 已无页面引用，票 13 删除。
- **首次引导**：`OnboardingGuide` 已删除，三步内容并入帮助页「三步上手」（`HelpSteps`，豆粒示例图）；`zhCN.onboarding.dismiss` 已无引用。
