# 13 删除旧样式与旧组件、文档与决策记录

Status: ready-for-agent
Completion: in-progress
Blocked by: 03–12

先读 [实施指南](../implementation-guide.md)。

## 范围

- 删除 `src/app/beadhue.css`、旧组件类（`globals.css` 只保留令牌以外的极少量基础规则，目标 < 300 行）、不再被引用的旧组件与 hooks（旧外壳、ResponsiveSelect、DatePicker 等 react-aria 组件、AdminPrimitives 等），以及 `react-aria-components` / `@internationalized/date` 依赖（确认无引用）。
- 护栏测试扩展到全部 `src/app`、`src/components` 页面目录；新增「旧类名不得再出现」的检查。
- 文档：CONTEXT.md 写入 D64–D72 与 R15 事实段；新增 ADR-0027（前端技术栈与 CSP 约束）；CHANGELOG「未发布」；README 截图与功能说明按新界面更新（`docs/screenshots/capture.mjs`）；`.scratch/ui-rebuild/spec.md` 更新 Completion。

## 验收

- 全仓不再引用被删文件与依赖；门禁全绿；生产构建成功；构建产物中不含旧 CSS。

## Comments

### 13b 清理记录（2026-09-24，提交 c12776d … 4587a12）

文档部分（CONTEXT.md、ADR-0027、CHANGELOG）由 13a 在隔离工作树完成，编排合并后把本票改为 complete。

**删了什么**（`src` 相对 0907e18：+512 / −26,739 行）
- 样式：`beadhue.css`（4,236 行）删除；`globals.css` 3,207 → 44 行，成为唯一样式入口（preflight + `theme.css` + body / 光标 / 兜底焦点环 / 减弱动效）。`theme.css` 收回过渡期约束（不再有 `ui` 层与 `@theme inline`），`@source` 覆盖全部 `src/app`、`src/components`。构建产物只剩 1 份应用 CSS（约 120 KB）+ 字体 CSS，检索不到任何旧类名 / 旧令牌。
- 组件：整个 `legacy-ui/`、`layout/`（旧外壳、LegacyScope、LegacyPageHeading、useMobileLayout）、旧后台组件（AdminPrimitives、AdminNav、各 Manager / Console / AuditExplorer / OfficialBatchStudio 等）、旧豆社 / 设计 / 色板 / 导出 / 分享 / 参数 / 跟拼 / 上传组件、`crop/`、`editor/`（PixelEditorCanvas 等）、`canvas/*`、`preview/PatternPreview`、`CommunitySubmitForm`、`CommunityPreviewCanvas`、旧统计同意横幅与设置卡、`PdfExportButton`、`lib/render/canvasTheme`、`lib/community/tagHref`、`lib/palettes/customImport`（只被旧色板编辑器用）、首页 → 工作台图片交接（`lib/upload/pendingUpload`，已无写入方）。判定工具 `tools/dead-files.mjs`（从 Next 入口不可达的源文件）。
- 依赖：`react-aria-components`、`@internationalized/date`（连带 react-aria、react-stately、@react-types/shared、@internationalized/*、aria-hidden）；锁文件只删这 8 个条目，libc / fsevents 元数据未动。根布局去掉只供 react-aria 用的 `csp-nonce` meta。
- 文案：`zh-CN.ts` 2,990 → 2,080 行（`tools/prune-messages*.mjs`：无引用键 + 沿访问 / 别名的精确判定，以 typecheck 兜底）；含 `shell.author`、`onboarding.dismiss/start`、`share` 旧只读页文案、`shell.notifications.empty`、旧投稿表单文案。

**替换（只换界面不改行为）**
- 后台批次工作室：裁剪改用编辑器的 `RecropDialog`；草稿精细编辑改为 `admin-ui/draft-pattern-editor.tsx`（复用 useEditorDocument / EditorCanvas / ToolRail / ZoomPill / ColorsPanel，无整图变换 / 清空；窄屏上下堆叠）。`OriginalUploadStatus` 改用新按钮与令牌。
- `forbidden.tsx` 改用 `StatePage`。
- D72：`/community/submit` 只保留登录、邮箱验证与「不可公开」提示；有 `designId` 时跳 `/app?id=…&publish=1`（带 `workId` 一并带上），否则跳 `/me`。编辑器公开弹窗支持 `workId`：草稿建在该作品下（`POST /api/community/works/:id/revisions`，接口不变），会话没有原图时沿用上一版原图，标题「修改并重新投稿」。
- D71：数量单位「粒」→「颗」（PNG 图例汇总、PDF 用量单位、生成完成播报 / 信息行、采购清单复制文本、PDF 字体子集静态字；「豆粒」等名词不改）。

**保留及原因**
- `components/admin/` 逻辑模块：useAdminPage、useAdminCommand、useAdminInspection、pageSizeStore、batchSession、batchGeneration、SessionRefresh（票 10 约定）。
- `ui/separator`、`works/simple-work-grid`：新组件库成员，暂无页面使用。
- `lib/auth/mailTemplate`、`lib/identity/publicAuthorDb`：非界面代码，只有测试引用，不在本票范围。

**护栏**
- `tests/unit/uiScanned.ts` 改为全部 `src/app`、`src/components`（排除接口路由与只能内联样式的 `global-error.tsx`），与 `theme.css @source` 同步核对。
- 新增「旧类名不得再出现」：扫描字符串字面量里的旧组件类（btn-*、beadhue-*、workspace-*、modal-*、notice-*、link-soft …）与旧主题令牌工具类（text-ink-soft、bg-primary*、border-lilac*、text-sm / text-2xl、rounded-2xl、shadow-soft …，新主题里写了也不生效），附规则自检。
- `globals.test.ts` 改为新令牌对比度；`designSystem.test.ts` 去掉只约束已删 CSS 的规则。

**顺手修**：后台审核队列选中项（`bg-bg-muted`）上的次要文字改 `ink-2`（`ink-3` 只有 4.43:1，axe serious）；对比度单测记下这条约束。

**README**：`docs/screenshots/capture.mjs` 改为截发现页、作品详情、编辑器（JPEG，预设拒绝统计 Cookie），旧截图删除；页面表按新路由重写，技术栈改为 Base UI。

**验证**
- `npm run typecheck` / `npm run lint` / `npm run brand:check`：通过。
- `npm test`：206 文件，1547 通过、13 跳过、0 失败。
- `npm run test:performance`：7/7（首轮 200×200 生成预算在机器高负载时 2.56s 超 2s，引擎代码本票未改，单独连跑两次均通过）。
- `npm run build`：成功；`.next/static` 两份 CSS 检索旧类名 / 旧令牌 0 处。
- Chromium E2E（01、02、03、06、12、14、15、17-beadhue-redesign、17-visual-refinement、18-admin-round-3）：75 通过、1 跳过、7 失败，失败全部是 17-visual-refinement 的已知 7 条（旧选择器 `.admin-page h1`、旧色板 / 分析页结构等，归票 14）；其中「后台待审…五宽度」用例的投稿步骤已改走深链并通过，失败点在其后的旧选择器。E2E 12 投稿用例改为深链 + 编辑器弹窗（含超时重试同键、提交失败重试、撤回后「修改后重投」回到编辑器并弹出「修改并重新投稿」）。
- 截图：`evidence/impl/13/`（发现、创作、帮助、投稿提示、403、后台批次 / 审核、批次裁剪与草稿编辑，1440 / 390）。

**遗留（归票 14）**
- 17-visual-refinement 7 条、18-workbench 第 4 条、04 删除跨设备收敛（已知，未变差）。
- 自定义色板「导入」随旧色板编辑器消失（票 06 的新色板面板没有导入入口）；`customImport` 已删，需要时再按新界面补。
- 公开弹窗的修改后重投若服务端要求新原图（ORIGINAL_REQUIRED），目前只显示错误，需要用户在编辑器里重新选原图（会触发重新生成确认）。
- 投稿页复选框标签多行时复选框垂直居中（`Checkbox` 组件的 items-center），可在组件层统一改为顶对齐。

