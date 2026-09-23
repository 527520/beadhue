# ADR-0023: 未发布的官方草稿原地修订

- Status: accepted
- Date: 2026-09-17
- Refines: ADR-0015（已发布修订不可变）, ADR-0017（浏览器本地官方批次）, ADR-0019 / D49（原图绑定）

## Context

官方批量生成在浏览器本地完成（ADR-0017），每张成功图纸立即保存为服务端官方草稿：一个 `community_works` 行 + 一个 `community_revisions` 行（`revisionNumber = 1`）+ 一行按 `revisionId` 唯一的 `community_originals`（D49 要求发布前必须已有原图）。生成过程无人值守，管理员常在保存之后才发现图纸需要修正（标题写错、底板 / 色板选错、图案不理想），而此前只有 `saveOfficialDraft` 能写入草稿：它每次新建 work + revision 并递增 `official_batches.successCount`，草稿名额受批次 `itemCount` 限制，等于「改一张草稿」要占掉一个生成名额。

若改为插入新修订来表达修订：`community_originals` 绑定的是 `revisionId`（ADR-0019），新行没有原图，发布时会被 D49 以 `ORIGINAL_REQUIRED` 拒绝，而旧草稿行成为孤儿——**草稿会变得不可发布**。这与 ADR-0015「公开修订不可变」并不冲突：不可变的边界是「已发布」，草稿本来就还没进入公开面。

## Decision

1. 新增服务 `reviseOfficialDraft` 与 `PATCH /api/admin/batches/:id/drafts/:revisionId`（`official:manage`，`executeIdempotently`）：未发布的官方草稿**原地修订**——同一 revision 行、`revisionNumber` 不变、`community_originals` 仍指向该行、批次 `successCount` 不变，也不新增或删除 `community_works` / `community_revisions` 行。
2. 可修订内容只有标题与图纸快照（`title` / `snapshot`，二者至少提供一个，否则 `VALIDATION`）。改快照时按快照重算 `engineVersion`、`boardProfile`、`paletteKind` / `paletteId`、`width` / `height`、`colorCount`、`preview`，派生逻辑与 `saveOfficialDraft` 完全一致；色板与制作规格不兼容时拒绝（`VALIDATION`）。
3. 写入由乐观锁保护：请求必须携带 `expectedVersion`，等于当前 `community_revisions.version` 才写入并把 `version` 加一，否则 `STATE_CONFLICT`；相同 `idempotency-key` 的重放直接回放既有结果。
4. **只有未发布的草稿可改**：revision 必须是本批次的 `official` 草稿，批次必须属于当前管理员（否则 `NOT_FOUND`），且其 work 的 `currentPublishedRevisionId is null`（否则 `STATE_CONFLICT`）。发布后的修订继续遵守 ADR-0015：公开内容与审核结论不可变，要改内容只能新修订 + 重新上传原图。
5. 每次修订写且只写一条审计 `official.draft_revised`（`targetType: community_revision`），before/after 经 `sanitizeAuditState` 只保留状态与版本号；标题文本不进审计状态。
6. `saveOfficialDraft` 返回值与 `GET /api/admin/batches` 的 `drafts` 增加 `version`，供管理端做乐观锁与冲突提示。

## Consequences

- 「改一张草稿」不再消耗批次名额，也不会让草稿失去原图；批次结束（completed / cancelled）后仍可修订未发布的草稿，与「取消不丢弃已保存草稿、草稿另行复核发布」的既有语义一致。
- 修订是覆盖式的：草稿没有历史版本，标题与图纸的旧值只在审计里留下版本号，不可回溯。草稿尚未公开，不存在「公开内容已被覆盖」的歧义；这一点与 ADR-0022 对评论的处理不同，因为草稿还没进入公开面与审核记录。
- 公开作品依旧不可改写：发布后该接口返回 `STATE_CONFLICT`，管理端只能新建修订并重走 D49 原图与审核流程——ADR-0015 的不可变边界没有松动。
- 被拒绝的替代方案：**为修订插入新 revision**。`community_originals` 按 `revisionId` 唯一，新行必须迁移或复制原图；在管理员补传原图之前 D49 会让它无法发布，同时破坏「草稿 revision ↔ 原图」1:1 不变式，旧草稿行还会变成占着批次名额的孤儿。「软删除旧草稿 + 新建」同样丢原图绑定、同样浪费名额，故一并否决。
