# 生产依赖修复记录

日期：2026-10-07。基线：`origin/main` / `9a95b456`。工作区：`/Users/wuqian/.codex/worktrees/wechat-release-readiness/doupu`。

## 变更与依据

| 依赖 | 原版本 | 当前锁定版本 | 依据 |
|---|---|---|---|
| Next.js / eslint-config-next | 16.3.4 | 16.3.6 | [官方 16.3.6 安全补丁](https://github.com/vercel/next.js/releases/tag/v16.3.6)，对应 [GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j)，保留 16.3 小版本线 |
| Nodemailer | 9.1.1 | 10.0.15 | [官方发行说明](https://github.com/nodemailer/nodemailer/releases/tag/v10.0.15)；修复地址解析、DNS/TLS 等现有公告；10.x 要求 Node >=20，与 Docker 20 / CI 22 一致 |
| sharp | 0.35.4 | 0.35.5 | [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)，按 Next 已声明的 `^0.35.4` 更新传递依赖及对应平台二进制 |
| source-map-js | 1.2.1 | 1.2.2 | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)，沿现有 `^1.2.1` 传递范围更新 |

仅三项直接版本声明改变；未增加 overrides，未执行 `audit fix --force`，未降低审计等级。Nodemailer 保留现有 SMTP API，无业务代码变更。新增兼容测试在内存生成真实 MIME，覆盖中文主题、收件人信封和 HTML/纯文本双版本，不连接 SMTP 或向外发邮件。

## 验证

- 新工作区独立 `npm ci --no-audit --no-fund --registry=https://registry.npmjs.org` 成功，未复用或改动原小程序工作区的 node_modules。
- CI 原范围 `npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org`：退出 0，0 漏洞。补充 `--workspaces=false`：同样退出 0，0 漏洞。
- `npm run typecheck`：通过。
- 邮件、Nodemailer 兼容、腾讯云 SES、运行配置、Next 配置及 proxy 单元测试：6 文件、27 项全部通过。
- `src/app/api/auth/auth.test.ts` 认证与验证邮件集成回归：1 文件、13 项全部通过。
- `npm run build`：退出 0，Next.js 16.3.6 完成生产编译、TypeScript、89 个静态页面生成及 standalone 输出；字体与协议前置检查通过。
- `git diff --check`：通过。
- 独立 Standards 与 Spec 审查：各 0 项必须修改的问题。standalone 的邮件 chunk 被注册接口 NFT 清单追踪；本次没有对真实 SMTP 外发做验收。
- 额外启动的 `npm test` 因本机可用磁盘下降至约 350MB 主动中断，退出 130，不计为全量通过。随后只清理本工作区已确认 Git 忽略、由本任务生成的 `.next` / `.next-e2e`，恢复约 2.7GiB 可用；未清理用户数据、其他工作区或依赖目录。全量 CI 仍需在此候选提交上执行。

## 尚无补丁的开发依赖及范围边界

`braces@3.0.3` 的 [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) 仍没有发布补丁。此 main 基线的唯一引入链为开发依赖 `eslint-config-next → @next/eslint-plugin-next → fast-glob@3.3.1 → micromatch@4.0.8 → braces@3.0.3`，各节点保留 `dev: true`，不在生产审计范围内。

官方 registry 的最新 `fast-glob@3.3.3` 仍依赖 micromatch，最新 `micromatch@4.0.8` 仍依赖 braces；`@next/eslint-plugin-next@16.4.0` 也仍使用 `fast-glob@3.3.1`。因此没有已核实、可通过现成版本升级移除该开发链的路径。未强制替换为不兼容 major 或捏造安全版本。若要彻底清除此开发风险，应等待上游补丁或上游切换 glob 实现。

原 `feat/wechat-personal` 包含 Taro workspace，审计图与此 main 修复分支不同。本记录的零漏洞仅对应当前工作区的生产依赖，不表示旧小程序分支已自动修复，也不表示已部署到服务器。
