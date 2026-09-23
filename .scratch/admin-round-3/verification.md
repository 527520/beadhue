# R14 验证记录（admin-round-3）

Status: verified（本地门禁全绿；E2E 三浏览器的环境性/顺序性失败见「E2E」小节）
基线：`e70ae17` 之后的工作树（未提交）。所有结论均为**本地**证据；**未发版、未部署、未访问生产**。

## 门禁结果

| 层 | 命令 | 结果 |
| --- | --- | --- |
| 静态 | `npm run lint` | 通过（无输出） |
| 静态 | `npm run typecheck`（`npx tsc --noEmit`） | 通过（无输出） |
| 单测 + 集成 | `npm run test` | **222 文件 / 1688 通过 + 14 跳过** |
| 覆盖率 | `npm run test:coverage` | 通过（门槛 90/75；新增日志与慢查询读路径后补测达标） |
| 性能 | `npm run test:performance` | 4 文件 / 7 通过（200×200/291 色仍 493ms，门槛 2000ms 未放宽） |
| 构建 | `npm run build` | 通过（standalone 产物 + 新增 `/admin/logs` 路由） |
| E2E | `npm run test:e2e`（Chromium/Firefox/WebKit） | 见下方「E2E」小节 |
| 编排 | `docker compose -f docker-compose.prod.yml config` | 通过（`name: doupu`，四个服务的 mem_limit / pids_limit / read_only 生效） |

## 按票的针对性证据

| 票 | 证据 |
| --- | --- |
| 01 按钮尺寸与头像 | `tests/unit/designSystem.test.ts` 新增 4 条护栏（44px 下限必须排除按钮体系、尺寸修饰符必须走 token、后台不得手写 `btn-*`、动作行必须 `align-items`）；E2E `18-admin-round-3` 走查后台列表与详情 |
| 02 弹窗序号 | E2E `18-admin-round-3`：10 份草稿打开发布确认弹窗，断言 `ul.scrollWidth <= clientWidth` 且第 10 行标记在可视区内 |
| 03 草稿原地修订（服务端） | `db/officialBatch.test.ts` 12 通过（含 7 条新的原地修订用例）；`src/app/api/admin/batches/[id]/drafts/[revisionId]/route.test.ts`（401/403、HTTP 修订、幂等重放、版本冲突、空 body） |
| 04/05 生成后编辑与精细编辑器 | `batchSession.test.ts` 38 通过（改标题写回同一修订、改统一参数后重新生成、已发布项不可改）；E2E 覆盖恢复批次→改标题→保存→发布链路 |
| 06 列表分页与内滚动 | 路由测试：works 分页（total/totalPages/页码夹回/白名单 400）、audit 分页；组件测试（WorksManager/TagsManager/GovernanceConsole）；E2E：标签列表默认 10、切 50、跳页、记住选择、列表内部滚动且 `window.scrollY = 0` |
| 07 标签保存与公开状态 | `WorksManager.test.tsx`：保存标签后列表请求次数不变、详情不卸载；路由测试：`public=public|hidden` 语义（含「已下架但有已批准修订」归入未公开） |
| 08 标签管理 | `tags/route.test.ts`：真实链接下 `workCount=2 / publicWorkCount=1`（回归旧实现恒 0 的列名解析 bug）、免理由创建仍写审计；`tags/[id]/works/route.test.ts`：默认只给未打标作品、`has/all` 反向集合、缩略图字段、分页与权限；`TagWorkPicker.test.tsx` 交互；E2E：标签页批量打标后计数变 1 |
| 09 豆社标签与移动端 | `db/communityQueries.test.ts`（停用标签不再筛出、计数一致、`includeTags:false` 少一次查询）、`TagFilter.test.tsx`、E2E `18-community-tags-mobile.spec.ts`（350/390 两列、列表无标签、详情保留） |
| 10 后台限流分离 | `tests/unit/adminScopedPaths.test.ts`（后台不得出现 `/api/community/`）；管理端缩略图/原图路由 + `RATE_ADMIN_*` 配额；E2E：后台三个页面没有任何 `/api/community/` 请求 |
| 11 代理与容器加固 | `docker compose config` 通过；Caddyfile 与 release workflow 结构断言（子代理以脚本核对，未入库）；**Caddyfile 无二进制校验**（见「未验证」） |
| 12 成本与防爬 | `src/app/api/community/**` 集成测试 17 通过（缩略图命中不读库、原图 304、限流 429）；`src/lib/auth`、`src/lib/security` 单测含邮件分桶、登录锁定与过期解锁、robots/sitemap `count(*)` 与缓存、节流路径修正 |
| 13 运行日志 | `src/lib/observability` 31 通过（掩码、脱敏、截断、抑制、ALS、慢查询阈值）；`api/admin/logs` 8 通过（5xx 恰好一行且 requestId 一致、4xx 不落库、权限、筛选与分页、慢查询调用链、同请求编号详情） |
| 14 文案与决策 | `designSystem.test.ts`（组件内零硬编码中文）通过；ADR-0024/0025/0026 已写；CONTEXT 新增 D57–D63 与 R14 事实段；CHANGELOG 增「未发布」小节；`.env.example` 补 R14 新增变量 |

## E2E

- 新增 `tests/e2e/18-admin-round-3.spec.ts`（5 个用例：列表分页与内滚动、公开状态筛选与保存标签不重载、标签批量打标、发布弹窗两位数序号、后台不请求公开接口）。
- 新增 `tests/e2e/18-community-tags-mobile.spec.ts`（350/390 两列、标签筛选交互、列表无标签/详情保留）。
- 全量三浏览器 `npm run test:e2e` 最终轮：**271 通过 / 4 失败 / 22 跳过**（16.3 分钟）；4 项失败中 3 项是第 1 类的环境性失败（三个浏览器各一次），第 4 项（`14` 在 WebKit）已在下一轮针对性修复并通过（WebKit 单跑 7/7）。
- 全量第一轮为 267 通过 / 8 失败；逐条定位后把 4 个非环境性失败全部修掉，并在修复过程中发现两个真实缺陷：合并候选只取当前页、`TagInput` 提交后联想面板不收会挡住紧随其后的按钮（两个都已修）。修复后 18 号后台用例在三浏览器全量跑中全部通过。
- 失败归类：
  1. **环境性（与本次改动无关）**：`16-review-recovery.spec.ts:7` 三个浏览器都失败于 `spawnSync openssl ENOENT`（本机无 openssl，该用例要起本地 HTTPS）。**在基线（git stash 后）复现同样失败**。
  2. **全量跑时的顺序/共享数据库相关，单独跑全绿**：`15-official-batch-recovery.spec.ts:24`（chromium）在「15+18+18」一起跑时通过；`18-admin-round-3` 的分页与标签用例在 firefox / webkit 单独跑 5/5 通过。
  3. **已修复的真回归**：`17-visual-refinement.spec.ts:211`（200% 布局放大）——最初把不分层的 `button:not([tabindex="-1"])` 整条规则排除出按钮体系时同时丢掉了 `min-width: 44px`，flex 容器里的 nowrap 按钮改按 min-content 撑开，同意横幅在 390px×200% 下横向溢出（`scrollWidth` 467 > 390）。改为「高度下限只作用于非按钮体系、宽度下限全保留」，加护栏（designSystem 第 4 条），并与基线逐项对比确认（`scrollWidth` 回到 390、按钮 `min-width` 回到 44px）。
  4. **分页带来的用例维护（已修）**：`16:26` 的路由拦截 glob 加 `*`（GET 现在带 `?page=&size=`）；`12/14` 的列表断言改成先搜索再断言；`14` 的「停用」用键盘空格触发 RAC switch（WebKit 上 uncheck() 偶发不触发受控 onChange）；分页断言按「第 2 页最多一页量」修正。
- 单跑结论（用于区分回归与抖动）：`12`、`14`、`15`、`17`、`18`（admin）、`18`（community）在 chromium 全绿；`18`（admin）在 firefox 5/5、webkit 5/5 全绿。
- 既有 `12-community-governance` 的迁移号断言随 0019 更新。

## 已知未验证 / 交付前需人工确认

1. **Caddyfile 只做人工核对**：本机无 caddy 二进制、Docker daemon 不可用、github.com 直连被墙。`timeouts` 放在服务器级全局选项块（站点块会 `unrecognized directive`），仅影响本实例所有站点。
2. **容器只读根 + tmpfs 未真机验证**：`read_only: true` + `/tmp`、`/app/.next/cache` 的 tmpfs 只在 `compose config` 层确认；需在测试部署上跑一次上传/生成/后台冒烟。
3. **部署前必做**：服务器 `.env` 增加 `BACKUP_COS_SECRET_ID` / `BACKUP_COS_SECRET_KEY`（备份容器刻意不再回退 app 的 `COS_*`），GitHub Secrets 同步这两个名字供每月恢复演练；否则 `backup` 容器启动即失败。
4. **迁移 0019 未对真实 PostgreSQL 执行**：SQL 由 PGlite 测试客户端每次从零重放验证；仍未跑 `node db/migrate.cjs`（未访问任何远程库）。
5. **proxy 的 `s-maxage` 覆盖**只在源码层确认优先级，未做端到端验证。
6. **`pg_stat_activity` 权限分支**只在 PGlite 下降级验证；真实 Postgres 上的「只能看到本连接」提示靠代码审查。
7. **契约变更**：后台列表由游标改为页码分页（`cursor` → `page`/`size`，响应含 `total`/`page`/`size`/`totalPages`）；豆社公开列表/评论仍是签名游标。

## 取舍记录

- 公开缩略图缓存命中不再读库：作品下架后进程缓存内仍可能短时供图（与既有 immutable 缓存同量级），建议后续在下架路径做缓存失效。
- 保存标签的乐观更新依赖服务端返回的新版本号；若写入成功但响应丢失，仍按既有「不确定」流程提示重试。
- 精细编辑器按用户口径做减法：不含镜像/旋转/清空、导出、跟拼、分享、同步。
