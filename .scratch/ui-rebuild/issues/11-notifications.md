# 11 通知中心（前端）

Status: ready-for-agent
Completion: complete
Blocked by: 02、03

先读 [实施指南](../implementation-guide.md)。后端见票 02（`/api/me/notifications`）。

## 范围

- 顶栏（桌面放在「上传图片」左侧；手机在发现页顶栏的铃铛位）铃铛图标按钮 + 未读红点 / 数字（深墨小胶囊，主色不用于徽标以外的地方同原型规则）。
- 点击打开弹出层（手机底部面板）：通知列表（图标 + 一句话 + 相对时间 + 跳转目标：作品详情、我的公开作品、评论位置）、「全部已读」、空状态（豆粒插画「还没有新通知」）、加载更多。
- 打开时标记可见项为已读；页面聚焦时轮询或在导航时刷新未读数（不做长连接）。
- 文案覆盖：投稿通过、未通过（附原因入口）、作品被下架 / 已恢复、收到新评论。

## 验收

- 截图与原型组件语言一致（弹出层、空状态）；单元测试覆盖未读数、全部已读、跳转；一条 E2E：审核通过后作者看到通知（Chromium）。门禁全绿。

## Comments

### 实施记录（2026-09-24，分支 `feat/beadhue-r15-11-notifications`）

**做了什么**（新代码集中在 `src/components/notifications/`）
- `notification-model.ts`（纯函数）：接口形状（类型从 `lib/notifications/service` 只导入类型）、每类一句话（未通过附「原因：…」）、跳转目标、相对时间（刚刚 / N 分钟前 / N 小时前 / N 天前 / 超 30 天写日期）、徽标数字（>99 写 99+）；不认识的类型过滤掉。
- `use-unread-count.ts`：页面级共享未读数仓库（`useSyncExternalStore`），两个顶栏的铃铛只发一次 `GET /api/me/notifications/unread-count`；挂载（每页各自渲染 SiteShell，换页即重新挂载）、窗口聚焦、标签页回到前台时刷新，3 秒内合并；换账号清零并作废在途请求；401/403 视为 0。
- `notification-center.tsx`：打开即取第一页（骨架 → 列表 / 空状态 / 失败重试）；未读条目露出 ≥60%（IntersectionObserver，无则按渲染即露出）攒 400ms 批量 `POST /read {ids}`，徽标先乐观扣减再以响应校正，本次打开仍保留未读圆点；「全部已读」`POST {}` 立即清圆点与徽标、按钮收起；「加载更多」按游标追加去重；点条目先标已读、收起弹层，经 `ShellLink` 跳转（工作台离开拦截生效）。
- `notification-bell.tsx`：只对已登录用户渲染；深墨小胶囊徽标（`bg-ink text-on-ink ring-2 ring-bg`，不用主色）；桌面锚定弹出层（360 宽，列表区 `max-h-popover-list` 内滚动），`sheet` 变体为底部面板，标题行「通知 · 全部已读 · 关闭」。
- 外壳最小接入：`site-topbar.tsx` 在「上传图片」左侧放铃铛（`account` 为真时）；`mobile-topbar.tsx` 发现页已登录放铃铛（`sheet`），游客回落为「登录」；删除票 03 的占位 `shell/notification-bell.tsx`。后台不用 SiteShell，天然没有铃铛。
- 共享文件只追加：`zh-CN.ts` 新增 `notifications` 段（铃铛名称沿用 `shell.notifications.label / unread`）；`theme.css` `@source`；`uiScanned.ts`；`beads.ts` 的空状态插画加 `notifications`（豆粒金铃铛）。
- 图标：通过 CircleCheck（成功软底）、未通过 CircleAlert / 下架 EyeOff（危险软底）、恢复 RotateCcw（成功软底）、评论 MessageCircle（中性）。

**验证**
- `npm run typecheck`、`npm run lint`（全仓）、`npm run brand:check`：通过。
- 单测 `src/components/notifications/notifications.test.tsx` 12 条（模型：跳转 / 文案 / 相对时间 / 徽标 / 插画；铃铛：游客不显示、99+ 与两铃铛一次请求、聚焦与换页刷新、打开后露出即已读、IntersectionObserver 只标露出项、全部已读、点击跳转并收起、空状态 / 失败重试 / 加载更多、手机底部面板标题行的「全部已读」）+ 外壳测试更新；连续 3 次 22/22 通过。全量 vitest 结果见下。
- E2E `tests/e2e/19-notifications.spec.ts`（Chromium）：作者经接口投稿 → 审核员在后台界面通过 → 作者站内换页后铃铛「有 1 条未读通知」、徽标 1 → 打开后新通知在首条且带圆点、徽标消失、服务端未读 0 → 点击进入 `/community/<workId>` → 390 宽发现页底部面板可见同一条。两次运行均通过（1.1m / 37.7s）。
- 相关 E2E（Chromium）：12 社区治理、18 手机类目、06 无障碍响应式、01 登录旅程共 43 条，40 过；06 的两条工作区用例（旧工作台选择器）在主工作区基线同样失败，12 的官方批次用例因与全量 vitest 并发超时，单独重跑通过。
- 截图 `.scratch/ui-rebuild/evidence/impl/11/`（不入库，脚本 `tools/shoot-notifications.mjs`，含 `seed` 造通知）：徽标 1440/1024/768/390/350、打开 1440/1024/768/390/350、空状态 1440/390、游客 1440/390，全部无横向溢出。

**与原型的偏差**
- 原型没有通知屏（发现页手机顶栏的铃铛只弹提示「暂无新通知」），弹出层 / 底部面板 / 空状态 / 计数胶囊按原型 `components.css`（.popover、.dialog 手机底部面板、.empty.compact）与 `discover.css .count-badge` 推导。
- 原型游客也显示铃铛；按已定事项游客不显示，发现页手机顶栏改为「登录」。
- 下架通知不带理由：原型后台写「作者会在通知里看到这条理由」，但票 02 的 payload 有意不存下架理由，只能引导到「我的公开作品」。
- 4180 原型服务在本轮返回空响应，未能生成原型同状态截图；对照依据为原型 CSS 与 `evidence/prototype-final`。

**遗留**
- `zh-CN.shell.notifications.empty`（票 03 占位文案）已不再使用，按「只追加」约定未删，票 13 清理。
- 评论锚点 `#comment-<id>` 依赖票 05 保留评论 `id` 并在评论异步加载后按 hash 滚动；`/me/public` 需在票 06 显示驳回原因。
- `Workbench.test.tsx` 在负载下有 6–7 条随机超时（去掉铃铛对照同样存在），属票 08 范围。
- 开发服务长时间运行后可能对已有 API 路由回 HTML 404（本轮审核接口遇到一次，重启恢复）。
