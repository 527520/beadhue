# Firefox 重新裁剪保存诊断

日期：2026-10-07。独立 worktree `wechat-release-readiness/doupu`，基线 main `9a95b456`；未修改原 `feat/wechat-personal`。

## 已运行的真实反馈循环

```sh
E2E_PORT=3327 CI=1 npx playwright test tests/e2e/13-optional-recrop.spec.ts --project=firefox --grep '整图首版' --repeat-each=3 --output=/tmp/beadhue-save-repro-results
```

环境：macOS、Node 22.22.3、Next.js 16.3.6、Playwright 1.62.1、安装的 Firefox 153.0（Playwright revision 1538）。使用现有 globalSetup 的 PGlite 测试库、独立 3327 端口和 `.next-e2e` 输出；每项使用新的浏览器上下文，未接触用户浏览器会话或生产。

结果：3 项通过，0 项失败，0 项跳过；无重试。三项耗时分别 14.2、12.8、13.9 秒；命令总耗时 1.4 分钟。实际经过整图生成、取消裁剪、确认裁剪、再次打开并取消、等待本地保存、刷新恢复原图，以及清除测试上下文原图缓存后的真实缺图提示。原有 30 秒保存断言与全部操作未改变。

现有 globalTeardown 已回收测试服务器；另调用 `waitForPortClosed(3327, 1000)` 验证仅本任务端口关闭。

## 与原 CI 失败的区别

2026-10-05 CI run `37297231674` 的 Firefox 第 1 轮、分片 3/4 在 Linux 上运行 main `9a95b456` 与 Next.js 16.3.4。`13-optional-recrop.spec.ts:51` 等待保存完成 30 秒超时。失败 trace 的裁剪弹窗已关闭，图纸已为 100×100，但顶部仍为「保存中…」；没有浏览器异常或保存 API 请求。源码可将调查范围收敛到本地保存及锁/IndexedDB边界，不能据快照判定具体根因。

本轮采用依赖修复后的 Next.js 16.3.6，且主机为 macOS。三次成功只证明当前环境未复现，不能证明旧 CI 的具体根因已找到或修复。没有修改 Workbench、存储逻辑、E2E等待或跳过条件，也没有增加推测性测试。

票 02 仍为 in-progress：需要同一候选 SHA 的 Linux/Firefox CI 复验。若再次失败，使用保留的 trace，并在实际保存调用链区分进入锁、取得锁、IDB请求及事务完成；取得可复现证据后才决定最小修复。
