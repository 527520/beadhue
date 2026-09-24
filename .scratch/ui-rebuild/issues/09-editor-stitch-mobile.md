# 09 跟拼模式与手机编辑器

Status: ready-for-agent
Completion: complete
Blocked by: 08

先读 [实施指南](../implementation-guide.md)。原型同票 08；截图 `prototype-final/12`、`09-editor-390`、`evidence/prototype/ce-stitch-*`、`ce-m-*`。

## 范围

- 跟拼（D39，业务逻辑沿用 `StitchView`）：左工具栏「浏览 / 标记」；画布高亮当前板与行、已拼淡化；右面板进度（百分比、条、已拼 / 总颗数）、板块总览（完成度、点击跳转）、当前行卡（颜色序列）、「完成本行」主按钮（此时顶栏「导出」降为次按钮）、上一行 / 下一行、回到下一处未完成；清空进度在「…」并需确认；`?mode=stitch` 直达。
- 手机编辑器（<768）：顶栏「返回 ｜ 编辑 / 跟拼 ｜ 撤销 重做 ｜ …」；画布全屏适配；底部工具栏（5 个工具 + 当前色块）与最近用色条；颜色 / 调整 / 信息 / 导出 / 分享 / 公开 / 原图参照 / 删除 以底部面板打开；原图参照为上下分屏；跟拼手机版：顶部进度胶囊 + 底部「上一行 ｜ 完成本行 ｜ 下一行」+ 当前行颜色序列；100dvh 与安全区；沿用精准模式等移动端约束（D5 / D8 / D39）。

## 验收

- 与原型截图在 390 / 350 / 768 一致；E2E 11（有界画布）、跟拼与移动端相关用例更新并通过（Chromium，含移动设备模拟）。门禁全绿。

## Comments

### 实施记录（票 09，2026-09-24，提交 0becbef … 本条文档提交）

**做了什么**
- 跟拼（D39）：`stitch-model.ts`（板块顺序的行列表、整图 / 每板 / 每行进度、行内颜色序列、下一处未完成）+ `use-stitch-session.ts`（本次会话撤销重做、当前行按「行首格」定位、浏览 / 标记）；写入规则沿用 `lib/progress`（可拼格、`setBoardRowDone`、`toggleCell`、`clearProgress`），存取仍由工作台串行写本机。画布（`EditorCanvas` 的 `stitch` 叠层）：已拼压淡 + 勾、当前板外压淡并描深墨框、当前行主色描边；浏览只平移，标记是轻点（松手且未移动过阈值才提交，双指 / pointercancel 零写入）。桌面：左栏浏览 H / 标记 M，右面板 `panel-stitch.tsx`（进度、板块总览点击跳转、当前行卡、完成本行主按钮、上一行 / 下一行、回到下一处未完成），顶栏撤销重做作用于跟拼历史，「…」里「清空跟拼进度」需确认（提示条可撤销），跟拼时「导出」降为次按钮；首次进入跟拼（含 `?mode=stitch`）把当前板带进视野。
- 手机编辑器（<768，同一个 `EditorWorkspace`）：`mobile-chrome.tsx` 顶栏「返回 ｜ 编辑 / 跟拼 ｜ 撤销 重做 ｜ …」，底部最近用色条 + 5 个工具 + 当前色；颜色 / 调整 / 信息 / 导出 / 跟拼进度 / 缺原图说明 / 「…」都是底部面板（「…」含保存状态、重命名、分享只读链接、公开到豆社、原图参照、显示芯片、新建 / 复制 / 导入 / 清空 / 删除）；原图参照为上下分屏（`ReferenceSplit`）；跟拼手机版为顶部进度胶囊 + 左下浏览 / 标记 + 底部当前行颜色序列与「上一行 ｜ 完成本行 ｜ 下一行」；100dvh + 安全区，提示条浮在底栏上方。
- 重新裁剪换成票 07 的取景舞台（`recrop-dialog.tsx`：原图 / 1:1 / 按底板，手机底部面板），「重新生成会覆盖手工修补」确认嵌在弹窗里；解码中「取消」仍可用。
- 工作台：去掉旧手机工作台、预览页签、手机沉浸层历史、`LegacyScope`、旧 `StitchView` / `CropDialog` 外壳与只给旧布局用的状态（remapNotice、设置抽屉等）；有图纸即渲染编辑器，没有即创作入口；换色板等提示条手机也显示；跟拼保存失败走编辑器通知（带「重试保存」）。

**验证**
- `npm run typecheck`、`npm run lint`、`npm run brand:check` 全绿；`npm test` 256 文件 1940 通过 / 13 跳过，唯一失败的 `tests/unit/e2eServerProcess.test.ts` 4 条是沙箱限制（不受限重跑 9/9 通过）；`npm run test:performance` 4 文件 7 条通过。新增 `stitch.test.tsx` 17 条，`Workbench.test.tsx` 74 条全过。
- E2E Chromium：11 全部（3 过、iPhone 用例按设计只在 WebKit 跑）、05 六条、13 四条（含 350 / 390 手机）、06 二十三条、18-workbench 前三条、17-beadhue 四宽度用例、03 / 07 重裁剪段、02 / 04 / 09 / 10 / 12 回归通过。
- 视觉：`tools/shoot-09.mjs`（实现侧）对照原型 `ce-stitch-*`、`ce-m-*`、`ce-editor-*`：桌面跟拼 1440 / 1024 / 768，手机编辑 / 跟拼 390 / 350，颜色、「…」、调整、信息、导出、跟拼进度、画笔浮层、原图分屏、公开，结构、层级、间距一致，无横向溢出（`evidence/impl/09/`，不入库）。

**与原型的有意偏差**
- 「…」（桌面与手机）保留票 08 加的新建图纸 / 导入项目文件 / 清空图纸；手机菜单项 44px 高（原型 36，触屏可点性）。
- 画笔浮层在手机多一项「连续绘制」：D5 要求连续插值可在会话内显式开启，默认仍是精准模式。
- 完成本行跳到「下一处未完成」（原型行为），而不是机械地下一行；轻点标记不移动当前行（原型行为，旧版会移动）。
- 手机默认工具是画笔（原型），旧版默认手形；触屏画笔是精准模式，双指只导航，未改 D5 / D8。
- 进度百分比向下取整（原型），旧版保留一位小数。
- 重新裁剪没有旧版的自由比例 / 边框手柄 / 框外框选，与新建图纸同一取景舞台。
- 旧版手指放大镜（FingerLoupe）不再提供（原型没有），瞄准时顶部悬停胶囊给出行列与色号。

**遗留**
- 17-visual-refinement 的 37 / 93 / 153 / 215 / 242 / 277 / 290 与 18-workbench 第 4 条（发现页旧 `.search`）、04 的删除跨设备收敛在本票之前就失败，选择器都停在旧首页 / 旧空白起稿 / 旧后台，归票 14。
- 03 大图长任务门禁在冷启动开发服务上偶发一次 259ms（重跑 2/2 通过），票 14 复测。
- 系统返回键在手机上按普通导航离开编辑器（旧版是退回预览层）；自动保存 1s 防抖期内离开可能丢最后一笔，与桌面相同。

**可由票 13 删除（已无非测试引用）**：`components/stitch/StitchView.tsx`（及测试、`canvas/pinchCameraTransition.test.tsx` 里的相关段）、`workbench/{WorkbenchSettings,WorkbenchProjectBar,DesignNameEditor,StepIndicator,GenerationCancelControl}.tsx`（及测试、`journeyFeedback.test.tsx`）、`workbench/SaveStatus.tsx` 的组件部分（类型仍被编辑器使用，挪走类型后可删）、`layout/useMobileLayout.ts`、`export/{ShoppingListPanel,PngExportButton,ProjectFileButtons}.tsx`（`PdfExportButton` 的 `triggerDownload` 仍被导出弹窗使用）、`share/ShareButton.tsx`、`community/PublishToCommunityButton.tsx`、`params/GenerationParamsPanel.tsx`。仍被后台使用、不能删：`crop/CropDialog`、`editor/PixelEditorCanvas`、`canvas/*`、`preview/PatternPreview`、`beadhue/OriginalUploadStatus`。
