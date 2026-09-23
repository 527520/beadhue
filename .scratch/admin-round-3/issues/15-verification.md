# 15 全量验证与证据

Status: ready-for-human
Completion: complete

## 范围
- lint / typecheck / test / coverage(90/75) / performance / build / e2e ×3 浏览器。
- 新增 e2e：后台分页与内滚动、公开状态筛选、标签批量打标与计数、按钮尺寸走查、豆社标签筛选与两列、官方批次生成后编辑与精细编辑、后台发布不被公开限流、/admin/logs 权限与筛选。
- 迁移 0019 upgrade → down → upgrade（隔离 PostgreSQL 16，环境可用时）。
- 证据落 `verification.md` + `evidence/`；更新 CONTEXT 验证记录。

## 验收
所有门禁全绿，或明确记录未通过项与原因（不隐藏失败）。
