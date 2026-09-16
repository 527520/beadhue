# 豆谱（DouPu）

[![CI](https://img.shields.io/github/actions/workflow/status/527520/doupu/ci.yml?branch=main)](https://github.com/527520/doupu/actions)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/github/package-json/v/527520/doupu)](https://github.com/527520/doupu)

**把照片与像素画变成可编辑、可跟拼、可打印的拼豆图纸。**

豆谱是一套免费、开源、无广告的拼豆创作工具：在浏览器本地生成图纸，进行像素级修补，查看用豆量与采购清单，导出 PNG、打印版 PDF 或可继续编辑的项目文件。登录后可同步私人设计与自定义色板，也可以把作品投稿到「豆社」，与其他创作者分享、互动和引用。

图纸生成使用传统色彩匹配、量化与抖动算法，不提供 AI 图像生成或美化功能。社区评论审核可接入腾讯云文本内容安全服务，与本地制图流程分开。

```text
选择图片 → 自动生成整图首版 → 按需裁剪 / 调参 → 编辑修补 → 跟拼 / 导出
                                            └→ 保存设计 / 只读分享 / 投稿豆社
```

[功能亮点](#功能亮点) · [色板与制作规格](#色板与制作规格) · [页面与交互](#页面与交互) · [数据与隐私](#数据与隐私) · [快速开始](#快速开始) · [生产部署](#生产部署) · [更新日志](CHANGELOG.md)

## 功能亮点

| 模块 | 当前能力 |
|---|---|
| 本地制图 | 图片选择与拖拽上传、整图自动生成首版、可选裁剪；目标宽度与颜色数量、抖动、主色/平均色取样、亮度/对比度、背景去除与手动背景取样；生成任务可取消 |
| 像素编辑 | 画笔、橡皮、吸管、油漆桶、按色号替换、撤销/重做；支持空白画布起稿，也可对已有图纸换色板重映射，保留手工修补 |
| 移动画布 | 有界视口、平移缩放、双指捏合、手指放大镜；显式区分手形导航与编辑工具，移动端画笔/橡皮默认精准落点模式 |
| 色板与板型 | 13 套内置色板、自定义色板新建/编辑/导入、套装档位；支持 5mm 与 2.6mm 迷你豆制作规格，板缝与导出几何随规格变化 |
| 跟拼与采购 | 逐格、板内整行标记，查看完成进度并定位下一处未完成位置；按色号统计颗数、换算采购包数、一键复制采购清单 |
| 导出与打印 | 带格线与色号的 PNG、可选图例、分页打印 PDF、项目 JSON；PNG 图纸与图例合并超限但可分别导出时，自动分成两张图片打包 ZIP |
| 保存与分享 | 未登录可本地保存多个设计、自动保存与刷新恢复；登录后云端同步设计与自定义色板，冲突保留可恢复副本；可创建和撤销只读分享链接 |
| 豆社社区 | 作品搜索与筛选、标签、精选展示、投稿及修订审核、引用为私人设计、点赞、评论、举报与个人投稿管理 |
| 管理后台 | 作品/评论审核、举报处理、标签管理、官方批量制图、账号与角色治理、操作审计、分析仪表板和系统状态 |

生成参数中的目标宽度为 **20–200 格**，目标颜色数为 **2–128 色**，图纸尺寸上限为 **200×200 格**。默认参数可由部署配置覆盖，类型定义见 [`src/lib/types.ts`](src/lib/types.ts)。

### 导出与项目兼容性

PNG 使用不透明白底；PDF 包含图纸、图例与色号用量清单。制作规格决定板缝、跟拼分板及相应导出布局，不能把不同板型视为同一种物理底板。

项目文件采用严格的 **`doupu-project` v3** 协议，保存图纸、参数、色板选择、套装档位和制作规格。**不读取或静默迁移 v1/v2 项目**，也不接受未知色板或未知制作规格。项目文件不包含原图、本地生成源或跟拼进度。

## 色板与制作规格

### 13 套内置色板

| 分组 | 色板 |
|---|---|
| 豆谱经典版（5 套） | MARD、COCO、漫漫、盼盼、咪小窝 |
| 外部资料版（6 套） | MARD 291、COCO 291、漫漫 278、盼盼 289、咪小窝 290、MARD 221 核对版 |
| Artkal（2 套） | Artkal C 197、Artkal M 221 |

同品牌的不同资料版是独立色板，不会混作一个颜色集合。色板页区分「收录颜色」与「可生成颜色」：透明色、未知/空色号、非法 HEX 与重复 HEX 的后续别名不会进入生成引擎。**色板名称中的数字不等于实际可参与生成的颜色数。**

数据随仓库固定版本交付，运行时不在线抓取。数据来源、版本锁定与排除规则见 [色板数据说明](src/lib/palettes/data/README.md) 和 [NOTICE.md](NOTICE.md)。套装档位提供 24 / 48 / 72 / 96 / 144 色等选择，可用档位取决于当前色板。

### 三种制作规格

| 稳定 ID | 豆径 | 单块底板 |
|---|---|---|
| `5mm-29` | 5mm | 29×29 |
| `2.6mm-50` | 2.6mm | 50×50 |
| `2.6mm-52` | 2.6mm | 52×52 |

Artkal 两套色板仅适配迷你豆规格；MARD 221 核对版与自定义色板可选择全部三种规格；其余内置色板使用 5mm 规格。**50×50 与 52×52 底板不能混用。**兼容性规则见 [`src/lib/boardProfiles.ts`](src/lib/boardProfiles.ts)。

## 页面与交互

桌面端采用工作室式侧边导航与顶栏，移动端采用底部导航及编辑/跟拼沉浸工作区。首页提供钉板式选图落区、最近设计与豆社作品入口；全站统一按钮、豆粒图标、表单控件及空态/错误提示。

| 入口 | 用途 |
|---|---|
| `/` | 开始创作、选择图片、继续最近设计、浏览豆社作品 |
| `/app` | 制图工作台：自动首版、可选裁剪、参数调整、预览、编辑、跟拼与导出 |
| `/designs` | 私人设计列表与继续编辑 |
| `/palettes` | 内置色板目录、可生成颜色说明与自定义色板管理 |
| `/community` | 豆社作品列表；按关键词、作者、标签、制作规格、色板与日期等条件筛选 |
| `/community/[id]` | 作品详情、图纸预览、规格信息、点赞、引用、评论与举报 |
| `/community/submit`、`/community/mine` | 投稿与管理自己的社区作品 |
| `/account` | 账号信息与展示名；邮箱验证、登录及找回密码另有独立页面 |
| `/help`、`/about`、`/privacy` | 使用帮助、项目信息、隐私说明与分析偏好 |
| `/admin` | 按审核员/管理员权限开放的独立管理后台 |

### 工作台

选择图片后先自动生成整图首版，**裁剪是后续可选操作，不是必经步骤**。确认裁剪后更新图纸；取消裁剪不会修改现有图纸。有手工编辑时，可能覆盖编辑的操作会先要求确认。

手机上可切换手形导航与编辑工具。平移、缩放和双指导航不写入图纸或跟拼进度；精准模式下拖动用于对准，松手才提交最终格，避免把移动画布误当作绘制。

### 豆社与管理后台

匿名访客可浏览作品列表、静态预览和统计；登录后才提供完整色号网格、交互查看及引用等能力。引用会创建一份独立的私人设计，后续修改不会联动原作品。

投稿及作品修改形成待审核修订，获准后才进入公开展示。评论只能发表与删除，**不支持编辑**。评论审核服务未配置、调用失败或超出预算时，评论进入人工待审，不会直接公开。

后台按权限提供总览、作品审核、评论、举报、作品、标签，以及管理员专属的官方批次、人员、分析、审计与系统模块。官方批次在浏览器本地批量生成草稿，生成与发布分开，发布前仍须准备作品原图。

## 数据与隐私

**本地制图、私人云同步、只读分享与社区投稿是不同的数据流程。**

| 场景 | 数据边界 |
|---|---|
| 本地制图 | 图片解码、裁剪与图纸生成在浏览器进行；完整原图不因制图操作上传服务器 |
| 本地继续编辑 | 设计保存在 IndexedDB；可保存缩小后的本地生成源以便继续调参，但它不是完整原图，也不进入项目文件或云同步 |
| 私人云同步 | 同步设计项目数据与自定义色板，不同步完整原图、本地生成源或跟拼进度 |
| 只读分享 | 固化图纸快照，不含原图与作者信息；无需登录即可查看，链接可撤销，重新分享会使旧链接失效 |
| 豆社投稿 | 必须附带作品原图并确认上传条款；原图存入私有对象存储，不在公开作品页展示，仅按作者、审核人员与成功引用者等权限控制取回 |
| 使用分析 | 只有明确同意后才建立匿名分析身份；不使用设备指纹，可在隐私页管理偏好。社区互动、审核等必要业务记录与可选分析分开 |
| 评论审核 | 启用腾讯云文本内容安全服务时，评论文本会发送给该服务判定，并保留相应审核记录 |

完整原图仅保留在当前解码会话中。刷新恢复的私人设计可能仍可调参，但重新裁剪或投稿时可能需要再次选择原图。跟拼进度只保存在当前浏览器中，不会随云同步或项目导出迁移；重要设计请定期导出项目文件。

## 技术栈

| 层次 | 实现 |
|---|---|
| 应用 | Next.js 16 App Router、React 19、TypeScript |
| 界面 | Tailwind CSS 4、自定义设计系统、React Aria Components、同源交付的中文字体 |
| 图像与编辑 | Canvas、Web Worker、Oklab 色彩匹配、传统量化/抖动、IndexedDB |
| 数据与认证 | PostgreSQL 16、Drizzle ORM、邮箱/密码认证、Argon2、会话与角色权限 |
| 导出 | pdf-lib、fontkit、client-zip |
| 外部服务 | 腾讯云 SES 或 SMTP、私有 COS 对象存储、可选腾讯云 TMS 评论审核 |
| 测试 | Vitest、Testing Library、PGlite、Playwright、axe-core、真实 PostgreSQL 契约测试 |
| 部署 | Docker Compose、Caddy、GHCR 稳定镜像、数据库迁移与备份恢复脚本 |

精确依赖版本与命令以 [`package.json`](package.json) 和锁文件为准。

## 快速开始

### 本地开发

使用 **Node.js 22 与 npm**，与当前 CI 保持一致。测试依赖已要求 Node.js 22；仓库生产 [Dockerfile](Dockerfile) 仍使用 `node:20-alpine`，不要据此把本地完整开发/测试环境降到 Node.js 20。

```bash
git clone https://github.com/527520/doupu.git
cd doupu
npm ci
npm run dev
```

打开 `http://localhost:3000`。默认开发不需要 Docker、外部数据库或云服务凭证，也无需直接复制生产用的 `.env.example`。

未设置 `DATABASE_URL` 时，应用自动使用 PGlite，执行本地迁移并将开发数据持久化到 `.pglite-dev/`；删除该目录会清空该开发数据库。未配置 SMTP/SES 时使用开发邮件适配器，不真实发信，验证/重置链接在开发页面及服务端日志中提供。

开发环境没有 COS 时，社区作品原图使用本地目录（默认 `.local-originals/`，可通过 `ORIGINALS_LOCAL_DIR` 调整）；没有文本审核服务时，评论转人工待审。这些是开发回退行为，不能当作生产配置。

### 使用真实 PostgreSQL 开发

仓库提供 PostgreSQL 16 开发编排。下面为 Bash/zsh 示例，连接信息仅用于本地开发：

```bash
docker compose -f docker-compose.dev.yml up -d --wait
export DATABASE_URL='postgres://doupu:doupu@localhost:5432/doupu'
export APP_URL='http://localhost:3000'
npm run db:migrate
npm run dev
```

PowerShell 中使用 `$env:DATABASE_URL = 'postgres://doupu:doupu@localhost:5432/doupu'` 和 `$env:APP_URL = 'http://localhost:3000'` 设置同样的变量，再运行迁移与开发命令。迁移脚本直接读取进程环境，**不会自动加载 `.env.local`**。

自定义配置参考 [`.env.example`](.env.example)。本机开发连接 `localhost`，生产 Compose 内部连接服务名 `postgres`，不要直接照搬生产连接地址。

## 开发与测试

| 命令 | 说明 |
|---|---|
| `npm run dev` | 启动开发服务器；启动前检查随仓库交付的 UI 字体 |
| `npm run lint` | ESLint 检查 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run test` | 运行 unit、serial 与 integration 测试 |
| `npm run test:unit` | 单元与串行测试 |
| `npm run test:integration` | 数据库/API 集成测试，使用 PGlite |
| `npm run test:coverage` | 测试与覆盖率检查 |
| `npm run test:performance` | 独立性能预算测试 |
| `npm run test:e2e` | 检查浏览器安装情况并运行 Playwright E2E |
| `npm run test:e2e:production` | 按生产 E2E 配置运行测试 |
| `npm run fonts:check` | 校验 UI 字体资产完整性 |
| `npm run build` | 构建生产产物；前置步骤生成协议检查器、PDF 字体子集并校验 UI 字体 |
| `npm run db:generate` | 根据 Drizzle schema 生成迁移 |
| `npm run db:migrate` | 将已有迁移应用到 `DATABASE_URL` 指定的 PostgreSQL |

首次运行 E2E 前安装浏览器：

```bash
npx playwright install --with-deps chromium firefox webkit
npm run test:e2e
```

额外提供 PostgreSQL 修订契约、升级、治理及协议预检测试，以及覆盖率、性能、E2E 连续稳定性测试脚本；环境准备与执行顺序参见 [CI 工作流](.github/workflows/ci.yml)。测试数量随代码演进变化，以实际运行结果为准。

## 生产部署

仓库提供 Docker Compose 单机部署：应用、PostgreSQL、Caddy 与独立备份服务，配合腾讯云 COS 备份及恢复演练。

### 配置要求

以 [`.env.example`](.env.example) 为配置索引，部署前完成 [上线检查单](deploy/CHECKLIST.md)。主要配置如下：

| 配置组 | 要求 |
|---|---|
| 站点与镜像 | `SITE_DOMAIN`、HTTPS 的 `APP_URL`；`APP_IMAGE` 必须是本仓库 release 流程产出的稳定 GHCR tag 或不可变 digest，禁止使用 `latest` |
| 数据库 | `POSTGRES_*` 与真实 PostgreSQL `DATABASE_URL`；生产不会回退到 PGlite |
| 邮件 | 完整 SMTP 配置，或 SES 凭证、发件人及验证/重置模板；生产不会回退到开发假邮件 |
| 备份与原图 | 私有 COS 桶及凭证、地域；作品原图默认与备份共桶、分前缀，也可用 `COS_ORIGINALS_*` 单独分桶 |
| 告警 | `BACKUP_ALERT_TOKEN` 至少 16 个字符，并配置 `ADMIN_EMAIL`；SES 告警模板可选，未配置时该告警通道降级为日志 |
| 分析限流 | 独立随机 `ANALYTICS_IP_HMAC_KEY`，生产至少 32 个字符；不要复用其他令牌 |
| 评论审核 | 腾讯云 TMS 可选；默认可复用 COS 凭证，但需相应权限；缺失、禁用或失败时评论转人工待审 |

`.env.example` 中的域名、桶名、密码和镜像 tag 都是示例，**应替换为实际配置与已成功发布的镜像，不要照抄示例版本上线**。生成参数、PNG/PDF 默认值、限流和数据库连接池也可通过环境变量调整。

### 发布流程

准备服务器编排文件及环境配置，并确认候选镜像已通过 release 门禁、成功推送至 GHCR 后执行：

```bash
cp .env.example .env
# 编辑 .env：填写全部必需配置，并设置已发布的 APP_IMAGE
bash deploy/scripts/deploy.sh
```

已有部署保留并更新现有 `.env`，不要用示例文件覆盖真实配置。

[部署脚本](deploy/scripts/deploy.sh) 会拉取候选镜像，进行严格 v3 只读协议预检，在短维护窗口再次检查，然后执行迁移、替换应用、完成健康检查并恢复入口。**生产应用不从任意源码现场重建，也不能跳过协议检查与迁移直接切流。**

数据库完成单向迁移后，如果候选应用健康检查失败，脚本会保持入口停止，不能简单回滚旧协议镜像。备份与故障恢复步骤见 [恢复手册](deploy/restore.md)。

### 初始化管理员

先注册并验证目标邮箱，确认账号处于正常状态，再从数据库核对用户 UUID。已有生产部署可在应用容器内运行管理员 CLI；下列占位值必须替换，邮箱须为已规范化的小写形式：

```bash
docker compose -f docker-compose.prod.yml exec app \
  node db/admin-role.cjs grant \
  --user-id '<用户UUID>' \
  --email '<已验证的小写邮箱>' \
  --reason '初始化首位管理员' \
  --confirm 'GRANT:<用户UUID>'
```

[`db/admin-role.cjs`](db/admin-role.cjs) 校验目标账号、写入审计并撤销旧会话，授权后需要重新登录。管理员角色也可撤销，但不能移除最后一名有效管理员。`ADMIN_EMAIL` 只是告警收件地址，**不会自动把对应账号提升为管理员**。

## 项目结构

```text
src/
  app/                Next.js 页面与 API：工作台、账号、设计、豆社、管理后台
  components/         UI：上传、裁剪、编辑、跟拼、导出、社区、审核与管理
  lib/                引擎、色板、板型、项目协议、存储、同步、认证、社区与分析
  messages/           集中管理的中文文案
  instrumentation.ts  启动校验、开发数据库初始化与生产维护任务

db/                   Drizzle schema、迁移、数据库客户端、管理员 CLI
scripts/              字体资产检查、色板导入、构建期协议检查器等工具
public/               静态资源与同源字体
assets/               资产来源与制作材料
tests/                测试 fixture、E2E、PostgreSQL 契约及 CI 辅助脚本
deploy/               上线检查单、部署/备份脚本与恢复手册
docs/adr/             架构决策记录
third_party/          第三方数据来源与许可证
```

领域约定见 [CONTEXT.md](CONTEXT.md)，版本变化见 [CHANGELOG.md](CHANGELOG.md)。参与开发前请阅读 [贡献指南](CONTRIBUTING.md)；安全问题按 [SECURITY.md](SECURITY.md) 反馈。

## 作者与反馈

作者：wuqian（[GitHub / 527520](https://github.com/527520)）· 邮箱：wqa527520@qq.com。

使用问题、缺陷与建议欢迎提交到 [GitHub Issues](https://github.com/527520/doupu/issues)。

## 许可证与致谢

豆谱整体采用 [AGPL-3.0](LICENSE)，基于 [Zippland/perler-beads](https://github.com/Zippland/perler-beads) 二次开发，并保留相应出处声明。新增色板数据来自固定版本的 [HansBug/pindou-color-data](https://github.com/HansBug/pindou-color-data)（MIT）。

PDF 使用 Noto Sans CJK SC；界面使用同源交付的中文字体子集，相关字体按 OFL-1.1 授权。完整上游致谢、第三方数据及字体许可说明见 [NOTICE.md](NOTICE.md)。
