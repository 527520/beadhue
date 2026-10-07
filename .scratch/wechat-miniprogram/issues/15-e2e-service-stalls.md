# 15 E2E 开发服务停顿与保存故障诊断

Status: ready-for-agent
Completion: in-progress
Dependencies: 12、14

## 问题与范围

认证 PR 的 CI #170（37605003650）出现三处独立失败，不能把迁移断言修复后的所有故障统称为同一问题。

- Chromium 分片 2 的登录请求最终返回 200，但 Next 内部耗时 11.2 分钟、业务处理 324ms；同时记录 filesystem cache 写入 11.4 分钟。CI 每个分片采用全新工作区且不恢复此跨进程缓存，当前仅在 BEADHUE_E2E_BUILD=1 时关闭开发磁盘缓存，普通开发和生产配置保持原值。缓存写入与停顿同期出现；确切因果还需新 CI 验证，不能凭这条日志断言已解决所有失败。
- WebKit 分片 2：深链307和目标HTML200正确，react-dom 基础 chunk 在导航时 Connection reset by peer，页面始终未水合。已保留真实 trace 并仅针对失败 job 重跑一次；尚不能确定连接被哪一层重置。
- Chromium 分片 3：裁剪后图纸生成正确，但30秒内未显示保存完成。已水合、无网络错误，独立调查本地保存的定时器、Web Lock、IndexedDB 和状态阶段，未判定为环境问题。
- main #164 的批次生成停顿由独立调查复现；没有增加业务超时、测试重试或跳过任何断言。

## 验收

- 官方 Context7 与安装的 Next 16.3.6 文档均确认 turbopackFileSystemCacheForDev 可设 false；配置只作用于已有 E2E 标志。
- 对新提交运行完整 CI；保留原始失败报告，缓存配置不改变认证、保存、超时、重试和门禁。
- 本地保存与批次若存在明确代码缺陷，依真实复现做最小修复和回归，不以重跑掩盖。
- 完整候选与 main 的 CI、Docker、数据库/备份验证独立完成。

## 证据

失败 jobs：112738225468（Chromium2）、112738225657（WebKit2）、112738226490（Chromium3）。GitHub原始artifact保留，下载的调查材料分别在 /tmp/beadhue-auth-chromium-{2,3}-170 与 /tmp/beadhue-auth-webkit-170。独立诊断确认业务耗时与构建耗时的区别，确切底层重置原因仍未确定。

规范：spec.md、Next bundled docs/01-app/03-api-reference/05-config/01-next-config-js/turbopackFileSystemCache.md、原CI质量门禁。本票不制造真机/算法通过证据，也不宣称正式 release 完成。
