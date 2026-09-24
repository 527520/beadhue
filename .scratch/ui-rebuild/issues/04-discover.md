# 04 发现页、搜索结果与作品卡

Status: ready-for-agent
Completion: complete
Blocked by: 01、02、03

先读 [实施指南](../implementation-guide.md)。原型：`prototype/js/screens/discover.js` + `styles/screens/discover.css`；截图 `prototype-final/01–04`。

## 范围

- `/`：吸顶像素类目条（「全部」「精选」+ 后台设为 `featured` 的标签，按 `sortOrder`，图标用 `icon` 字段渲染 `<PixelIcon>`，无图标时用默认豆粒图标）；右端「筛选」（弹出层 / 手机底部面板：尺寸、颜色数、制作规格、发布时间，底部「清除全部」+「显示 N 张图纸」实时计数）与排序菜单（推荐 / 最新发布 / 最多喜欢 / 最多引用，对勾表示当前项）；已选条件以可移除芯片列在网格上方；新手条（首访、可关闭、记在本机）。
- 作品网格：2/3/4/5/6 列；作品卡（服务端豆粒缩略图、精选 / 官方徽标、右上角点赞按钮可直接点、标题、作者 · 尺寸 · 颜色数 + 用色小圆豆，容器查询取舍）；游标分页「加载更多」+ 骨架卡。
- 搜索结果视图（`/?q=`）：标题「“猫”」+ 数量 + 清除；手机：点搜索图标进入全屏搜索页（最近搜索、大家在搜、按类目看看），提交后回到结果。
- 空结果：豆粒插画 + 说明 +「清除搜索和筛选」次按钮 + 热门搜索芯片。
- 列表保持 SSR 可爬（ADR-0021 / D53）：首屏服务端渲染作品卡与类目；筛选参数进 URL。
- 删除本页对旧组件（CommunityFilters、TagFilter、HomeCommunityShelf 等）的引用；r14 的标签筛选并入类目条与搜索（标签名仍可通过 `cat` 参数与搜索命中）。

## 验收

- 与原型 01–04 截图在五个宽度下一致；点赞未登录弹出登录弹窗、登录后状态同步。
- 更新 E2E 12 / 17-beadhue / 18-community-tags 中的发现页用例并通过（Chromium）。
- 门禁全绿。

## Comments

### 实施记录（2026-09-24，分支 `feat/beadhue-r15-04-discover`）

**页面**：`src/app/page.tsx`（服务端）读地址状态 → 首屏作品（登录时带 `liked`）、总数、类目（`listDiscoverCategories`：featured 且未合并的启用标签，按 sortOrder、名称）→ `DiscoverView`（`src/components/works/discover/`）。旧 `/community` 页面主体与其测试删除（路由已 308 到 `/`）；CommunityFilters、TagFilter、HomeCommunityShelf 不再被引用（票 13 删文件）。
- 地址状态 `discover-state.ts`（服务端 / 客户端共用）：`q cat sort size colors spec since`，缺省 `cat=all`、`sort=rec` 不写进地址；r14 的 `tag` 并入 `cat`，旧排序 `latest/popular/featured` → `new/likes/rec`；旧链接带来的 `author`、`palette` 作为可移除芯片保留。非法参数显示「筛选条件无效」空状态。
- 吸顶类目条（链接、可爬）：全部 / 精选 + featured 标签；图标 `tagIconArt.ts`（12 个内置键由原型 motifs 固化为 13 格网格，`px:` 编码直接解析，无图标用默认蓝豆）；滚动后发丝边 + `shadow-stuck`。
- 筛选：`Popover sheetTitle`（桌面 560 宽弹出层 / 手机底部面板，底栏吸底）；芯片可再点取消；「显示 N 张图纸」按草稿实时取列表接口 `total`（250ms 防抖、按条件缓存，0 时禁用为「没有符合的图纸」）。排序：同一弹出层 / 底部面板，链接 + 对勾，`aria-current`。
- 已选芯片（`RemovableChip`）+「全部清除」；搜索结果标题「“q”」+ 数量 + 提示 +「清除搜索」；默认视图只有读屏 h1「发现图纸」，作品区读屏 h2「作品」（h1→h2→h3）。
- 作品卡 `CommunityWorkCard`：服务端豆粒缩略图、精选 / 官方徽标、右上 `LikeButton` 可直接点（`useWorkLike`：未登录弹登录弹窗，成功后继续本次喜欢并 `router.refresh()` 让其他卡片同步；乐观更新，失败回滚并提示）。作者主页与「我的 · 喜欢」的 `SimpleWorkGrid` 改用同一张卡。
- 加载更多：带游标的普通链接（无脚本 / 爬虫可翻页），有脚本时就地追加一页并先放骨架卡；最后一页后显示禁用的「已经到底了」。
- 新手条：首访显示、可关闭、记在 localStorage（`beadhue:discover-intro-closed`），服务端与水合首帧不渲染。
- 手机：搜索结果页顶栏为「返回 + 回填关键词的搜索框」；外壳全屏搜索页的 `searchExtras` 放「按类目看看」四列格。外壳小改：附加区块里点链接即收起搜索页；手机顶栏改为 `<header>` 地标（axe region）。

**验证**
- `npm run typecheck`、`npm run lint`、`npm run brand:check` 通过；`npm test`：244 文件，1844 通过、13 跳过、0 失败（端口单测需在未导出 `E2E_PORT` 的环境跑）。新增 `src/app/page.test.tsx`（4 条，服务端渲染、筛选参数、空结果与热门、旧参数兼容、非法参数）、`discover-state.test.ts`（4 条，含类目图标）。
- E2E Chromium（`E2E_PORT=3120`）：`18-community-tags-mobile` 4/4（手机两列、筛选实时计数 → 芯片 → 移除、排序对勾、`?tag=` 并入类目与搜索、卡片点赞弹登录后同步）；`12-community-governance` 全部发现页相关用例通过；`17-beadhue-redesign` 通过；`17-visual-refinement` 中本票改写的 4 条（五宽度排版 + axe、无脚本链接、手机筛选面板、审计行）通过；`06` + `01`：25 通过 / 3 失败 / 1 跳过，3 条即票 03 记录的基线失败。
- 视觉：`tools/shoot-discover.mjs`（先 `BASE=… capture-current.mjs seed` 补样例，再 `setup` 把原型类目设为 featured + 图标）在 1440 / 1024 / 768 / 390 / 350 截取 top、intro、search、empty、filter、filter-picked、chips、sort、mobile-search、scrolled，与原型同状态并排检查一致（`evidence/impl/04/`，不入库）。

**与原型的有意偏差**
- 选中的描边芯片按 design.md「选中深墨底白字」实现；原型里 `.chip.outline` 覆盖了选中底色，出现白底白字。
- 手机上筛选按钮只有图标（40px），已选数量徽标改为右上角角标；原型把徽标塞在 40px 按钮里，挤出边框。
- 原型搜索结果只有 3 张也显示「加载更多」（模拟数据）；实现只在有下一页时显示。
- 空结果「热门搜索」取公开作品最多的 6 个标签（原型为固定词）。

**遗留**
- 17-visual-refinement 里仍有 6 条基线失败与本票无关：首页上传落区 / 继续上次制作 / `/app` 空白起稿（票 07）、色板页结构（票 06）。
- 类目条依赖后台把标签设为 featured（票 10 的标签管理可编辑 icon / featured / sortOrder）；E2E 种子库没有 featured 标签，只显示「全部」「精选」。
