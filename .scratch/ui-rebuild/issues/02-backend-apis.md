# 02 新增接口、字段与通知后端

Status: ready-for-agent
Completion: not-started
Blocked by: —

先读 [实施指南](../implementation-guide.md) 与 spec.md「新增与变更的接口 / 字段」。本票只做后端（数据库、领域服务、API 路由、服务端渲染的缩略图）与测试，不做界面。

## 范围

1. **迁移 0020**（含 down 与快照）：`community_tags` 增加 `icon`（text，可空，存 8–16 格像素图标的紧凑编码或内置图标键）、`sort_order`（int，默认 0）、`featured`（bool，默认 false）；`community_revisions` 增加 `suggested_tags text[] not null default '{}'`；新表 `notifications`（id、user_id、type、payload jsonb、read_at、created_at，索引 user_id + created_at desc 与未读部分索引）。清理任务：通知保留 90 天（接入现有定期清理机制）。
2. **缩略图豆粒化（D67）**：`src/lib/render/thumbnail.ts` 改为豆粒风格（钉板白底 + 圆豆 + 孔，无格线板缝，和 `prototype/js/beads.js` 的 bead 模式同视觉），缓存键带渲染版本号，旧缓存自然失效；未登录详情大图同风格。
3. **设计缩略图**：`GET /api/designs/:id/thumbnail?rev=`（仅本人；ETag；`private, max-age=31536000, immutable`；按账号读配额节流）；`GET /api/designs` 列表项增加 `thumbnailUrl`。
4. **作品列表**：`GET /api/community/works` 支持 `size`、`colors`、`spec`、`palette`、`since`、`author`、`cat`（标签名或 `featured`）并返回 `total`（计数缓存，遵守 ADR-0021 的节流与游标签名）；排序 `rec`（精选优先再按热度）/ `new` / `likes` / `reuses`。
5. **详情 DTO**：登录用户增加 `colorUsage[]`（code、name、hex、count，按 count 降序；内置色板从目录取名称）；未登录只给 `colorCount` 与 `beadCount`。
6. **新接口**：`GET /api/community/works/liked`（登录）、`GET /api/community/works/:id/related?limit=8`、`GET /api/community/authors/:publicAuthorId`（展示名、作者类型、作品数、获赞、被引用；不存在返回 404）、`GET /api/community/search/suggest?q=`（标签、作品、作者各 ≤5；IP 节流）、`GET /api/me/stats`、`GET /api/admin/overview/trends?days=7`（每日投稿、点赞、新用户）。
7. **标签**：公开标签接口返回 `icon`、`sortOrder`、`featured`；后台标签接口可编辑这三项（写审计）。
8. **建议标签（D68）**：投稿 / 修订接口接收 `suggestedTags`（≤5，每个 ≤8 字，复用标签名规范化）；审核列表与详情返回；新增后台动作「采纳建议标签」（把选中的建议标签加入作品正式标签，写审计，免理由同 D51）。
9. **通知（D70）**：领域服务 `createNotification`；在审核通过 / 驳回、作品下架 / 恢复、作品收到公开评论时写入（在现有服务的事务里，失败不影响主操作的一致性要求照现有模式处理）；`GET /api/me/notifications?cursor=`（含 `unreadCount`）、`POST /api/me/notifications/read`（`{ ids?: string[] }`，缺省全部已读）。
10. 所有新接口遵守现有鉴权、`enforceMutatingGuard`、幂等键（写接口）、限流与错误格式；配置项进 `src/lib/config.ts` 与 `.env.example`。

## 验收

- 每个接口有路由测试（权限、参数校验、分页、限流 429、缓存头）；迁移在 PGlite 从 0000 升到 0020 并可 down；领域服务有集成测试（通知写入时机、建议标签采纳的审计）。
- `npm run typecheck && npm run lint && npm run brand:check && npm test` 全绿。
- 在票末 Comments 里列出每个接口的请求 / 响应示例（给前端票用）。
