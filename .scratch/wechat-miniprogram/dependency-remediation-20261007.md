# 小程序分支发布依赖修复（2026-10-07）

关联：任务票 [11-release-readiness](issues/11-release-readiness.md)、[批准 PRD](spec.md)。

结论：已将以 main 为基线的 Web 修复 `f9199abb`（PR #14，尚未合并）的最小依赖修复带入 `feat/wechat-personal` 并完成限定验证。整个 workspace 的生产依赖审计仍失败，**发布阻塞尚未关闭**。PR #14 的 Web-only 审计通过不能代替此分支的 Taro 依赖审计，也不能代替构建、真机或生产验收。

## 实际变更

| 包 | 原锁定版本 | 本次锁定版本 |
|---|---|---|
| next / eslint-config-next | 16.3.4 | 16.3.6 |
| nodemailer | 9.1.1 | 10.0.15 |
| sharp | 0.35.4 | 0.35.5 |
| source-map-js | 1.2.1 | 1.2.2 |

只更新根 package.json 的三项声明、锁文件根元数据及 41 个目标包记录，包括 Next env/eslint/SWC、sharp 各平台包和 libvips 1.3.4。版本、下载地址和完整性值取自 `git show f9199abb:package-lock.json` 的已验证对应记录；保留本分支的依赖分类标记，再由 npm 增量安装确认。没有整份替换 main 锁文件，没有新增或删除锁文件包节点。

逐项比较确认：`apps/weapp`、`packages/core`、全部 `@tarojs` 及 React 记录保持原样。实际安装的 Web React / React DOM 为 19.2.8，小程序为 18.3.1；Taro 仍为 4.2.1。未改动审计脚本、依赖覆盖规则或应用功能。

从同一提交移入 `src/lib/auth/nodemailerCompatibility.test.ts`：使用真实 Nodemailer stream transport 验证中文主题、信封地址和 HTML/纯文本 MIME 双版本，不连接 SMTP。

## 安装与限定验证

运行环境：Node v22.22.3、npm 10.9.8。执行 `npm install --no-audit --no-fund --registry=https://registry.npmjs.org`，5 秒完成，仅更换 12 个本机包。安装阶段关闭附带审计后，另行执行下述完整审计，没有跳过安全门槛。未运行全量 `npm ci`。可用磁盘从约 2.1 GiB 降至约 1.8 GiB，未继续安装或构建。

| 检查 | 结果 |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run weapp:typecheck` | exit 0 |
| Web unit：mailer、nodemailerCompatibility、tencentSes、runtimeConfig、nextConfig、proxyMetadataCost | 6 文件、28 项通过 |
| Web integration：auth、transitions、session-cookie、session-expiry、mini、me/sessions | 6 文件、48 项通过 |
| 小程序 platform/network | 1 文件、5 项通过 |
| 新增兼容测试 ESLint；`git diff --check` | exit 0 |
| 锁文件 workspace / Taro / React 隔离断言 | 通过，无额外版本漂移 |

共 13 个测试文件、81 项测试通过。测试命令使用本地 `node_modules/.bin/vitest`，Web 选择对应 `unit` / `integration` project，小程序使用自身 `vitest.config.ts`。网络测试显示已有的 Vite 未来 configLoader 格式提示，不影响执行结果。

本轮按指定范围未执行 Web 构建、小程序构建、完整测试套件、E2E、开发者工具、真机、生产操作或发送邮件。没有提交或推送。这些结果仅为当前本地增量修复的证据。

## 审计结果与实际部署边界

2026-10-07 使用官方 registry 执行 CI 原命令：

```sh
npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org
```

| 范围 | 修复前 | 修复后 | 退出码 |
|---|---|---|---|
| CI 原 workspace 范围 | 4 critical、16 high、8 moderate | **3 critical、13 high、8 moderate** | 1 |
| 补充 `--workspaces=false` | 1 critical、5 high | **0 critical、2 high** | 1 |

两次审计前后锁文件逐字节不变。补充 root 过滤仍报告 braces / micromatch，因为共享 lock 中这些节点也被 Taro 生产依赖链使用；这不是已验证的 Web standalone 镜像清单。

Dockerfile 使用 `npm ci --workspaces=false`，`.dockerignore` 排除 `apps/weapp`，运行镜像复制 Next standalone 与指定运行资源。因此不能把整个 workspace 的漏洞数量直接说成生产可利用漏洞数量；也不能用 Docker 范围去改小 CI 审计、宣称小程序依赖已安全。是否进入最终产物以及可达性需另有构建/追踪证据。

本次已清除的公告：

- [Next GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j)：最低修复 16.3.6。
- [Nodemailer GHSA-v53p-9fqp-m79j](https://github.com/advisories/GHSA-v53p-9fqp-m79j)、[GHSA-prgh-xp8r-p3m5](https://github.com/advisories/GHSA-prgh-xp8r-p3m5)：分别从 10.0.6 / 10.0.5 修复；本次沿用 10.0.15，同时覆盖原版本其余已知公告。
- [sharp GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)：最低修复 0.35.5。
- [source-map-js GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)：最低修复 1.2.2。

## 尚未解决的 Taro 风险

| 根源包 | 当前版本 / 严重级别 | 官方修复与兼容边界 |
|---|---|---|
| Swiper | 11.1.15 / critical | [公告](https://github.com/advisories/GHSA-hmx5-qpq5-p643)从 12.1.2 修复；Taro components 精确固定 11.1.15，不能未经兼容验证直接跨 major override。 |
| braces | 3.0.3 / high | [公告](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)明确 **Patched versions: None**。最新 micromatch 4.0.8 仍依赖 braces；Taro helper → chokidar / find-yarn-workspace-root，以及 scss-bundle、开发服务器代理链均涉及它。 |
| node-forge | 1.4.0 / high | [公告](https://github.com/advisories/GHSA-86w9-cpqp-85rv)明确 **无已发布补丁**；来自 webpack-dev-server → selfsigned → node-forge。 |
| Vite | 4.5.14 / high | [公告](https://github.com/advisories/GHSA-fx2h-pf6j-xcff)最低修复分支 6.4.3；Taro 框架插件的 optional peer 仍为 `^4`。本项目只用 webpack5，移除未使用的 Vite/plugin-react 显式依赖是后续调查方向，尚未验证 npm peer 解析与完整构建，不能标为解决。 |
| webpack-dev-middleware | 5.3.4 / high | [官方公告](https://github.com/advisories/GHSA-g84c-rxfj-3j2c)列出 7.4.6 / 8.3.0；[7.4.6 发布说明](https://github.com/webpack/webpack-dev-middleware/releases/tag/v7.4.6)确认输出目录越界修复。公告正文仍称未回移到 7.x，与版本字段不一致，故不从范围边界推断 7.4.5 已安全。现有 WDS 4 要求 `^5.3.4`，需上游开发服务器迁移，不能当作同范围补丁。 |

当前审计完整 high/critical 包名：

- critical（3）：`@tarojs/components@4.2.1`、`@tarojs/taro@4.2.1`、`swiper@11.1.15`。
- high（13）：`@tarojs/helper@4.2.1`、`@tarojs/runner-utils@4.2.1`、`braces@3.0.3`、`chokidar@3.6.0`、`find-yarn-workspace-root@2.0.0`、`http-proxy-middleware@2.0.10`、`micromatch@4.0.8`、`node-forge@1.4.0`、`scss-bundle@3.1.2`、`selfsigned@2.4.1`、`vite@4.5.14`、`webpack-dev-middleware@5.3.4`、`webpack-dev-server@4.15.2`。

上述计数包括由依赖问题连带标记的包，并非 16 个独立漏洞。官方 registry 当日最新 Taro 4.3.0 的 components 仍精确固定 Swiper 11.1.15，framework-react 仍要求 Vite `^4`，webpack5-runner / taro 仍使用 WDS 4 范围，helper 仍保留 chokidar 3 / find-yarn-workspace-root 2。因此直接整体升级 Taro 也不能清除这些阻塞。未采用 npm 自动修复建议中的 Taro 3.x 降级，也未强制覆盖不兼容 major。

## 后续门槛

本票内最小依赖修复与限定检查已完成；票的总体发布准备仍为 in-progress。Taro 依赖链需要独立兼容迁移或上游补丁，再重新审计与构建验收。后续 Web/小程序构建、完整回归和发布操作由主任务分别安排；AppID、域名、备案、隐私、真机、视觉与提审状态以各专门记录为准，本报告不替其背书。

## 主任务补充验证与审查

2026-10-07：Spec、Standards 两类独立只读审查均无必改项。主任务随后运行小程序完整测试（12文件33项）、生产编译及323输入依赖边界检查，均通过；主包1,194,592、creation 138,638、account 24,414、export 23,772、workers 1,815,510字节，全部低于1.8MiB工程预算。Webpack仍有通用244KiB性能提示，未通过修改阈值消除。

同一改动状态下 `npm run build` 通过：Next.js16.3.6、TypeScript、95静态页和全部新增mini路由成功生成。这里只代表本地构建，未执行完整Web回归、真机或生产操作；剩余审计和发布门槛继续保留。
