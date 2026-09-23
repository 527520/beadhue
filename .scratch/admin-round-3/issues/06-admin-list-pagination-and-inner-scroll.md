# 06 后台列表分页 + 总页数 + 跳页 + 列表内滚动

Status: ready-for-human
Completion: complete

## 目标
后台所有列表默认每页 10、可切 10/20/50/100 并记住、显示总页数、可跳页；桌面列表内部滚动，窗口不滚动。

## 范围
- 新增 `src/lib/admin/pagination.ts`（page/size/offset/totalPages，同一 conditions 跑 select 与 count）。
- 改造查询与路由：works、audit、users、tags、revisions、comments、reports、batches（`cursor` → `page`/`size`，返回 `total`）。
- 迁移 `0016` 补索引：community_works(created_at,id)、admin_audit_logs(created_at,id)、users(created_at)、community_tags(merged_into_tag_id)。
- 新增 `useAdminPage` + `pageSizeStore`；`AdminPagination`（每页/上一页/第 N 页共 M 页/跳转/下一页）；迁移 7 个列表调用点。
- `globals.css`：≥901px 任务页高度有界 + 列表/详情内部滚动（`:has()`，异常时退化显式 class）；`.admin-table-scroll` 加纵向滚动与键盘可达。
- i18n 新键 + 更新「每页 50 条」文案。

## 验收
各列表路由测试（total/size 越界/page 超界）；组件测试（默认 10、跳页、切每页）；e2e（窗口 scrollY=0 且列表 scrollTop 变化）。

