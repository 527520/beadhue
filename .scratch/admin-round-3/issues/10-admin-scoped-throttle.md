# 10 后台与豆社公开接口限流分离

Status: ready-for-human
Completion: complete

## 目标
后台发布流程不再消耗豆社公开接口配额；公开阈值完全不变。

## 范围
- 新路由：`/api/admin/community/revisions/[id]/thumbnail`（`community:moderate`，独立配额键，immutable 私有缓存）、`PUT /api/admin/community/revisions/[id]/original`（`official:manage`，校验官方草稿归属，独立配额键）。
- `originalsClient` 参数化路径；`thumbnailUrl` 增管理端 URL；`CommunityThumbnail` 增 `scope`；后台四处切换。
- 护栏单测：`src/components/admin/**` 不得出现 `/api/community/`。

## 验收
e2e：公开阈值调到极低（`RATE_PUBLIC_READ_IP_HOUR=5`、`RATE_COMMUNITY_WRITE_USER_HOUR=1`）后后台仍能保存、上传、渲染 50 张缩略图；匿名侧照旧 429。
