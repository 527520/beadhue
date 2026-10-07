# 2026-10-07 CI 后台迁移名断言诊断

工作区：原 `/Users/wuqian/project/doupu/doupu`、`feat/wechat-personal`。没有访问生产、操作用户浏览器会话、提交或推送。

## 远端同根因证据

PR #17，head `51fa27147d60617c24358414b18742c72d8b8b9a`，CI [37597635372](https://github.com/527520/beadhue/actions/runs/37597635372) 的 Chromium、Firefox、WebKit 分片 2/4 均失败于 `12-community-governance.spec.ts` 的同一后台系统用例：`getByText('0021_account_profile_and_batch_names')` 15 秒找不到文本。其余 Web 覆盖率、Windows、API、性能、静态检查通过；生产审计另行失败，为3 critical /13 high /8 moderate，不是本次断言问题。

独立小程序 workflow [37597635460](https://github.com/527520/beadhue/actions/runs/37597635460) 全绿，包括 npm ci、类型检查、完整测试与生产编译。不把其中一个 workflow 通过写成整个候选 CI 通过。

## 本机先红证据

环境：Node 22.22.3、Playwright 1.62.1、Next.js 16.3.6，macOS。使用现有 globalSetup：隔离3337端口、`.next-e2e` 构建目录、内存 PGlite 与新的测试浏览器上下文，未复用用户数据。

```sh
E2E_PORT=3337 CI=1 npx playwright test tests/e2e/12-community-governance.spec.ts --project=firefox --grep 'admin 可读取人员' --output=/tmp/beadhue-migration-assert-red
```

结果：exit 1，1项失败，耗时47.8秒；准确失败为旧迁移名的15秒可见性断言。失败的 error-context.md 实际包含「数据库已执行到的迁移」与 `0022_wechat_personal`；trace及上下文保存在上述临时输出目录。不是服务未启动、权限失败或只根据一次远端超时猜测修复。

根因：E2E 硬编码0021；小程序新增0022迁移后，后台按实际已执行迁移正确显示0022。数据库/业务界面没有为旧测试倒退。修复从仓库 `_journal.json` 最新条目取得预期并要求非空，再定位「数据库已执行到的迁移」dt对应的dd，要求该值可见且`toHaveText`完整匹配最新tag，不能用模糊匹配旧/新迁移来装绿。

## 独立审查修正

Standards审查指出：初版全页精确文本定位仍可能命中顶部的代码journal latest（实际迁移为空时也可显示），从而漏掉下方数据库实际值为「未记录」。已只收窄测试定位到现有`Dl`的dt父节点内dd，保留journal非空防护、可见性与完整文本断言；没有修改产品界面。

## 首次复验环境阻塞（随后已解除）

```sh
E2E_PORT=3337 CI=1 npx playwright test tests/e2e/12-community-governance.spec.ts --project=chromium --project=firefox --project=webkit --grep 'admin 可读取人员' --output=/tmp/beadhue-migration-assert-green
npx eslint tests/e2e/12-community-governance.spec.ts
git diff --check -- tests/e2e/12-community-governance.spec.ts
```

三浏览器命令在 globalSetup 的 WriteStream 写日志时以 `ENOSPC: no space left on device, write` 退出1；尚未进入用例，没有修复后绿色证据。ESLint、diff检查exit0。清理仅经命令行确认属于本任务3337端口的Next测试进程组并核查端口关闭，没有删用户数据或其他缓存；当时 Data卷仅余126MiB、容量100%。

这次未取得绿色证据；后续磁盘恢复后的实际复验见下。未改变任何超时、重试、工作流、审计规则或生产配置。

## 收窄实际数据库值后的三浏览器复验

主任务回收本任务可重建构建缓存后，磁盘可用8.9GiB；协调安全代理暂停原目录依赖安装，保持三浏览器运行时的node_modules稳定。实际运行：

```sh
E2E_PORT=3337 CI=1 npx playwright test tests/e2e/12-community-governance.spec.ts --project=chromium --project=firefox --project=webkit --grep 'admin 可读取人员' --output=/tmp/beadhue-migration-assert-green > /tmp/beadhue-migration-assert-green.log 2>&1
```

结果：exit0，3项通过、0失败、0跳过，无重试，总1.4分钟。Chromium16.0秒、Firefox8.6秒、WebKit5.9秒；每项都验证了「数据库已执行到的迁移」对应dd可见、文本完整等于journal最新tag。ESLint及限定文件diff-check再次通过。

保留原Firefox红灯的`/tmp/beadhue-migration-assert-red` trace/error-context、绿色标准输出`/tmp/beadhue-migration-assert-green.log`及服务日志`/tmp/beadhue-migration-assert-green-dev.log`。绿色用例按现有retain-on-failure策略不生成新trace，未修改该策略。现有globalTeardown正常退出，再以`waitForPortClosed(3337,1000)`确认仅本任务测试端口关闭后，已通知主任务释放依赖安装临界区。

本机定向红绿闭环已经完成；新候选完整远端CI、剩余依赖审计及正式发布门槛仍由主任务核查。本轮没有提交、推送或访问生产。
