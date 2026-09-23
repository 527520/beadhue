# 08 标签管理改版

Status: ready-for-human
Completion: complete

## 目标
模块更名「标签管理」；名称/排序对齐；件数正确；可按标签批量选作品打标（排除已有、可见缩略图）；新建标签免理由。

## 范围
- 更名三处文案；描述重写。
- 对齐：`slugHelp` 移出 TextField description；新增 `.tag-fields` 网格与统一 label 高度。
- 计数：改 join + `count(*) filter (...)`，返回 `workCount` 与 `publicWorkCount`；加真实链接的回归测试；作品管理不再显示件数。
- 批量打标：`GET /api/admin/community/tags/[id]/works`（默认排除已打该标签，`tagId`+`tagState` strict 参数）+ 弹窗选择器（搜索/分页/全选本页/≤50 件）；提交走既有批量接口；成功后只刷新计数。
- 新建标签 `reason` 改可选（默认审计理由「标签管理」）；改名/停用/合并仍要求。

## 验收
计数回归、免理由创建、tagState 过滤、批量弹窗交互；e2e 14 更新并新增批量打标用例。

