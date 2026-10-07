# 原生小程序依赖安全修复（票 13）

2026-10-07，本轮限定修复已完成，尚未提交。**原 CI 生产审计命令退出 0：0 critical / 0 high / 14 moderate**，没有降低阈值、忽略公告、使用 `--force` / `--legacy-peer-deps`，或把原有生产依赖改成 dev 以隐藏风险。完整 Linux CI、Alpine 镜像/standalone 实跑及微信设备验收仍由主流程完成。

## 变更与依据

| 原链路 | 实际处理 | 验证边界 |
|---|---|---|
| `braces@3.0.3` → 递归/循环耗尽 | 私有维护包 `@beadhue/braces@3.0.3-beadhue.1`；128 层解析限制、迭代 AST 检查、子节点/父链循环检查、外部递归数组拒绝、expand 仅使用本轮初始化的队列 | 原算法保留；192 个上游模式/选项样本的 576 结果一致，深层与循环输入在有超时的子进程中受控拒绝。[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) 尚无官方修复，不能把此维护版本说成官方安全版本。 |
| Taro components → Swiper 11.1.15 | 仅对 Taro 4.2.1 components 覆盖为 12.1.2 | 官方修复版本；原生使用微信 swiper 元素，不导入 H5 Swiper 包，实际模块图验证。[公告](https://github.com/advisories/GHSA-hmx5-qpq5-p643) |
| Webpack dev server 4 → selfsigned 2 → node-forge 1.4 | 固定 WDS 5.2.6 与 middleware 7.4.6；selfsigned 5.5 的新依赖链消除 node-forge | WDS 5 支持现有 Webpack 5 / Node 20；原生生产与 watch 不启动 H5 dev server。[WDS 5.2.6](https://github.com/webpack/webpack-dev-server/releases/tag/v5.2.6)、[middleware 公告](https://github.com/advisories/GHSA-g84c-rxfj-3j2c) |
| Taro framework React → Vite 4 optional peer | 移除小程序未使用的 Vite/plugin-react 显式声明；把 React 插件再发行成明确仅支持 webpack5/weapp 的档案，删除其 Vite 相关 optional peers，并在入口拒绝其他编译器/目标 | 全部 dist runtime 字节不变，不把 Vite 8 强行声明兼容 Taro 的 Vite 4 接口。根 Web 测试仍使用原 Vite 8.2.1 / plugin-react 6.0.5。 |
| 小程序 Taro API → H5 WDS 4 optional peer | API 原生再发行包移除 H5 WDS peer；在公开入口前加 weapp 目标守卫 | 原入口主体、公共 types 和其他文件均保留；components 自身使用的原版 Taro 依赖仍留在图内，由真实 WDS 5 覆盖保护。 |

两个 Taro 再发行包分别是 `@beadhue/taro-react-webpack@4.2.1-beadhue.1`、`@beadhue/taro-api-weapp@4.2.1-beadhue.1`，安装键仍为原 `@tarojs/*`，使用已提交 `file:*.tgz`。这避免目录链接把插件的物理解析基点移到根 vendor，误取 Web React 19。原生 React / React DOM 18.3.1、Web React 19.2.8 均实测保持隔离。

两个官方 tarball 经 SHA-512 核验后再打包；150 个原始文件均记录 SHA-256，除 manifest 和公开入口守卫外字节一致。API 原入口主体还单独去掉前缀后核对原哈希。Taro API 原 tarball 未带 LICENSE，复制同一官方版本 React 插件 tarball 的 O2Team 许可原文。详见 `vendor/taro-native/UPSTREAM.json`、README、两份可直接审阅的入口文件及 `scripts/build-native-taro-vendor.cjs`。重新运行生成器所得两份 tgz integrity 完全一致。

## npm 10 与部署路径

- Context7 核对了 npm 的根 overrides、`file:` 替换和 `npm ci` 语义；实际使用 Node 22.22.3 / npm 10.9.8 验证，不仅引用较新 npm 文档。
- 隔离实验发现单独 `overrides.braces=file:vendor/braces` 会生成依赖包内部的错误相对链接。使用根 `dependencies.braces=file:vendor/braces` 加 `overrides.braces=$braces` 后，安装/干净安装/所有真实 consumer 均解析到维护源码。
- 删除 Vite 声明后，npm 仍保留旧 optional peer；强删 lock 节点会错配根 Vite 8，全新无锁解析还会触发 react-refresh peer 冲突。未采用这类不完整图。
- npm 10 对已缓存 workspace target 的 root overrides 传播存在边界：原 `apps/weapp/@tarojs/taro` 保留 WDS 4 peer，普通/精确覆盖不能消除；直接安装 WDS 5 会 ERESOLVE。通过范围明确的原生包消除确实不使用的 H5 peer 后，最终正常安装及 `npm ls` 成立，没有禁用 peer 校验。
- Docker deps 阶段在 `npm ci --workspaces=false` 前 `COPY vendor ./vendor`。隔离目录仅放 package/lock/vendor，按相同命令成功安装 614 包，真实 braces 深度限制/glob正常，Taro、WDS、node-forge 不在该图中。Web 的 Vite 8 测试依赖仍在 builder 中，这不等于进入最终镜像。
- Docker build 后新增 `check-standalone-boundary.cjs`，拒绝 standalone 带入 Taro、H5 服务依赖或维护包/归档；保留 Next 自己 `dist/compiled` 的内部实现。当前只完成该门禁的正反夹具测试，**未在本轮构建完整 Web 镜像，因此最终 standalone 内容仍须 CI 实跑确认**。

## 实际检查

| 检查 | 结果 |
|---|---|
| 原生产审计（workspace 全图、官方 registry） | exit 0；0 critical / 0 high / 14 moderate |
| 正常增量 install / 相关完整 `npm ls` | exit 0，无 invalid peer；Vite 4、node-forge 已移除 |
| 隔离干净 `npm ci` | exit 0，1598 包；之后安全套件 9/9；`npm ls --all` exit 0，无 invalid，但列出 sharp 安装附带的 `@emnapi/runtime`、`@img/sharp-wasm32` 两项 extraneous |
| Docker package/lock/vendor-only 安装布局 | `--workspaces=false` exit 0，614 包；macOS Node 22 复现，不能代替 Node 20 Alpine 完整镜像 |
| `npm run typecheck` / `npm run weapp:typecheck` | 均 exit 0 |
| `npm run weapp:test` | 12 文件 / 33 tests 通过 |
| 安全 suite 与现有 unit CI 桥接 | 9 tests 通过；unit 桥接 1/1 通过，不修改现有 CI 门槛 |
| 额外确定性差分 | 补丁初版与原版 1000 个正常随机模式 × 3 入口 = 3000 结果一致；后续父队列修复由固定 576 结果与新增回归验证 |
| 原生生产构建 | 通过；316 个真实解析模块，无被禁止客户端/构建模块 |
| 原生 watch / 增量重编译 | 强制重新预编译的验证模式下连续 2 次成功；Webpack 图 140 模块，esbuild metafile 178 输入；无禁止模块，随后 SIGTERM 主动关闭进程组 |
| 包体 | main 1,194,592；creation 138,638；account 24,414；export 23,772；workers 1,815,510 字节，全部在原 1.8 MiB 工程预算内 |
| 变更文件 ESLint / diff check | 通过；只为 vendored braces CommonJS .js 放开已有 require 风格规则，未忽略整体 lint |

watch 的预编译使用模块联邦缓存，单看 Webpack 的 140 项会漏掉预编译来源，所以加入 esbuild `metafile.inputs` 检查。`WEAPP_VERIFY_PREBUNDLE=1` 只在验证时强制重建依赖缓存；普通 watch 保持原缓存行为，报告明确区分观测到源输入和缓存命中。报告只保存模块路径/布尔结果，不序列化环境或配置密钥。最后重新执行生产构建，恢复 dist 为生产产物。

## 安全审查与剩余风险

独立审查发现初版可经外部 `parent.queue` 注入循环/15,000 层数组，已改为仅读取当前遍历创建的 Map 队列；公开 `expand` 和直接 `lib/expand` 两入口均补子进程回归。独立只读复核已确认该 P1 关闭，未发现这次修复的新明确旁路。

主任务补充正常共享 DAG 正向契约：同一带 children 的子节点重复引用，经完整性核验的官方 3.0.3 归档实测 compile/stringify 为 `xyxy`、expand 为 `["xyxy"]`，维护版的公开与 lib 入口 6 个断言一致。追加后安全套件 10/10、全仓 lint 与追加测试 lint 通过。最终独立 Spec 与 Standards 审查均无未关闭 required finding；Standards 另核验两份上游 Taro 归档与全部 150 个文件哈希、维护归档、锁和物理解析一致。

当前 14 moderate 是依赖条目及其传播标签，源包包括 Taro 使用的旧 esbuild、Webpack 5.91.0、fflate 0.8.2、sockjs 的 uuid。它们仍在原报告中，没有隐藏或称为零漏洞；例如 fflate 0.8.3 有补丁，但本票按已批准的 high/critical 最小范围没有扩展升级。维护 braces 分支今后需要人工跟踪上游公告，npm 无法自动评价私有分支的代码质量。

证据目录：`evidence/dependency-security-20261007/`，包含 audit JSON、clean install/部署布局结果、监听结果和复核摘要；实际模块列表在 `evidence/module-boundaries-{build,watch}.json`。完整安全测试/生产/watch原始日志保留于被 Git 忽略的 `.artifacts/dependency-security-20261007/`，路径列在 verification-summary，避免提交日志。验证时根版本为 0.6.0，锁哈希见 verification-summary；后续 0.7.0 版本、合并、完整 CI、容器镜像、微信上传和真机均由主任务继续，不在本票声称完成。
