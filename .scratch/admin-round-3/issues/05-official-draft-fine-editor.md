# 05 官方草稿精细编辑器

Status: ready-for-human
Completion: complete

## 目标
后台能对单张草稿做像素级编辑并保存。

## 范围
- 新组件 `src/components/admin/BatchDraftEditor.tsx`：Modal 承载 `EditorToolbar` + `PixelEditorCanvas`；工具=画笔/橡皮/油漆桶/吸管/尺寸/缩放/撤销重做/全局换色/换色板重映射/重新裁剪+重新生成；不含镜像旋转清空与导出/跟拼/分享。
- 打开时 GET `/api/admin/community/revisions/[id]` 取 snapshot 与 version；保存走 T03 的 PATCH（reason 取批次理由）。
- 未保存离开二次确认；`STATE_CONFLICT` 刷新后重试。

## 验收
组件测试（编辑→保存 payload、换色板兼容性、离开提示）；e2e（涂一格→保存→发布后详情可见）。

