# 12 CI 修复与发布门槛核查

Status: ready-for-agent
Completion: in-progress
Dependencies: 04、11

## 已确认范围

PR #17 的 CI run `37597635372`：三个浏览器的分片 2/4 都在后台系统用例等待旧迁移名 `0021_account_profile_and_batch_names` 失败；仓库及真实界面已到 `0022_wechat_personal`。最小修复只令该可见性断言取仓库 migration journal 的最新 tag，保留精确文本匹配，不改产品逻辑、等待、重试或门禁。

小程序 workflow `37597635460` 已通过 npm ci、类型、完整测试及构建。Web coverage、Windows unit、API、性能和静态检查也通过，不能将完整 CI 的失败说成成功；完整 workspace 生产审计仍是独立阻塞。

## 验收

- 在真实后台页面复现旧断言失败；页面显示当前最新迁移。
- 修复后定向运行同一用例的 Chromium、Firefox、WebKit，要求「数据库已执行到的迁移」dt对应dd可见且完整显示 journal 最新迁移；顶部代码日志值不能代替数据库实际值。
- 不增加超时、重试、跳过或放宽审计，不以本机定向结果替代新候选 CI。
- 后续依赖兼容、完整 CI、备份、候选及发布证据由主任务分别核查；本票不自动声明可发布。

## Comments

2026-10-07：本机 Firefox 旧断言真实失败，截图上下文显示 `0022_wechat_personal`；已完成最小断言修改，ESLint 与 diff 检查通过。三浏览器复验在 globalSetup 日志写入时遭 ENOSPC，用例尚未开始，不算通过；只清理本任务 3337 测试进程并确认端口关闭，等待磁盘恢复后继续。命令与证据见 ../ci-release-diagnosis-20261007.md。

2026-10-07：已采纳独立Standards审查P2，实际值断言收窄到对应dd，避免顶部代码journal latest造成假通过。主任务已回收构建缓存恢复磁盘空间；待协调依赖安装暂停后，运行三浏览器定向复验。

2026-10-07：暂停依赖安装后，收窄dd的定向复验3项全部通过（Chromium16.0s、Firefox8.6s、WebKit5.9s，总1.4m）；与先前Firefox旧断言失败构成真实红绿闭环。ESLint/diff-check通过，3337端口已关闭，日志与红灯trace保留。本次E2E缺陷已修；候选完整CI、依赖审计与发布门槛仍待主任务核查，整票继续in-progress。
