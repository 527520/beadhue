# 07 作品管理：标签保存不刷新 + 公开状态筛选

Status: ready-for-human
Completion: complete

## 目标
保存标签只就地更新，不重载列表、不闪骨架、不需要理由；可按公开状态筛选。

## 范围
- `useAdminPage.patchItem` + `useAdminInspection.applyLocal`；`saveTags`/`bulkTag` 用返回值就地 patch，删除 `queue.reload()`。
- 标签区文案强化「保存标签无需填写操作理由」；ReasonPanel 注明理由仅用于处置动作。
- `adminQueries.ts` strict schema 增 `public: all|public|hidden`（谓词与 `isPublic` 完全一致）；WorksManager 增第二个筛选下拉。

## 验收
路由测试（含「已下架但有已批准修订」归类）；组件测试（查询参数、无刷新）；e2e 14 扩展。
