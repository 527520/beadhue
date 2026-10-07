# 11 发布依赖修复与剩余阻塞

Status: ready-for-agent
Completion: in-progress
Dependencies: 04、10；以 main 为基线的 Web 安全修复 f9199abb（PR #14，尚未合并）

## 实现范围

把已在 PR #14 验证的 Next.js / eslint-config-next 16.3.6、Nodemailer 10.0.15、sharp 0.35.5、source-map-js 1.2.2 带入原小程序分支。只更新根 package.json、对应 lock 记录及真实 MIME 编译兼容测试；保留全部 Taro workspace、React 18/19 隔离与现有审计门槛，不新增 overrides。

按 ask-matt 的 PRD → 独立票 → 实施 → 审查流程交付；本票不涉及界面变化，frontend-design 与 awesome-design-md 的现有视觉基准不变。使用 Context7 核对 npm 安装语义，并读取当前 Next 自带升级文档。

## 验收

- 增量安装完成且无额外依赖版本漂移；Web React 19 与小程序 React 18 保持隔离。
- Web / 小程序类型检查，以及邮件、认证、配置、mini-auth 和会话测试通过。
- 用官方 registry 按 CI 原范围执行生产依赖审计，完整记录剩余 high / critical；不把 main 的零漏洞结论套用于 Taro workspace。
- 无补丁的 Taro 依赖继续列为发布阻塞。本票不声称完整回归、构建、真机、上传或生产发布完成。

## 规范

批准的 ../spec.md、CONTEXT.md、docs/adr/0028-wechat-personal.md，以及本次明确限定的最小依赖修复范围。

## Comments

2026-10-07：开始增量集成。完整记录见 ../dependency-remediation-20261007.md。实施代理本轮仅修改与限定验证，不提交、推送或操作生产/开发者工具；后续整合由主任务执行。

2026-10-07：限定修复已完成。增量安装更换 12 个本机包，所有 Taro / React 隔离记录未变；Web 与小程序类型检查、13 文件 81 项指定测试通过。官方生产审计仍为 3 critical / 13 high / 8 moderate（exit 1），braces 与 node-forge 无官方补丁，发布阻塞保留；未进行构建、完整回归或发布，故 Completion 仍为 in-progress。

2026-10-07 主任务补充：Spec/Standards独立审查均无必改项；小程序12文件33项完整测试、生产编译/边界/包体检查及Web生产构建通过。依赖审计仍失败，未执行完整Web回归、真机、生产或上传；票仍in-progress。详细结果见修复记录末尾。
