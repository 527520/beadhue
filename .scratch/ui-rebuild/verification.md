# R15 验证记录（票 14 全量验收）

Status: in-progress
基线：`feat/beadhue-ui-rebuild`，R15 起点 `78317a9`，当前 `adcd072`。所有结论都是**本地**证据；**未发版、未部署、未访问生产**。

## 门禁结果

| 层 | 命令 | 结果 |
| --- | --- | --- |
| 静态 | `npm run typecheck` | 通过（无输出） |
| 静态 | `npm run lint` | 通过（无输出） |
| 品牌 | `npm run brand:check` | 通过（新增例外 `src/lib/admin/queries.ts`：系统信息读 `_doupu_migrations` 记账表） |
| 单测 + 集成 | `npx vitest run`（全部项目并行） | 222 文件 / 1620 通过 + 13 跳过 |
| 单测 + 集成（门禁口径） | `npm run test` | 待填 |
| 性能 | `npm run test:performance` | 待填 |
| E2E | `npm run test:e2e`（Chromium / Firefox / WebKit） | 待填 |
| 构建 | `npm run build` | 待填 |
| 生产运行时 | `npm run test:e2e:production`（standalone + PostgreSQL） | 待填 |
| 无障碍 | axe（E2E 06 / 16 / 17 与走查脚本全路由扫描） | 待填 |

## 终审走查（编排代理本人）

- 对照矩阵：153 个场景 × 5 宽度（1440 / 1024 / 768 / 390 / 350），原型 4180 与实现 3170 同状态截图、左右拼图，逐张看过。发现与结论见 [audit-r15.md](audit-r15.md)：自动检查 A1–A2、用户端 V1–V22、后台 B1–B22、票 13 遗留 3 条，全部已修或写明不改理由。
- 修复分七批提交（e24165e、3e5a3ca、4ad7180、80fd407、1712812、f22dbd3、ea263fe），D1 按用户选择改为「2 板 · 58 格、24 色、去背景开」。
- 门禁第一轮（63873ec）：E2E 暴露的删除设计 409、系统页迁移名、重复搜索地标三处应用问题已修；用例按新界面重写。
- 两轴复核（adcd072）：Standards 三路、Spec 三路子代理审 `78317a9...HEAD`，编排代理逐条核实后处理，明细见 audit-r15「票 14 门禁与两轴复核」。
- 最终重拍：待填。

## 交互走查（`tools/walkthrough.mjs`）

待填：键盘全流程、触屏、减少动态效果、200% 缩放、慢网骨架与失败重试、全路由 axe。

## 未验证与遗留

待填。
