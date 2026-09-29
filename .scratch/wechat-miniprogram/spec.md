# 豆色绘微信小程序个人版 PRD

Status: ready-for-agent
Baseline: main 9a95b456
Approved: 2026-09-29，用户在本会话批准完整实施计划。

## 产品边界

个人主体图片处理工具。游客可选图、生成、编辑、跟拼、导出；选择云同步时登录同一邮箱账号，验证后绑定微信。首页是仓库自有示例，不读公开社区。私人设计、色板、原图共用原有后端和 PostgreSQL。跟拼进度仅存本机。没有社区作品流、投稿、互动、作者主页、通知、在线分享页或管理后台。

## 必须使用的三个 skill

- [ask-matt](/Users/wuqian/.agents/skills/ask-matt/SKILL.md)：冻结需求→优先验证风险→PRD→本目录独立任务票→逐票交付。任务分阶段提交，保留未完成验收项。
- [frontend-design](/Users/wuqian/.codex/skills/frontend-design/SKILL.md)：以 Web 实现提取令牌和组件状态，先组件再页面，再四宽截图对照。不改变现有品牌。
- [awesome-design-md](/Users/wuqian/.codex/skills/awesome-design-md/SKILL.md)：已阅读 Airbnb 主参考和 Pinterest 辅助参考；核对图片卡片、搜索、类目和低装饰布局。颜色、尺寸和字体服从现有 Web。

实施流程补充使用 implement，并在交付前做代码及规格审查。

## 架构与约束

独立 npm workspace apps/weapp，Taro 4.2.1 / React 18.3.1 / TypeScript。Web 维持 Next 与 React 19。原生组件、Canvas 2D、逻辑 px，禁用 pxtransform。packages/core 提供窄共享入口，单一算法/协议来源。平台存储、请求、画布和 Worker 分离。Web 不依赖小程序运行时。

共享项目 v3、色板和规格、200×200 生成算法、编辑操作、进度计算、CAS 同步、导出版式和中文文案。输入上限沿用 Web（20 MiB、64M 像素、800px 生成源）。单 Worker 调度，取消终止，旧结果失效。项目正文和源像素用原生文件系统，提交点原子替换，重启恢复；游客/用户目录隔离，用户主动确认迁入，不能自动删除未同步数据。

认证沿用随机 token 哈希存储、30 天滚动 / 90 天绝对有效期；会话增加 web/weapp 类型。只允许经过验证的 weapp token 使用明确私人 API 路径。Web Cookie 不可冒充原生 Bearer。认证公共入口单独限流、仅 JSON；不关闭全局 Origin 防护。微信以 (appid,openid) 唯一，(appid,userId) 唯一；不按昵称或邮箱猜测合并。密钥、session_key 不返回前端。

新增 API：mini/auth 下 wechat-login、email-login、register、resend-verification、forgot-password、wechat-binding(GET/POST/DELETE)；auth/account 增加 POST 等价资料修改。原接口 designs、palettes、originals、auth/me、account、change-password、logout、me/sessions 继续复用。原图 PUT 发送字节；图片鉴权下载到本地。云同步继续 baseRevision/revision，冲突保留副本。

PNG 白底、色号、图例与底板分页；PDF 使用现有 pdf-lib 和中文字体；ZIP 使用 fflate 字节接口、不压缩 PNG。项目文件双向交换。用户主动保存相册或发送文件。帮助提供「复制网站地址」，不自动打开浏览器、不携带会话。

## 页面映射

发现（搜索、类目、双列自有示例）→示例详情→独立私人创作；创作入口（照片、示例、空白、项目导入、最近）；生成（裁剪、尺寸、色数、色板、规格、去背景）；编辑（手形、画笔、橡皮、吸管、填充、历史、换色、变换、参数、原图）；跟拼（底板、行、逐格、定位未完成、重置）；我的（搜索、排序、重命名、复制、删除、导出、同步、原图）；色板；账号；帮助。主导航「发现 · ＋ · 我的」，编辑和详情隐藏主导航。

## 视觉验收

Web main 9a95b456 为事实来源；350/375/390/430 逻辑 px 竖屏，同素材同状态。令牌一致、关键尺寸位置误差目标 ≤2px；系统状态栏、胶囊、安全区、授权等单独记录；文字换行/裁切/缺字必须修复。正文 BeadHue Text，品牌静态资产；白底 #FFF、浅灰 #F7F7F8、次级 #F0F0F2、深墨 #1C1C1E、蓝 #3160E6、边线 #E7E7EA。正文15/24，标题22/30和18/26，控件44，卡片16，底部面板24。带孔豆粒和白钉板使用同源绘制函数。

## 发布前置条件（不可用代码验证替代）

目前没有 AppID、备案域名和真机配置。HTTPS 直连备案方案必须由接入商核验，不能把反向代理域名视为自动合规。需分别完成小程序备案、API/资源域名及服务器配置、隐私声明与授权、iOS/Android 字体/画布/Worker/相册/文件/键盘/后台恢复验收和真实提审。每包工程预算 1.8MB，按微信上传结果复核。服务器环境只保存 AppSecret，客户端使用 API_BASE_URL / ASSET_BASE_URL / WEBSITE_URL。

个人类目与能力依据及配置步骤见 apps/weapp/README.md。即使本地构建通过，本 PRD 的最终交付仍须以上门槛全部完成；未验证项不能标为完成。
