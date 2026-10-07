# 豆色绘微信个人工具版

独立前端 workspace。复用现有 Next.js 后端和 PostgreSQL，使用原生小程序页面，没有 web-view、云函数、云开发环境或公开社区接口。Web 基准 main `9a95b456`。详细 PRD 和独立任务票位于 `.scratch/wechat-miniprogram/`。

## 开发与构建

在仓库根目录执行 `npm ci`，然后：

- `npm run weapp:dev`：生成同源令牌/示例/图标并编译，监听前端。
- `npm run weapp:build`：生产编译、独立 Worker 打包、主包与每个分包 1.8 MiB 预算检查。
- `npm run weapp:typecheck` / `npm run weapp:test`：独立 React 18 类型检查和平台边界测试。
- 在 `apps/weapp` 执行 `node scripts/build-fonts.mjs`：从仓库授权字体生成远程 WOFF；Web 的 `npm run prebuild` 生成 PDF 中文字体子集。

导入微信开发者工具的目录是 `apps/weapp`，编译输出在 `dist`。当前 AppID 为 `wxb76121c123fbc80c`。2026-10-07 已在开发者工具完成游客本地流程首轮验收，记录见 `.scratch/wechat-miniprogram/devtools-20261007.md`。示例默认图纸由构建脚本调用共享算法生成，详情显示真实豆粒和用色。Worker 源改动需重新执行构建；不依赖浏览器 SharedArrayBuffer。保持 project.config.json 的 urlCheck 为 true。

原生运行时使用 Zod `jitless` 模式；微信的动态 Function 探测不能执行生成的校验函数。Canvas 等页面 ready、原生节点就绪后绘制；隐藏页面卸载旧 Canvas，返回时重建，本地设计与跟拼数据保留。图片解码使用独立离屏 2D Canvas。Worker 消息两端转成独立 JSON 对象，避免微信把共享颜色引用判为循环引用。

`WEAPP_API_BASE_URL`、`WEAPP_ASSET_BASE_URL`、`WEAPP_WEBSITE_URL` 默认均为 `https://beadhue.com`，与 Web 共用服务及资源。可用构建环境变量覆盖到 HTTPS 测试服务，无尾随斜杠；显式设为空字符串时保留本地工具，网络功能提示未配置。默认地址不代表生产后端已完成小程序接口部署或微信后台合法域名配置。复制网站地址必须由用户点击触发，不传会话。字体、PDF 中文字库须随 Web 镜像部署：`/fonts/weapp/text-{400,500,600,700}.woff` 和 `/fonts/NotoSansCJKsc-Regular.subset.otf`；公开字体响应提供 CORS 以供 `wx.loadFontFace` 加载，不能以内置系统字体替代完成视觉验收。

服务器环境设 `MINI_AUTH_ENABLED=true`、`WECHAT_APP_ID`、`WECHAT_APP_SECRET`。默认关闭新登录入口。先完成数据库迁移 `0022_wechat_personal`、测试和配置核验；迁移用既有 db:migrate 流程执行。本次实施不会连接生产库或执行生产迁移。回滚优先关闭 MINI_AUTH_ENABLED，保留新表和私人数据；Web 默认 session client_type=web。

## 数据与能力

- shared core 入口只导出实际复用算法、领域规则、存储契约、CAS、绘制与导出版式；Web 保留原有导入路径。
- 原生本地存储采用不可变项目/RGBA文件和提交记录；最多回收不被最近两个有效提交引用的缓存。游客与每个 UUID 账号目录隔离；迁入是用户确认后的复制。
- Auth token 单独本地保存；服务端存哈希。wx.login code 只发既有后端，微信 openid/session_key 不返回小程序。
- 设计和色板沿用 revision，冲突保留副本。跟拼标记单独存在文件系统，不进入项目文件和云同步。
- 原图只在有本地上传意图时提交；成功/主动删除保留抑制标记，避免 Web 或小程序删除后被自动上传。预览文件有界缓存，空间不足先清理可恢复预览。
- 原图 PUT 使用字节和 If-Match。带鉴权的原图/缩略图经请求下载到本地。网络任务捕获启动时 token，账号切换不替换在途请求身份。
- 单个 Worker 在生成、PDF 和 ZIP 任务之间复用调度；新任务取消旧任务，任务编号拒绝过期结果。页面隐藏终止耗时计算，已提交编辑继续本地保存。
- 字体普通文本与 Canvas 双 scope；PNG 白底，过大时拆底板并独立图例；PDF 和 ZIP 都生成字节，再由文件系统保存。

## 个人主体限制与官方依据

以下依据在规划阶段查阅；最终以申请账号后台的当前类目、能力和审核结果为准。

| 项目             | 处理与官方来源                                                                                                                                                                                                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 服务类目         | 个人可申请工具→图片处理；如实申报拼豆图片生成/编辑。[类目](https://developers.weixin.qq.com/miniprogram/product/material.html)                                                                                                                                                                                                               |
| 社区             | 社区/论坛、笔记属非个人主体范围；不提供公开作品流、投稿、作者、互动、社区通知或在线分享。[类目](https://developers.weixin.qq.com/miniprogram/product/material.html)                                                                                                                                                                          |
| 自有示例         | 独立 src/examples.ts 清单，只使用 public/examples 四张仓库教学素材；不请求豆社作品，不接受投稿。提审如实披露。                                                                                                                                                                                                                               |
| 云函数           | 缺执照不等于所有云函数不可用。腾讯云官方有个人小程序开通云开发路径，但本项目不依赖云开发。[腾讯云](https://cloud.tencent.com/document/product/1301/86886)                                                                                                                                                                                    |
| Web 页面         | 个人类型不支持承载网站的 web-view，因此必须独立原生页面。[web-view](https://developers.weixin.qq.com/miniprogram/dev/component/web-view.html)                                                                                                                                                                                                |
| 外部浏览器       | 独立 App 的 wx.miniapp.openUrl 不适用普通微信小程序；只有主动复制地址。[适用范围](https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/miniapp/api/miniapp/openUrl)                                                                                                                                                        |
| 手机号           | 不接微信手机号授权；使用邮箱账号和微信身份绑定。[手机号说明](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/getPhoneNumber.html)                                                                                                                                                                                    |
| 请求域名         | 需 HTTPS、备案和后台合法域名配置；开发工具跳过校验不能用于发布。[网络要求](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)                                                                                                                                                                                  |
| 小程序备案       | 与服务器域名备案分别完成，个人有对应流程。[备案](https://developers.weixin.qq.com/miniprogram/product/record/guidelines)                                                                                                                                                                                                                     |
| 隐私             | 不强制登录使用本地工具；选图和相册按操作申请，拒绝不禁用其他能力。[规范](https://developers.weixin.qq.com/miniprogram/product/)                                                                                                                                                                                                              |
| Worker/字体/文件 | 真机验证单 Worker、双 scope 字体、相册与主动发送文件。[Worker](https://developers.weixin.qq.com/miniprogram/dev/api/worker/wx.createWorker.html)、[字体](https://developers.weixin.qq.com/miniprogram/dev/api/ui/font/wx.loadFontFace.html)、[文件发送](https://developers.weixin.qq.com/miniprogram/dev/api/share/wx.shareFileMessage.html) |

## 正式发布门槛（当前未完成）

1. AppID 已提供并接入；仍需按真实功能核验个人主体类目、小程序备案和隐私指引配置。
2. 已选用现有 `beadhue.com`；核验实际备案状态、API/资源服务、部署地区和数据流向。不因持有域名或 HTTPS 可访问就视为微信后台配置通过；需要备案/接入调整时按接入商核验要求办理。
3. 配置 request/download 等合法域名，证书链有效、无跳向未配置域名的重定向；微信密钥只在服务器和 CI 中。
4. `project.config.json` 已配置实际 AppID，urlCheck 保持 true。使用正式网络配置、真实测试邮箱与体验者账号完成联调。
5. iOS/Android 真机分别验证字体（普通文本/Canvas/所有字重/中文缺字）、EXIF 方向、最大图纸、单 Worker/取消、低内存、存储满/中断/重启、账号切换、CAS 冲突、图片保存和 PDF/ZIP/项目发送。
6. 截图对照 Web 350/375/390/430：首页、示例、生成、编辑、跟拼、我的、色板、设置与弹层，包含空/错/加载/禁用/同步/冲突。系统区域单独记录，业务组件目标≤2px。
7. 微信上传工具复核主包/分包各 2MB、总包 30MB；工程预算 1.8MB。构建报告不是微信上传成功证明。[分包](https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages.html)
8. 填写真实提审说明：私人创作、邮箱与微信绑定、自有示例、文件导出和复制网站地址。不得审核后远程开启社区功能。

## 素材来源与证据

四张示例与 Web 共用 `public/examples/{rainbow,strawberry,frog,cat}.png`，构建时复制，不另取网络内容。许可总账为根目录 NOTICE.md；上线前仍需核对权属记录。Lucide 按使用集合导出静态 SVG，字体来自 assets/ui-fonts 的 OFL 源文件。具体验证结果和未完成项见 `.scratch/wechat-miniprogram/verification.md`，没有真机证据的能力不能标记已验收。
