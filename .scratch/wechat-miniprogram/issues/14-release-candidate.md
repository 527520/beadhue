# 14 0.7.0 候选版本与发布证据准备

Status: ready-for-agent
Completion: in-progress
Dependencies: 10、12、13

## 已确认范围

用户要求合入 main、修复 CI 并构建 release；新增原生客户端采用 minor 版本 0.7.0。按 ask-matt 的 PRD → 独立票 → 实施 → 审查流程准备版本与发布说明。frontend-design、awesome-design-md 的既有视觉标准继续适用，本票不修改界面或宣称视觉验收完成。

版本子任务修改 src/lib/appInfo.ts、CHANGELOG.md，并写本票和候选准备记录。依赖安全安装交接后，主任务已同步 package.json / package-lock.json 的版本字段，未改变小程序独立版本。最终候选 SHA 尚未冻结。

## 验收

- 主任务同步根 package.json、lock 顶层及根包版本至 0.7.0；与 APP_VERSION、CHANGELOG 一致。小程序包自身版本单独管理，不通过整份替换 lock 更新应用版本。
- 票 12 定向 E2E 修复、票 13 安全补丁和所有最终变更进入候选，完整远端 CI 与 WeChat workflow 在对应 SHA 通过；保留原审计、覆盖率、E2E、镜像和协议门禁。
- 冻结前完成 CHANGELOG 的最终措辞与日期，随后记录完整候选 SHA；后续代码、依赖、配置或版本变更会产生新候选，不能沿用旧候选的验收结论。
- 物理 iPhone Safari、Android Chrome 完成规定矩阵，六类素材完成与上一版本的人工对照；取得真实结果后才创建当版本两份证据 JSON。
- 单父 evidence-only attestation 仅新增这两份 JSON，引用候选父 SHA；进入受保护 main 后才打稳定 tag。完整 release workflow 全绿及镜像 digest 属于正式镜像发布证据，不等于生产部署或小程序上架。
- 生产备份恢复、迁移与切流，以及小程序备案、隐私、真机和提审分别按各自清单完成，不用候选构建或模拟器证据替代。

## 规范

../spec.md、CONTEXT.md D73、docs/adr/0005-deployment-tencent-docker.md、docs/adr/0028-wechat-personal.md、deploy/scripts/verify-release.sh、deploy/evidence/mobile/README.md、deploy/evidence/algorithm/README.md。

## Comments

2026-10-07：APP_VERSION 与候选 CHANGELOG 已准备为 0.7.0，package/lock 留给主任务同步。现有 v0.6.0 证据仅对应 affd30e9，不能用于最终 0.7.0 候选。本票不新增 passed 证据 JSON、不提交、不打 tag、不触发工作流、不访问生产；详见 ../release-candidate-0.7.0-20261007.md。

2026-10-07：不加载项目依赖的 Node 版本/CHANGELOG 断言及限定文件 diff-check 通过；项目 v3 与引擎 2.0.0 未变。完整版本同步、最终 CI 和真实发布证据尚未完成，Completion 保持 in-progress。

2026-10-07：package/lock 已同步 0.7.0；根 lint 和安全 10/10 测试通过，保留 0 high/critical、14 moderate 的真实审计结论。#14 和完整 CI 通过的共享核心 #15 已合 main；认证/客户端、最终 main CI 与发布证据继续处理。本票不把候选构建宣称为正式镜像发布。
