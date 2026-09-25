# 14 全量验收与打磨

Status: done
Completion: complete
Blocked by: 13

先读 [实施指南](../implementation-guide.md)。

## 范围

- 全量门禁：`npm run typecheck`、`npm run lint`、`npm run brand:check`、`npm run test`、`npm run test:performance`、`npm run test:e2e`（Chromium / Firefox / WebKit 全部）、`npm run build`、生产运行时 E2E 08（CSP、RSC、Worker）、axe 零 serious / critical。
- 视觉对照：对 spec.md 页面范围内的每个页面与关键状态，在 1440 / 1024 / 768 / 390 / 350 截图，与原型逐一并排检查；列出差异并修复，直到一致。
- 交互走查：键盘全流程（发现 → 详情 → 用这张制作 → 编辑 → 导出 → 公开）、触屏模拟、减少动态、200% 缩放、慢网骨架与错误状态。
- 两轴复核（`review` 技能的 Standards 与 Spec 两个角度）并关闭全部发现。
- 在 `verification.md` 写全部结果与证据路径；spec.md 标记 complete。

- **编排代理亲自终审**（用户 2026-09-24 17:45 要求）：视觉对照与交互走查由编排代理本人完成，不交给子代理判断；方法见 `progress.md`「R15 终审走查」，发现记在 `audit-r15.md`，全部关闭后再跑全量门禁。

## 验收

- 所有门禁通过且有记录；没有未关闭的视觉差异与复核发现。

## Comments

- 2026-09-25 完成。门禁结果、终审走查、交互走查与未验证项见 [verification.md](../verification.md)；走查与门禁中新发现的问题及处理见 [audit-r15.md](../audit-r15.md)「交互走查与生产冒烟的发现」。三浏览器 E2E 因本机内存限制用 `tools/e2e-batched.sh` 分批跑（每批新起开发服务），用例与配置不变。未发版、未部署。
