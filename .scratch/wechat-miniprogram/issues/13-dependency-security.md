# 13 Taro 依赖安全与构建边界

Status: ready-for-human
Completion: complete
Dependencies: 11；批准的个人版 spec.md

## 范围

按 ask-matt 的独立票交付方式，移除未使用的 Taro Vite 声明并验证可选 peer，限定兼容的 Swiper / Webpack 开发服务补丁；为尚无上游修复的 braces 3.0.3 维护具有真实递归/循环保护的本地分支。保留 MIT 许可、上游哈希和 GHSA 追踪，不假冒新的上游安全版本，不降低审计门槛，不通过改依赖分类隐藏问题。现有 UI、业务、React 18/19 隔离及 frontend-design / awesome-design-md 视觉约定不变。

## 验收

- 正常 braces/micromatch 行为与原版本一致；深层字符串、外部 AST 和循环父链在进入递归前明确拒绝。
- npm 10 本地覆盖与干净 npm ci 均解析到维护包；Docker 安装阶段包含维护包。
- 原命令 npm audit --omit=dev --audit-level=high 真实通过，并保留报告，不把维护分支冒称官方补丁。
- 两端类型检查、小程序测试/构建/监听及真实模块边界通过；不做 Web 全量构建或全量 E2E。
- 记录未验证边界，完整 CI、真机和发布由主任务继续验收。

## Comments

2026-10-07：开始实施。首次隔离实验发现 npm 10 相对 file: override 会产生错误的依赖内部链接；继续验证根依赖锚点后才进入实际安装。

2026-10-07：限定源码与本地验收完成，交主任务审查/整合。主任务批准补充两个只用于 webpack5/weapp 的 Taro 包，保留官方 runtime/types/许可，实际拒绝 H5/Vite；不是将不兼容的 Vite 8 塞入旧 peer。原生产 audit 通过（0 critical/0 high/14 moderate）；正常 install、clean ci、npm ls、Docker安装布局、两端types、mini33测试、安全9测试、生产/监听构建和模块图通过。独立审查发现的外部parent.queue P1已修复并复核关闭。完整证据与未完成的 Linux/Alpine/standalone/设备门槛见 ../dependency-security-20261007.md。

2026-10-07：最终独立 Spec 与 Standards 审查均通过。补正常共享 DAG 的 6 个公开/lib 入口断言，官方完整性校验归档与维护版实测均为 xyxy / [xyxy]，P2 关闭；安全全套 10/10 通过，全仓 lint 与追加测试 lint 通过。Standards 独立核验两个 Taro 归档及 150 个上游文件、实际 React 物理解析、lock、Docker 和模块图，无 required finding。后续最终远端 CI 与镜像仍由主任务验收。
