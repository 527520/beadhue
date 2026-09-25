# 豆色绘前端全面重构（R15）

Status: done
Completion: complete（01–14 全部完成，2026-09-25）
Baseline: `feat/beadhue-ui-rebuild` @ 78317a9（BeadHue 分支 + R14 合并）
依据：[audit.md](audit.md)（现状问题）· [design.md](design.md)（设计规格）· [prototype/](prototype/)（交互原型，**唯一视觉与交互验收基准**）· 验收截图 [evidence/prototype-final/](evidence/prototype-final/)

## 目标

用户于 2026-09-23 确认原型：「严格按照原型设计；需要加接口、功能、字段的都加；一切由代理决定；最后交付一个完美的作品」。本轮把用户端与管理后台整体重建到原型的设计，删除两层手写样式（`globals.css` 3,206 行 + `beadhue.css` 4,236 行），并补齐原型依赖的接口、字段与功能。

## 不变量

- 业务、权限、隐私与内容合同不变：D1–D63 仍然有效，除非下文明确修订。尤其 D49（公开作品原图）、D50（评论审核）、D51（正式标签由审核员决定）、D53（内容分级与反爬）、D55（评论不可编辑）、BeadHue 的私人原图与原图参照窗规则。
- 图纸协议、项目文件（`beadhue-project` v3，兼容 `doupu-project` v3）、同步 CAS、跟拼进度存本机等数据合同不变。
- 生产 CSP（ADR-0007/0008）不放宽：不得运行时注入无 nonce 的 `<style>`；`style` 属性允许。
- 所有界面文案集中在 `src/messages/zh-CN.ts`。全程中文注释与提交信息；只本地提交，不 push、不部署。

## 决策（实施时写入 CONTEXT.md，编号接 D63）

| # | 决策 | 结论 |
| --- | --- | --- |
| D64 | 前端技术栈 | shadcn/ui 组件模式 + **Base UI**（`@base-ui/react`）原语 + Tailwind v4 + `lucide-react` + `class-variance-authority` / `tailwind-merge`。组件源码放 `src/components/ui/`，全部只引用令牌。重构完成后删除 `react-aria-components`、`beadhue.css` 与 `globals.css` 中的旧组件类，`globals.css` 只保留令牌、字体与极少量基础规则（< 300 行）。日期范围用 `react-day-picker`（静态 CSS）。新增 ADR-0027 记录选型与 CSP 约束。 |
| D65 | 视觉基准 | 原型即验收标准：令牌取 `prototype/styles/tokens.css`，组件形态取 `prototype/styles/components.css` 与各页面原型；主色豆蓝 `#3160E6`；选中态深墨；每视区最多一个主按钮；字体 `BeadHue Text`，`BeadHue Round` 只用于标志字；七级字阶；断点 640/768/1024/1280/1536。签名元素为「豆粒渲染」。 |
| D66 | 信息架构与路由 | 主导航「发现 / 创作 / 我的」。路由见下表；旧路由永久重定向，查询参数尽量保留。 |
| D67 | 缩略图与查看器 | 列表与首页缩略图、未登录详情大图改为服务端豆粒渲染（钉板底、无格线、无板缝），取代 D52 中「带格线与板缝」的要求；详情查看器默认豆粒，放大到每格 ≥14px 自动出现网格，色号仅在方格模式且每格 ≥18px 时显示。未登录可缩放、拖动静态大图，但不提供色号、清单与交互网格（D53 细化）。 |
| D68 | 作者建议标签 | 「公开到豆社」弹窗里的标签是**建议标签**（最多 5 个），随修订保存为 `suggested_tags`，不直接成为正式标签；审核台显示建议标签，审核员可一键采纳为正式标签（写审计）。D51 其余规则不变。 |
| D69 | 统计同意与新手条 | 统计同意改为左下角浮卡（手机在底栏上方），不占页面流，两个按钮同权重；发现页首访显示一行可关闭的新手条。 |
| D70 | 通知 | 新增站内通知：投稿通过 / 驳回、作品被下架或恢复、作品收到新评论。站内铃铛 + 列表 + 已读；不发邮件，保留 90 天。 |
| D71 | 文案单位 | 豆子数量统一用「颗」（原「粒」）。 |
| D72 | 公开流程 | 「公开到豆社」改为编辑器内弹窗（标题、建议标签、原图同意、发布权确认两个勾选框）；`/community/submit` 保留为深链入口，打开对应设计的编辑器并弹出同一弹窗。 |

### 路由（D66）

| 页面 | 新路由 | 旧路由（重定向） |
| --- | --- | --- |
| 发现 / 搜索 | `/`、`/?q=&cat=&sort=&size=&colors=&spec=&since=` | `/community` → `/` |
| 作品详情 | `/community/[id]`（保留，已在 sitemap） | — |
| 作者主页 | `/u/[publicAuthorId]`（新增） | — |
| 创作入口 / 编辑器 | `/app`（入口）、`/app?id=&mode=edit\|stitch`（编辑器） | `/create` → `/app` |
| 我的 | `/me`（设计）、`/me/public`、`/me/likes`、`/me/palettes`、`/me/settings` | `/designs` → `/me`，`/community/mine` → `/me/public`，`/account` → `/me/settings` |
| 色板库（公开） | `/palettes`（未登录可看，布局同「我的 · 色板」的内置部分） | — |
| 投稿深链 | `/community/submit?designId=` → 打开编辑器公开弹窗 | — |
| 后台 | `/admin`、`/admin/<section>`（沿用） | — |
| 账号 | `/login` `/register` `/forgot-password` `/reset-password` `/verify-email`（沿用，改版）；站内需要登录时优先弹出登录弹窗 | — |

## 新增与变更的接口 / 字段（P0 必做，P1、P2 本轮也做）

| 优先级 | 功能 | 接口 / 字段 |
| --- | --- | --- |
| P0 | 我的设计缩略图 | `GET /api/designs/:id/thumbnail?rev=`：仅本人；服务端豆粒 PNG，按修订长期缓存（`private, max-age=31536000, immutable` + ETag）；`GET /api/designs` 列表项带 `thumbnailUrl` |
| P0 | 发现筛选与计数 | `GET /api/community/works` 新增 `size`(s/m/l)、`colors`(few/mid/many)、`spec`(制作规格)、`palette`(品牌)、`since`(天)、`author`(publicAuthorId)、`cat`(标签或 featured) 参数；响应带 `total`（带缓存与节流，遵守 ADR-0021） |
| P0 | 详情色号清单 | 登录用户的详情 DTO 增加 `colorUsage[]`（色号、名称、HEX、颗数，按颗数降序）；未登录只给颜色数与总颗数 |
| P0 | 列表缩略图豆粒化 | `lib/render/thumbnail.ts` 改为豆粒风格（D67），缓存键带渲染版本号 |
| P1 | 我喜欢的 | `GET /api/community/works/liked?cursor=`（登录） |
| P1 | 相似作品 | `GET /api/community/works/:id/related?limit=8`：同标签优先，其次同作者、同色板 |
| P1 | 作者主页 | `GET /api/community/authors/:publicAuthorId`：展示名、作者类型、作品数、获赞、被引用；列表用 `author` 参数 |
| P1 | 搜索建议 | `GET /api/community/search/suggest?q=`：标签、作品、作者各最多 5 条；按 IP 节流 |
| P1 | 类目条 | `community_tags` 增加 `icon`（像素图标数据或内置图标键）、`sort_order`、`featured`；公开标签接口返回；后台标签管理可编辑 |
| P1 | 建议标签 | `community_revisions.suggested_tags text[]`；投稿接口接收；审核台展示与「采纳」 |
| P1 | 我的统计 | `GET /api/me/stats`：设计数、公开作品数、获赞总数 |
| P2 | 后台趋势 | `GET /api/admin/overview/trends?days=7`：每日投稿、点赞、新用户（来自业务事实表） |
| P2 | 通知 | 表 `notifications`（user_id、type、payload jsonb、read_at、created_at）；`GET /api/me/notifications?cursor=`、`POST /api/me/notifications/read`（全部或指定）、未读数；在审核决定、下架 / 恢复、新评论时写入 |

## 页面范围（每页都必须与原型一致）

发现（含搜索、筛选、排序、空结果、新手条）· 作品详情（含未登录、举报、分享、许可、全屏、讨论、相似作品）· 作者主页 · 创作入口（落区、示例、空白画布、导入、新建图纸弹窗）· 编辑器（编辑、跟拼、原图参照、颜色 / 调整 / 信息面板、导出、分享、公开、手机布局）· 我的（设计、公开作品、喜欢、色板、账号设置、空状态）· 登录与账号页 · 通知 · 只读分享页 · 帮助 / 关于 / 隐私 / 社区规范 / 版权 · 404 与错误页 · 管理后台全部模块（总览、审核、评论、举报、作品、标签、批次、人员、分析、审计、日志、系统）。

原型未画到的页面（账号页、分享页、静态页、错误页、后台其余模块）按原型已有的组件与版式推导，保持同一视觉语言。

## 质量门禁（每张票都要满足，最后一张票全量复核）

1. `npm run typecheck`、`npm run lint`、`npm run brand:check`、`npm test` 全绿；不删断言、不加 skip、不放宽超时。
2. 受影响的 E2E 同步更新并在 Chromium 通过；最终票在三浏览器全量通过（含 08 生产运行时 CSP 冒烟）。
3. 视觉对照：真实页面与原型在 1440 / 1024 / 768 / 390 / 350 下逐屏对比（`tools/` 下有截图脚本可参考），布局、间距、字阶、颜色、状态与原型一致；无横向滚动、无折行截断、无遮挡；每视区最多一个主按钮。
4. 无障碍：axe 零 serious/critical；所有纯图标按钮有可访问名称；焦点可见且顺序合理；弹窗焦点陷阱与归还；减少动态生效。
5. 护栏：组件与页面代码中不出现十六进制色值、任意字号 / 圆角（令牌除外），用单元测试扫描约束；不运行时注入 `<style>`。
6. 性能：首页、详情页首屏 JS 不高于重构前；列表缩略图懒加载；编辑器交互不低于现有性能测试阈值。

## 实施票

见 `issues/`。依赖：01 → 03 → (04, 05, 06, 07, 10, 12)；02 → (03, 04, 05, 06, 08, 10, 11)；07 → 08 → 09；全部 → 13 → 14。

## Comments

- 2026-09-24 票 13b（清理）：旧样式 / 旧组件 / react-aria 依赖已删除，`globals.css` 44 行、单一 Tailwind 构建，护栏覆盖全部页面与组件并禁止旧类名；D72 投稿深链与 D71「颗」补齐。门禁：vitest 1547 通过、性能 7/7、构建成功且产物无旧 CSS、Chromium E2E 冒烟只剩已知的 17-visual-refinement 7 条。记录见 issues/13 Comments。
- 2026-09-25 票 14（全量验收）：编排代理亲自完成终审走查（153 场景 × 5 宽度，发现全部关闭）、交互走查 109 步、两轴复核与功能对齐核查。全量门禁通过：typecheck / lint / brand:check、`npm run test`、性能 7/7、三浏览器 E2E 323 通过 / 28 跳过 / 0 失败、`npm run build`、生产运行时冒烟（路由合同 + 33–36，embedded PostgreSQL 16.14）、axe 0 条 serious / critical。首屏 JS 降到重构前以下（首页 −20.8%、详情 −7.7%）。记录见 [verification.md](verification.md) 与 [audit-r15.md](audit-r15.md)。未发版、未部署。

