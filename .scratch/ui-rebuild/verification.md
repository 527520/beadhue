# R15 验证记录（票 14 全量验收）

Status: in-progress
基线：`feat/beadhue-ui-rebuild`，R15 起点 `78317a9`，验证到 `518df01`。所有结论都是**本地**证据；**未发版、未部署、未访问生产**。

## 门禁结果

| 层 | 命令 | 结果 |
| --- | --- | --- |
| 静态 | `npm run typecheck` | 通过（无输出） |
| 静态 | `npm run lint` | 通过（无输出） |
| 品牌 | `npm run brand:check` | 通过（新增例外 `src/lib/admin/queries.ts`：系统信息读 `_doupu_migrations` 记账表） |
| 单测 + 集成（门禁口径） | `npm run test`（串行，unit / serial / integration） | 通过：221 文件，1 624 通过、13 跳过，425 s（最终代码 `1217f94`） |
| 性能 | `npm run test:performance` | 通过：4 文件、7 项 |
| 首屏 JS（门禁 6） | `node .scratch/ui-rebuild/tools/first-load-js.mjs`（R15 起点在临时工作树里 `npm ci && npm run build` 后同法测量） | 通过：首页 337.2 KB gzip（起点 426.0，−20.8%）、作品详情 355.3 KB（起点 385.1，−7.7%）；口径为公共入口 + 路由全部段的入口 chunk。修正前曾高于起点（454.1 / 472.1），处理见 audit-r15「交互走查与生产冒烟的发现」；`tests/unit/firstLoadImports.test.ts` 护栏 |
| E2E | `npm run test:e2e`（Chromium / Firefox / WebKit） | 待填 |
| 构建 | `npm run build` | 通过：Next.js 16.3.4（Turbopack），唯一提示是既有的协议预检包体积（1.1 MB） |
| 生产运行时 | `PG_MODE=embedded bash .scratch/ui-rebuild/tools/production-smoke.sh` | 通过：路由合同 `tests/postgres/route-contract.cjs` 退出 0；`playwright.production.config.mts` 的 33（老化管理员会话续期）、34（standalone CSP 下 RSC 导航与生成 Worker）、35（PostgreSQL CAS 并发）、36（长期范围分析含当天已同意数据）全部退出 0 |
| 生产运行时 · 密集数据 | 同上，`AFTER_SMOKE="node .scratch/ui-rebuild/tools/analytics-dense.mjs"` | 通过：89 天 4 791 条原始事件 + 180 天 1 260 行日汇总；近 30 / 90 天与 180 天长期范围在 1440 / 1024 / 768 / 390 / 350 下无横向溢出、axe 0 条 serious / critical、横轴 ≤ 7 个日期、整张折线图 1 个 Tab 位 |
| 无障碍 | axe：走查脚本全路由 + 生产冒烟 36 与密集数据五宽度 + E2E 06 / 16 / 17 | 走查 72 个路由 × 身份 × 宽度组合 0 条 serious / critical；生产侧见上；E2E 待填 |

生产冒烟与 CI 的差别：PostgreSQL 用 embedded-postgres 的官方 16.14 二进制（本机 Docker Desktop 起不来），应用直接跑 `npm run build` 的 standalone 产物而不是镜像；种子行、路由合同与四个冒烟用例与 `.github/workflows/ci.yml` 相同。

## 终审走查（编排代理本人）

- 对照矩阵：153 个场景 × 5 宽度（1440 / 1024 / 768 / 390 / 350），原型 4180 与实现 3170 同状态截图、左右拼图，逐张看过。发现与结论见 [audit-r15.md](audit-r15.md)：自动检查 A1–A2、用户端 V1–V22、后台 B1–B22、票 13 遗留 3 条，全部已修或写明不改理由。
- 修复分七批提交（e24165e、3e5a3ca、4ad7180、80fd407、1712812、f22dbd3、ea263fe），D1 按用户选择改为「2 板 · 58 格、24 色、去背景开」。
- 门禁第一轮（63873ec）：E2E 暴露的删除设计 409、系统页迁移名、重复搜索地标三处应用问题已修；用例按新界面重写。
- 两轴复核（adcd072）：Standards 三路、Spec 三路子代理审 `78317a9...HEAD`，编排代理逐条核实后处理，明细见 audit-r15「票 14 门禁与两轴复核」。
- 三浏览器第二轮（e5c201c）：Safari 点按钮不给焦点时色板弹窗的焦点归还。
- 最终重拍：修复全部落地后实现侧整套矩阵重拍 662 / 662 张无失败，对照图复看无回归；新增令牌工具类在产出 CSS 中全部生成。
- 交互走查与生产冒烟的新发现（0051b5e、b5a67a6、518df01）：`ink-3` 对比度、横向滚动区键盘可达、匿名分析长期范围补回单一分类趋势与「这一天尚未结束」、图例不再相加各日去重访客、折线图适配密集数据、分类统计占比、后台映射表误删成员。明细见 audit-r15「交互走查与生产冒烟的发现」。
- 功能对齐核查：R15 前后文案键对比（删除且文字不再出现的 840 条）逐组核对，结论见 audit-r15 同节。

## 交互走查（`tools/walkthrough.mjs`，109 步全部通过）

记录在 `evidence/walkthrough/walkthrough.json`（本地，不入库），实现服务 3170、审计造数。

| 流程 | 步数 | 覆盖 |
| --- | --- | --- |
| 键盘 | 10 | 第一次 Tab 落在「跳到主内容」→ 跳过顶栏到作品卡 → 回车进详情 → 「用这张制作」弹窗焦点进出 → 进编辑器 → 画布焦点框可见 → 方向键移光标、B 选画笔、回车落笔、⌘/Ctrl+Z 撤销 → Shift+Tab 回「导出」、方向键选「下载 PNG…」、回车下载 → Esc 关弹窗焦点回触发按钮 → 「分享 → 公开到豆社…」开关与焦点归还 |
| 触屏 | 5 | iPhone 视口 + 触摸：轻点作品卡、游客底栏主按钮登录面板、查看器轻点放大、示例生成后轻点落笔、「更多」与底部颜色面板 |
| 减少动态效果 | 2 | `prefers-reduced-motion`：登录弹窗、「更多」菜单动画时长 ≤ 1 ms |
| 200% 缩放 | 16 | 1280 / 1440 视口按 200% 折算（640 / 720 CSS px）：发现、详情、创作、帮助、登录、我的、后台总览、作品管理无横向溢出 |
| 慢网与失败 | 4 | 后台作品表慢网先骨架不闪空状态；后台作品表失败给「重新读取」并可恢复；详情评论失败可重试；我的设计云端失败保留本机列表并给「重试同步」 |
| axe | 72 | 1440 与 390 各 36 个页面：游客 17 个公开页（含搜索结果、作者主页、分享页、404）、用户 7 个（我的五页、编辑器、跟拼）、管理员 12 个后台模块；0 条 serious / critical（排除 Base UI 焦点陷阱哨兵，见 audit-r15） |

## 未验证与遗留

待填。
