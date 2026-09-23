# 13 运行日志 / 慢查询 / 连接池可观测

Status: ready-for-human
Completion: complete

## 目标
不进服务器就能看到：何时、哪个账号、哪个（掩码）IP、做了什么操作、报了什么错、耗时多少，含慢 SQL 调用链与连接池信息。

## 范围
- 迁移 `0019`：`system_logs`、`slow_queries` + 索引。
- `src/lib/observability/context.ts`：ALS 上下文、`maskIp`、脱敏。
- 捕获：`withApiErrors` 未知错误分支 + `requireApiActor` 写 actor + `instrumentation.onRequestError` + `POST /api/internal/client-error`。
- SQL：`Pool` 注册到 globalThis + `pool.query` 计时，超阈值写 `slow_queries`（含 spans 链），只存参数化语句。
- `dbHealth`：连接池三数、`pg_stat_activity` 汇总、库大小；不启用 `pg_stat_statements`（显示启用步骤）。
- 新模块 `/admin/logs`（错误与事件/慢查询/数据库）+ 4 个 API + `/admin/system` 入口与 24h 5xx 计数。
- 保留期清理 + 每分钟写入上限 + 字段截断。
- 隐私政策新增 §7；ADR-0026。

## 验收
单测（掩码/脱敏/截断/抑制/ALS/阈值）；集成（5xx 恰好 1 行且 requestId 一致、权限 403/200）；e2e（日志页筛选与分页）。
