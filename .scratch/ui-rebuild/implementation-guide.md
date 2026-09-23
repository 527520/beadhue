# R15 实施指南（每张票都先读）

仓库：`/Users/wuqian/project/doupu/doupu`，分支 `feat/beadhue-ui-rebuild`。产品「豆色绘 / BeadHue」：Next.js 16（App Router，读 `node_modules/next/dist/docs/` 里的对应指南再写代码）+ React 19 + TypeScript + Drizzle + PostgreSQL（开发 / 测试用 PGlite）。

## 必读

1. [spec.md](spec.md)：目标、不变量、决策 D64–D72、路由、接口、门禁。
2. [design.md](design.md)：令牌、组件规范、逐屏设计。
3. 你这张票对应的原型：`prototype/js/screens/*.js`、`prototype/styles/screens/*.css`，以及共享的 `prototype/styles/{tokens,base,components,layout}.css`、`prototype/js/{ui,beads,data}.js`。**原型是验收基准**：结构、层级、文案、间距、状态、响应式行为都照它实现。原型里的模拟数据换成真实接口。
4. 验收截图：`evidence/prototype-final/*.png`（桌面 1440 与手机 390）。更多状态（弹层、菜单、抽屉、未登录等）用 `tools/shoot-prototype.mjs`、`shoot-states.mjs`、`shoot-detail.mjs`、`shoot-create-editor.mjs`、`shoot-me.mjs` 从原型重新生成到 `evidence/prototype/`（该目录不入库）。
5. `CONTEXT.md` 与 `docs/adr/`（业务合同），`AGENTS.md`。

## 查看原型

在仓库根目录 `python3 -m http.server 4180`，打开 `http://127.0.0.1:4180/.scratch/ui-rebuild/prototype/index.html#/…`（评审页 `review.html`）。

## 运行应用与种子数据

```bash
ulimit -n 65536
PORT=3100 NEXT_TELEMETRY_DISABLED=1 DATABASE_URL= PGLITE_DATA_DIR= BEADHUE_E2E_SEED=1 BEADHUE_E2E_BUILD=1 \
RATE_LOGIN=1000 RATE_REGISTER=1000 RATE_TOKEN=1000 RATE_COMMUNITY_WRITE_USER_HOUR=10000 RATE_COMMUNITY_WRITE_IP_HOUR=10000 \
RATE_PUBLIC_READ_IP_HOUR=20000 RATE_PUBLIC_PAGE_IP_MINUTE=5000 RATE_ORIGINAL_USER_MINUTE=1000 RATE_ORIGINAL_USER_HOUR=10000 \
RATE_ORIGINAL_IP_MINUTE=1000 RATE_ORIGINAL_IP_HOUR=10000 RATE_SYNC_WRITE=10000 LOGIN_FAILURE_THRESHOLD=1000 \
node node_modules/next/dist/bin/next dev -p 3100 -H 127.0.0.1
```

内存库，重启即清空。种子账号：`e2e-admin@example.com` / `e2e-user@example.com` / `e2e-moderator@example.com`，密码 `E2e-pass-123!`。`node .scratch/ui-rebuild/tools/capture-current.mjs seed` 可补 12 件样例作品、标签、点赞与 4 份云端设计（脚本内有接口用法，可按新接口调整）。E2E 自己会在 3100 起服务，跑 E2E 前先停掉手动起的服务。

沙箱提示：开发服务、Playwright、端口访问需要 `required_permissions: ["all"]`；Playwright 需 `PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright"`；npm 走公司镜像需要 `full_network`，并用 `--cache ./.npm-cache`；`npm install` 若只改写了锁文件无关元数据（如删掉 `libc` 字段）要还原。

## 实现约定

- 组件：`src/components/ui/` 下的 shadcn 风格组件（票 01 建立）。页面只组合这些组件与 Tailwind 工具类；颜色、字号、圆角、阴影、间距一律用令牌（`bg-bg-subtle`、`text-ink-3`、`rounded-lg` 等映射到 `@theme`），不写十六进制、不写任意值。
- 图标：`lucide-react`，默认 20px、线宽 1.75。纯图标按钮必须有 `aria-label`，桌面配 Tooltip。
- 每视区最多一个主按钮；选中态深墨；禁用不用半透明；错误挂在字段下；空状态主按钮唯一。
- 响应式：移动优先；断点只用 sm/md/lg/xl/2xl；卡片内部用容器查询。
- 文案进 `src/messages/zh-CN.ts`，照原型措辞；动作命名前后一致；单位「颗」。
- 旧组件与旧样式：本票替换掉的页面不再引用旧类；旧文件在票 13 统一删除，删除前不要让新代码依赖它们。
- 数据库变更：新迁移编号从 0020 起，带 down 文件与 drizzle 快照；更新 `db/schema.ts`；PGlite 集成测试覆盖。
- 测试：新增 / 修改的组件与接口要有单元或集成测试；受影响的 E2E 同步改（选择器优先用 role 与可见文案）。

## 验收（提交前自己跑完）

1. `npm run typecheck && npm run lint && npm run brand:check`
2. `npm test`（或至少受影响的 vitest 项目；最后一张票跑全量）
3. 受影响的 E2E：`npx playwright test tests/e2e/<文件> --project=chromium`
4. 视觉对照：起应用，用 Playwright 在 1440 / 1024 / 768 / 390 / 350 截取你负责的页面和状态，与原型同状态截图并排检查（可参考 `tools/shoot-prototype.mjs`、`tools/shoot-final.mjs` 的写法），用 Read 工具亲自看图，修到一致。截图放 `.scratch/ui-rebuild/evidence/impl/<票号>/`。
5. 在票文件末尾 `## Comments` 下写实施记录：做了什么、验证结果（命令与数字）、与原型的有意偏差及原因、遗留问题。把票头 `Completion:` 改为 `complete`。

## 提交

每张票完成后本地提交一次（可分几个提交），信息用中文，如 `feat(ui): R15-01 设计令牌与组件底座`。只 `git add` 与本票相关的文件；**不要**提交 `.scratch/site-ux/*.png`、`.scratch/ui-polish-2026/evidence/`（用户已有改动）和 `.scratch/ui-rebuild/evidence/` 下的截图（体积大）。不 push，不建 PR。
