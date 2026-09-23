# 12 应用层资源成本与防爬补强

Status: ready-for-human
Completion: complete

## 目标
削掉无界成本与最便宜的放大器；补上按账号维度的防爬。

## 范围
- 缩略图：先查缓存再读库、每次请求都计限流、缓存条数+字节双上限。
- 原图 GET：账号+IP 限流、ETag/304、有界 LRU。
- robots/sitemap：`count(*)`、缓存、纳入 proxy 节流、修 `isThrottledPublicPath` 死分支。
- 补限流：`/api/community/tags`、`/api/config`、`/api/analytics/consent`。
- 按账号读配额（小时总量 + 每小时不同作品数、新账号收紧档）。
- 邮件预算拆分（新账号/已建立账号）+ 触发告警（日志）。
- 登录失败按邮箱计数 + 15 分钟 10 次锁 15 分钟（配置化、成功清零、写日志）。

## 验收
单测：缩略图命中不触库、original 304、robots count(*)、账号配额 429、登录锁定与过期解锁、邮件额度拆分。e2e 冒烟。
