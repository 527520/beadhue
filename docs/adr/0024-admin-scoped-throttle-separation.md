# ADR-0024 后台功能与豆社公开接口的限流分离

Status: accepted
Date: 2026-09
Refines: ADR-0021（豆社公开节流与内容分级）

## Context

官方批次的浏览器端会把每张已保存草稿渲染成服务端缩略图（`GET /api/community/revisions/:id/thumbnail`，按 IP 每小时 1200 次），
每张草稿保存后再上传原图（`PUT /api/community/revisions/:id/original`，按账号每小时 120 次）。
这两个都是豆社**公开**接口：它们的阈值是为匿名访客与普通账号设计的反爬护栏。

结果是一个 50 张的官方批次就吃掉公开写额度的一半，并且后台每次重渲染页面都会继续消耗公开读额度；
阈值一旦为了防爬收紧，最先被误伤的就是后台自己的工作流。

## Decision

1. 后台不再调用豆社公开接口，改走**仅管理员可调用**的专用路径：
   - `GET /api/admin/community/revisions/:id/thumbnail`（`community:moderate`），与公开路由共享同一份 PNG 缓存；
   - `PUT /api/admin/community/revisions/:id/original`（`official:manage`，写入前由 `storeRevisionOriginal` 校验「官方修订 + 具备 official:manage」）。
2. 管理端路径使用**独立的限流键与阈值**（`admin:thumbnail:<userId>` / `admin:original:<userId>`，
   默认 20 000/h 与 300/h，可配置），保留兜底但不拦正常批量工作。
3. 豆社公开接口的路径、键与阈值**完全不变**：匿名访客与普通账号的防护不受影响。
4. 公开路由与管理端路由共用 globalThis 注册的缩略图缓存（`src/lib/render/thumbnailCache.ts`），
   同一修订不会被光栅化两次。

## Consequences

- 后台批量工作不再消耗豆社公开配额，收紧公开阈值也不会误伤后台（本轮已把 `RATE_PUBLIC_READ_IP_HOUR` 调到 5 做 E2E 验证）。
- 多了一条需要维护的路径与两类配额；两者都必须保留 `requireApiActor` 能力校验，避免「管理员路径」变成绕过授权的后门。
- 管理端缩略图仍是私有缓存（`private, max-age=31536000, immutable`），不进入共享 CDN。
- 后台组件被一条单测护栏约束：`src/components/admin/**` 不得再出现 `/api/community/` 字面量。

## Rejected alternatives

- **按角色豁免公开接口**：实现最小，但任何被窃取的管理员会话等于拿到无限公开额度，且审核员会一并豁免。
- **只调高公开阈值**：等于把反爬护栏拆掉，匿名爬虫同时受益。
