# 03 服务端：官方草稿原地修订接口

Status: ready-for-human
Completion: complete

## 目标
未发布的官方草稿可以原地改标题与图纸（修订号不变、原图绑定不变、不占新的草稿名额）。

## 范围
- 新路由 `src/app/api/admin/batches/[id]/drafts/[revisionId]/route.ts`（PATCH，`official:manage`，strict zod，`executeIdempotently`）。
- `src/lib/community/officialBatch.ts` 新增 `reviseOfficialDraft`：锁 batch / revision / work，校验未发布（`currentPublishedRevisionId is null`）与 `expectedVersion`，重建 palette/width/height/colorCount/preview，写审计 `official.draft_revised`。
- `saveOfficialDraft` 返回值与 `listOfficialBatches` 的 drafts 补 `version`。
- ADR-0024。

## 验收
`db/officialBatch.test.ts` 扩展：改标题/改快照、已发布 409、他人批次 404、版本不匹配 409、幂等重放、successCount 不变、原图行仍指向同一 revision；路由 401/403。
