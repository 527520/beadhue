# 04 客户端：官方批次生成后仍可编辑

Status: ready-for-human
Completion: complete

## 目标
生成完成后：可改标题、改统一参数、改逐项参数、逐项重新生成，并保存回同一草稿修订。

## 范围
- `batchSession.ts`：`BatchItem.revisionVersion`；`updateItem` 对未发布项放开 title/paramsOverride/crop；`setDefaults` 全程可用；新增 `saveItemEdits`、`regenerateItem`、`isDirty`。
- `OfficialBatchStudio.tsx`：`canEditSpec` / `canEditItem`；卡片新增「保存修改」「重新生成」；统一参数面板常驻可展开并改文案。
- 文案：删除「参数与标题冻结」，新增保存/重新生成相关键。

## 验收
`batchSession.test.ts` 与 `OfficialBatchStudio.test.tsx` 扩展；e2e 15：生成 → 改标题 → 改参数 → 逐项重新生成 → 保存 → 发布。
