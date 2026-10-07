# 2026-10-07 接入准备与最少人工步骤

用户已指定现有域名 `beadhue.com`，继续共用 Web 后端。用户已保存 request 合法域名和服务器 AppSecret；代理已确认请求放行、AppID 正确及密钥存在。当前仍为发布准备，尚未部署后端、执行生产迁移或上传小程序。

## 本轮已处理

- 小程序 API、字体/PDF 资源、复制官网地址默认均为 `https://beadhue.com`，构建产物已检查实际地址。构建环境变量仍能分别覆盖；显式空字符串保留本地模式。
- 生产 Compose 仅向 app 注入 `MINI_AUTH_ENABLED`、`WECHAT_APP_ID`、`WECHAT_APP_SECRET`。默认关闭认证，秘密不进入小程序。
- 公开 `/fonts/:path*` 响应增加 CORS，支持 `servicewechat.com` 加载正文 WOFF；API 和其他路径没有放开 CORS。
- 本地已有四个正文 WOFF 与 PDF 字体子集，随 Web 镜像 public 目录部署；无需再买资源域名。
- 小程序类型检查、12 文件 33 项测试、构建与各包 1.8 MiB 工程预算通过。Web 类型检查、生产构建、受影响文件 ESLint 通过；Next 配置和现有部署测试 21 项通过、13 项既有平台跳过。本轮没有重跑默认 Web 全量测试；历史边界仍见 verification.md。
- Standards 和 Spec 分别审查本轮 diff，均无未解决问题。

## 网络现状与证据

2026-10-07 公网匿名 GET/HEAD：主域 HTTPS 证书校验通过；首页与隐私页 200；四个 `/fonts/weapp/text-{400,500,600,700}.woff` 均 404；`GET /api/mini/auth/wechat-binding` 返回 404 HTML；现有 PDF 字体 200。未调用生产写接口、登录、绑定或邮件发送。

最初开发者工具匿名 wx.request 被 `request:fail url not in domain list` 拦截（历史证据 `evidence/devtools-20261007/backend-readiness.json`）。用户保存配置后，工具仍缓存旧列表；代理刷新「项目设置 → 项目配置 → 域名信息」并重新编译，确认 request 列表包含 `https://beadhue.com`，域名和证书校验保持开启。

刷新并编译后的匿名 GET 结果见 [backend-after-recompile.json](evidence/devtools-20261007/backend-after-recompile.json)：`/api/auth/me` 为401 JSON；`/api/mini/auth/wechat-binding` 为404 HTML；`/fonts/weapp/text-400.woff` 为404 HTML；现有 PDF 字体为200。域名阻塞已关闭；404证明小程序路由/正文字体仍未部署。未记录响应正文或凭据，未执行登录、绑定、云同步或邮件发送。

截图：[request 域名列表](evidence/devtools-20261007/request-domain-confirmed.png)、[域名/证书校验开启](evidence/devtools-20261007/domain-certificate-checks-enabled.png)。截图控制台保留13:02的历史错误，不能把它们误判为刷新并编译后的请求结果；当前结果以JSON记录为准。

公开页面未检出备案展示，不能据此断言域名未备案。现有隐私页面仍描述 Web，微信绑定及小程序权限说明待补齐。

## 已完成的接入配置

- 服务器连接：沿用用户已连接的腾讯云 OrcaTerm，`.env` 与 Compose 变量准备完成，无需重复提供 SSH 信息。
- request 合法域名：用户已保存 `https://beadhue.com`，代理刷新、编译及真实请求核验通过。当前实现用 request，不额外要求 uploadFile / WebSocket；未来若改用 downloadFile，再单独配置。
- AppSecret：用户已在服务器隐藏提示中完成双次输入。代理只核查 `secret_present=true`、`appid_matches=true` 和 `mini_login_enabled=false`，未读取或显示密钥。Compose 校验通过，app 仍为 v0.6.0，未重启。

微信管理后台受工具站点安全策略禁止自动操作，用户已完成本次域名与密钥交接。这两项无需重复操作。其他代码、测试、迁移准备和可访问的服务器操作由代理处理；密钥对微信 API 的有效性要在新后端部署后另行验证。详细核验见 `server-20261007.md`。

## 依赖与候选版本状态

[PR #14](https://github.com/527520/beadhue/pull/14) 的 Web 依赖修复完整远端 [CI run 160](https://github.com/527520/beadhue/actions/runs/37585876885) 已通过，已转为可审查状态，尚未合并或部署。对应最小补丁已增量移入小程序分支，workspace / React 18/19 隔离保持原样，两类独立审查均无必改项。

小程序分支按 CI 原范围审计仍为 **3 critical / 13 high / 8 moderate，exit 1**；部分 Taro 上游依赖尚无已发布补丁，不能降低门槛或用 PR #14 的 Web-only 结论代替。详见 [依赖修复记录](dependency-remediation-20261007.md) 和独立票11。最终候选版本、可靠备份、完整 CI、真实设备及视觉验收仍未完成。

## 服务器接入内容（由代理执行，前提是连接可用且候选版本通过发布门禁）

保持现有 `/opt/doupu`、Compose 名 doupu、网络 doupu_default、数据库、COS 和邮件配置。部署包含小程序后端接口与 WOFF 的候选 Web 镜像，按现有流程执行增量迁移 `0022_wechat_personal`；不在生产服务器绕过门禁从任意分支源码重建。

```dotenv
# 以下仅为说明，不含秘密；真实 AppSecret 只保存在服务器。
MINI_AUTH_ENABLED=false
WECHAT_APP_ID=wxb76121c123fbc80c
WECHAT_APP_SECRET=<已在服务器安全配置，不复制具体值>
```

保持开关关闭，先验证可靠备份、候选镜像与迁移兼容，按发布流程部署并核验 Web。确认新路由和字体可用后，再启用认证并完成实际微信 code、邮箱绑定、会话撤销、两端 CAS、原图、字体和 PNG/PDF 联调；不得把匿名 200 或模拟器通过当作这些链路通过。

## 后续本人必须参与的环节

- 微信后台核验实际 ICP 备案状态、小程序备案、个人类目「工具 → 图片处理」及隐私指引。身份资料、核身、验证码及管理员确认由本人完成；需要准备的技术说明由代理编写。域名所有权不替代后台配置或备案。
- AppSecret 已完成本次配置；后续扫码登录/预览/体验版确认涉及本人权限，出现实际确认界面时由本人完成。
- 真机需本人扫码并允许设备参与；工具能自动完成的操作由代理执行。无法远程观测的 iOS/Android 权限、相册、文件发送等需取得真实证据。

现有 Web 发布流程要求 protected main、CI、真实设备素材验收和 evidence-only attestation；当前分支不能直接打 tag 绕过这些门禁。模拟器截图不得充当真实设备证据。所有门槛关闭后才上传体验版、提审和正式发布。

## 官方填写依据

- [服务器域名与网络要求](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)
- [网络字体与 CORS](https://developers.weixin.qq.com/miniprogram/dev/api/ui/font/wx.loadFontFace.html)
- [小程序备案指引](https://developers.weixin.qq.com/miniprogram/product/record/record_guidelines.html)
- [个人主体类目](https://developers.weixin.qq.com/miniprogram/product/material.html)
- [隐私声明接入](https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/PrivacyAuthorize.html)

此前首轮游客验收、截图和未完成项仍见 `devtools-20261007.md`；本记录关闭本次域名和密钥配置交接，不替代新后端、真机和视觉验收。
