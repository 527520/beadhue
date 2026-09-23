# 02 新增接口、字段与通知后端

Status: ready-for-agent
Completion: complete
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

## Comments

### 实施记录（2026-09-23，分支 `feat/beadhue-r15-02-backend`）

**迁移 0020 `0020_discovery_notifications`**（含 `down/`、`meta/0020_snapshot.json`、journal）：新表 `notifications`（`user_id → users` 级联删除，索引 `(user_id, created_at desc, id desc)` 与未读部分索引 `(user_id) where read_at is null`）；`community_revisions.suggested_tags text[] not null default '{}'`；`community_tags.icon text`、`featured bool not null default false`。`sort_order` 早已存在（0007），本票直接复用、开放编辑。`db/migration0020.test.ts` 在 PGlite 上验证 0000→0020、带存量数据 0019→0020（默认值与旧数据）、执行 down 后日志回到 0019 并可再升级。

**豆粒缩略图（D67）**：`src/lib/render/thumbnail.ts` 改为白色钉板底 + 带孔圆豆（半径 0.47 / 孔 0.14 格，≥10px 描边 10% 深色，<7px 孔缩小变淡，<4px 不画孔与钉点），空格 / 透明 / 背景外部格只画淡钉点，无格线无板缝，8×8 超采样抗锯齿；像素尺寸规则不变（`thumbnailPixelSize` 与旧 `<img>` 固有尺寸一致）。渲染版本 `THUMBNAIL_RENDER_VERSION = 2` 进图片地址（`?v=2`）与进程缓存键，旧的 immutable 浏览器缓存随地址变化自然失效。未登录详情大图（`size=large`）同风格。样张：`.scratch/ui-rebuild/evidence/impl/02/thumb-*.png`（不入库）。

**通用约定**：错误体 `{ error: { code, message, field? }, requestId }`；429 带 `Retry-After`；写接口走 `enforceMutatingGuard`（同源 Origin + JSON）；后台写接口必须带 `Idempotency-Key`，`/api/me/notifications/read` 可选。列表项（`CommunityListItem`）形状：

```json
{ "id": "作品ID", "revisionId": "修订ID", "title": "橘猫团子",
  "author": { "authorType": "user", "publicAuthorId": "7b0c…", "displayName": "小鹿拼豆" },
  "boardProfile": "5mm-29", "palette": { "kind": "builtin", "id": "MARD" },
  "width": 32, "height": 32, "colorCount": 7,
  "preview": { "version": 1, "width": 32, "height": 32, "originalWidth": 32, "originalHeight": 32, "cells": ["#FAF4C8", null], "colorBand": ["#FAF4C8"] },
  "thumbnailUrl": "/api/community/revisions/<revisionId>/thumbnail?v=2",
  "tags": [{ "id": "…", "name": "猫咪", "slug": "t-…" }],
  "counts": { "likes": 12, "comments": 3, "reuses": 2 },
  "featured": true, "liked": false, "publishedAt": "2026-09-20T08:00:00.000Z" }
```

#### 变更的接口

1. `GET /api/community/works?q=&cat=&sort=&size=&colors=&spec=&palette=&since=&author=&tag=&cursor=`（公开，IP 小时限流 + 登录账号配额）
   - `sort`：`rec`（默认，精选优先再按热度 = 喜欢 + 评论 + 引用）/ `new` / `likes` / `reuses`；旧值 `latest|featured|popular` 仍可用。
   - `size`：`s`（最长边 < 30）/ `m`（30–40）/ `l`（> 40）；`colors`：`few`（≤6）/ `mid`（7–10）/ `many`（>10）；`spec`：`5mm` / `2.6mm` 或具体规格 ID；`palette`：品牌名（`MARD`、`COCO`、`漫漫`、`盼盼`、`咪小窝`、`优肯 Artkal`，展开为该品牌全部系列）/ 内置色板 ID / `custom`；`since`：1–3650 天；`author`：公开作者 ID（UUID 或 `beadhue-official`）精确匹配，其他文本按展示名模糊匹配；`cat`：`featured` / `all` / 标签名。`q` 同时搜标题、标签、作者展示名。非法值 400 `VALIDATION`。
   - 响应 `{ "items": [CommunityListItem], "nextCursor": "签名游标|null", "total": 57 }`；`total` 按筛选缓存 60 秒（`COMMUNITY_COUNT_CACHE_SECONDS`）。匿名 `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`，登录 `private, no-store`（每项 `liked` 因人而异），均 `Vary: Cookie`。
2. `GET /api/community/works/:id` 新增 `beadCount`、`colorUsage`、`thumbnailUrl`、`largeImageUrl`：
   ```json
   { "colorCount": 2, "beadCount": 272,
     "colorUsage": [{ "code": "F5", "name": "红", "hex": "#E0473F", "count": 180 }, { "code": "H1", "name": "白", "hex": "#FFFFFF", "count": 92 }],
     "largeImageUrl": "/api/community/revisions/<revisionId>/thumbnail?v=2&size=large" }
   ```
   匿名 `colorUsage: null`（仍有 `colorCount`、`beadCount`）。
3. `GET /api/designs` 列表项新增 `"thumbnailUrl": "/api/designs/<id>/thumbnail?rev=3&v=2"`（墓碑 / 无图纸为 `null`）。
4. `GET /api/community/tags` 每项新增 `icon`、`sortOrder`、`featured`：`{ "items": [{ "id": "…", "name": "星星人", "slug": "t-…", "icon": "star", "sortOrder": 2, "featured": true }] }`。`icon` 为内置键（`strawberry mushroom cat heart star icecream rainbow chick sakura watermelon frog panda`）或像素编码 `px:<宽>x<高>:<HEX>.<HEX>…:<格>`（宽高 8–16、≤8 色、`.` 空 / `1`–`8` 色序），解析用 `parseTagIcon()`（`src/lib/community/tagIcon.ts`，浏览器可用）。
5. `GET /api/admin/community/tags` 每项新增 `icon`、`featured`；`POST /api/admin/community/tags` 与 `PATCH /api/admin/community/tags/:id` 接受 `icon`（`null` 清除）、`featured`、`sortOrder`：
   `PATCH { "expectedVersion": 1, "icon": "cat", "featured": true, "sortOrder": 5 }` → 标签行（含 `version`）。只调这三项可不填 `reason`（审计理由「标签管理：调整展示」）；改名 / 标识 / 启停仍需 3–500 字理由。审计 before/after 记 `sortOrder`、`featured`、`hasIcon`。
6. `POST /api/community/works` 与 `POST /api/community/works/:id/revisions` 接受 `"suggestedTags": ["猫咪", "橘猫"]`（规范化 + 大小写去重后 ≤5 个、每个 ≤8 字，否则 400 `field: "suggestedTags"`）。`GET /api/admin/community/revisions`（队列项）、`GET /api/admin/community/revisions/:id`（另带作品当前正式标签 `workTags: [{id,name}]`）与 `GET /api/community/works/mine`（各修订）返回 `suggestedTags`。

#### 新增的接口

7. `GET /api/designs/:id/thumbnail?rev=3&v=2`（仅本人，按账号 `RATE_DESIGN_THUMBNAIL_USER_HOUR` 限流，含 304）：`200 image/png`，`rev` 等于当前修订时 `Cache-Control: private, max-age=31536000, immutable` + 强 `ETag`；`If-None-Match` 命中 `304`；`rev` 不一致或缺省照常出图但 `private, no-store`；`rev` 非法 400；他人 / 已删 / 不存在 404。
8. `GET /api/community/works/liked?cursor=`（登录，计账号读总量）→ `{ "items": [CommunityListItem + "likedAt"], "total": 18, "nextCursor": null }`，只含仍公开的作品，按喜欢时间倒序，每页 24。
9. `GET /api/community/works/:id/related?limit=8`（公开，IP 限流；limit 1–24）→ `{ "items": [CommunityListItem] }`：共享启用标签数降序 → 同作者 → 同内置色板 → 热度 → 发布时间；至少满足一项；作品不公开 404。匿名 `public, s-maxage=300`，登录 `private, no-store`。
10. `GET /api/community/authors/:publicAuthorId`（公开，IP 限流）→ `{ "publicAuthorId": "7b0c…", "displayName": "小鹿拼豆", "authorType": "user", "counts": { "works": 12, "likes": 340, "reuses": 25 } }`；`beadhue-official` 为官方作者；不存在 404；注销账号展示「已注销用户」。作品列表用 `GET /api/community/works?author=<publicAuthorId>&sort=new`。
11. `GET /api/community/search/suggest?q=猫`（公开，`RATE_SEARCH_SUGGEST_IP_HOUR` 独立节流；q ≤40 字）→
    ```json
    { "q": "猫", "tags": [{ "id": "…", "name": "猫咪", "count": 9 }],
      "works": [{ "id": "…", "revisionId": "…", "title": "橘猫团子", "width": 32, "height": 32, "thumbnailUrl": "/api/community/revisions/…/thumbnail?v=2" }],
      "authors": [{ "publicAuthorId": "7b0c…", "authorType": "user", "displayName": "猫猫手作", "workCount": 3 }] }
    ```
    各最多 5 条；`q` 为空时返回「大家在搜」：公开作品最多的 8 个标签，`works`、`authors` 为空。
12. `GET /api/me/stats`（登录，`RATE_ME_READ_USER_HOUR`）→ `{ "designs": 23, "publicWorks": 4, "likes": 128 }`（公开作品只算本人身份、当前公开的作品）。
13. `GET /api/admin/overview/trends?days=7`（审核员与管理员，days 1–90）→ `{ "days": 7, "timezone": "Asia/Shanghai", "from": "2026-09-17", "to": "2026-09-23", "items": [{ "date": "2026-09-17", "submissions": 6, "likes": 28, "newUsers": 12 }, …] }`（投稿 = `submitted_at`，点赞 = `community_likes`，新用户 = `users.created_at`，按上海时区切日）。
14. `POST /api/admin/community/revisions/:id/suggested-tags`（`community:moderate`，必须 `Idempotency-Key`）：`{ "tags": ["猫咪"] }`（缺省采纳全部）→ `{ "workId": "…", "version": 3, "adopted": ["猫咪"], "tags": [{ "id": "…", "name": "猫咪" }] }`。只能采纳该修订建议过的标签（否则 400 `field: "tags"`），不存在的标签即建（沿合并链），已有的跳过，受每件 10 个上限约束；写审计 `community.suggested_tags_adopted`（理由「采纳建议标签」）。
15. `GET /api/me/notifications?cursor=&limit=20`（登录，limit 1–50）→
    ```json
    { "items": [{ "id": "…", "type": "revision_rejected", "read": false, "readAt": null, "createdAt": "2026-09-23T08:00:00.000Z",
                 "payload": { "workId": "…", "revisionId": "…", "title": "像素奶茶", "reason": "标题含联系方式" } }],
      "nextCursor": null, "unreadCount": 3 }
    ```
    `type`：`revision_approved`（payload `workId revisionId title`）/ `revision_rejected`（另有 `reason`）/ `work_removed`、`work_restored`（`workId title`，不带下架理由）/ `work_commented`（`workId title commentId`，不存正文）。
16. `GET /api/me/notifications/unread-count` → `{ "unreadCount": 3 }`（铃铛轮询用，走未读部分索引）。
17. `POST /api/me/notifications/read`：`{ "ids": ["…"] }` 只标本人的（≤100），`{}` 全部已读 → `{ "updated": 1, "unreadCount": 2 }`；`RATE_ME_WRITE_USER_HOUR` 限流；带 `Idempotency-Key` 时回放首次结果。

**通知写入时机**：审核通过 / 驳回（`reviewCommunityRevision`）、下架 / 恢复（`moderateCommunityWork`）、评论直接公开（`createCommunityComment`）或经人工复核首次公开（`moderateCommunityComment`），均在原事务内写入（主操作失败则无通知）；官方作品、作者自评与已注销账号不写。每日清理删除 90 天前的通知（`NOTIFICATION_RETENTION_DAYS`）；注销账号时删除本人通知。

**新增配置**（`src/lib/config.ts` + `.env.example`）：`RATE_DESIGN_THUMBNAIL_USER_HOUR=3000`、`RATE_SEARCH_SUGGEST_IP_HOUR=1800`、`RATE_ME_READ_USER_HOUR=1800`、`RATE_ME_WRITE_USER_HOUR=600`、`COMMUNITY_COUNT_CACHE_SECONDS=60`、`NOTIFICATION_RETENTION_DAYS=90`。

#### 验证

- `npm run typecheck`、`npm run lint`、`npm run brand:check` 通过；`npm test`：238 个文件、1785 通过、13 跳过（跳过数与基线相同，均为既有条件跳过），0 失败。
- 新增测试：`db/migration0020.test.ts`、`db/communityDiscovery.test.ts`、`db/notifications.test.ts`、`src/app/api/designs/[id]/thumbnail/route.test.ts`、`src/app/api/community/works/list.test.ts`、`src/app/api/community/discovery.test.ts`、`src/app/api/admin/community/revisions/[id]/suggested-tags/route.test.ts`、`src/app/api/me/notifications/route.test.ts`、`src/lib/community/tagIcon.test.ts`、`src/lib/palettes/colorNames.test.ts`，以及 `tagNames`、`thumbnail`、`thumbnailUrl` 单测扩充。
- E2E 未运行（3100 端口由主工作区占用）；已同步两处受影响断言：`12-community-governance` 的迁移标签改为 `0020_discovery_notifications`，`16-review-recovery` 的缩略图拦截模式改为 `**/thumbnail*`（地址多了 `?v=2`）。

#### 偏差与说明

- 色板目录没有官方颜色名，`colorUsage[].name` 用 `describeColorName(hex)` 推导中文色系名（白 / 浅灰 / 红 / 粉 / 棕 / 浅蓝 / 深绿…），是描述性名称。
- 旧测试中「格线变暗、板缝更深」「缩略图地址不带查询参数」两组断言按 D67 与渲染版本需求改写为新行为的断言（未删减覆盖面）；`adminQueries.test.ts` 的最新迁移标签同步为 0020。
- 为让排序类型放宽后通过类型检查，改了 `src/components/community/CommunityImpression.tsx` 一行类型声明（不改界面）；统计事件 `community_list_viewed.sort` 同步接受新排序值。
- `sort` 默认值改为 `rec`（原 `latest`）；旧 `/community` 页面缺省时自带 `sort=featured`，行为不变。
- 相似作品与作者主页只计账号读总量，不计「每小时不同作品数」，否则每看一张详情就消耗 8 件额度。
- 后台趋势与其他后台只读接口一致，未另加限流。

#### 遗留

- CONTEXT.md 的 D64–D72 由票 13 统一写入，本票未改。
- 真实 PostgreSQL 上的 0020 升级 / 回滚仅由 PGlite 验证，部署前需在 PG16 复核。
- 票 05 / 04 需要：详情页色号清单名称列用 `colorUsage[].name`；卡片喜欢按钮用列表项 `liked`；类目条用 `GET /api/community/tags` 中 `featured: true` 的标签并用 `parseTagIcon` 渲染图标。
