# 13 删除旧样式与旧组件、文档与决策记录

Status: ready-for-agent
Completion: not-started
Blocked by: 03–12

先读 [实施指南](../implementation-guide.md)。

## 范围

- 删除 `src/app/beadhue.css`、旧组件类（`globals.css` 只保留令牌以外的极少量基础规则，目标 < 300 行）、不再被引用的旧组件与 hooks（旧外壳、ResponsiveSelect、DatePicker 等 react-aria 组件、AdminPrimitives 等），以及 `react-aria-components` / `@internationalized/date` 依赖（确认无引用）。
- 护栏测试扩展到全部 `src/app`、`src/components` 页面目录；新增「旧类名不得再出现」的检查。
- 文档：CONTEXT.md 写入 D64–D72 与 R15 事实段；新增 ADR-0027（前端技术栈与 CSP 约束）；CHANGELOG「未发布」；README 截图与功能说明按新界面更新（`docs/screenshots/capture.mjs`）；`.scratch/ui-rebuild/spec.md` 更新 Completion。

## 验收

- 全仓不再引用被删文件与依赖；门禁全绿；生产构建成功；构建产物中不含旧 CSS。
