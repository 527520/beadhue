# 01 后台按钮尺寸体系统一 + 人员管理头像居中

Status: ready-for-human
Completion: complete

## 目标
同一套 `.btn-*` 类在任何元素上高度一致；后台按钮尺寸只有 44/36/32 三档；人员管理头像在自己的列里垂直居中。

## 范围
- `globals.css` 新增 `--control-height-md/sm/xs/touch` token，替换 `.btn-*`/`.btn-bead`/`.chip`/`.disclosure-trigger`/`.segmented-control.is-sm` 的硬编码高度。
- `globals.css:2806` 的 44px 下限排除按钮体系：`button:not([tabindex="-1"]):not([class*="btn-"]):not(.chip):not(.disclosure-trigger)`。
- 按钮行容器统一 `align-items: center`（`.admin-form-actions` 等）。
- 新增 `src/components/ui/FileButton.tsx`，替换 `OfficialBatchStudio.tsx:186/:264` 的手写 label。
- `src/app/admin/error.tsx:7` 改用 `Button`/`ButtonLink`。
- 头像：`globals.css:509/510` 加 `grid-column:1` + `align-self:center` + `:not(.admin-avatar)`；`.admin-avatar` 提升特异性压过 `:488`。
- 护栏：扩展 `tests/unit/designSystem.test.ts`；e2e 走查断言后台按钮高度 ∈ {44,36,32}。

## 验收
单测护栏通过；三浏览器 e2e 通过；后台各页 1440px 截图无混档。

