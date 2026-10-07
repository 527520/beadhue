# 2026-10-07 接入准备与最少人工步骤

用户已指定现有域名 `beadhue.com`，继续共用 Web 后端。当前状态为发布准备，尚未部署后端、执行生产迁移或上传小程序。

## 本轮已处理

- 小程序 API、字体/PDF 资源、复制官网地址默认均为 `https://beadhue.com`，构建产物已检查实际地址。构建环境变量仍能分别覆盖；显式空字符串保留本地模式。
- 生产 Compose 仅向 app 注入 `MINI_AUTH_ENABLED`、`WECHAT_APP_ID`、`WECHAT_APP_SECRET`。默认关闭认证，秘密不进入小程序。
- 公开 `/fonts/:path*` 响应增加 CORS，支持 `servicewechat.com` 加载正文 WOFF；API 和其他路径没有放开 CORS。
- 本地已有四个正文 WOFF 与 PDF 字体子集，随 Web 镜像 public 目录部署；无需再买资源域名。
- 小程序类型检查、12 文件 33 项测试、构建与各包 1.8 MiB 工程预算通过。Web 类型检查、生产构建、受影响文件 ESLint 通过；Next 配置和现有部署测试 21 项通过、13 项既有平台跳过。本轮没有重跑默认 Web 全量测试；历史边界仍见 verification.md。
- Standards 和 Spec 分别审查本轮 diff，均无未解决问题。

## 网络现状与证据

2026-10-07 公网匿名 GET/HEAD：主域 HTTPS 证书校验通过；首页与隐私页 200；四个 `/fonts/weapp/text-{400,500,600,700}.woff` 均 404；`GET /api/mini/auth/wechat-binding` 返回 404 HTML；现有 PDF 字体 200。未调用生产写接口、登录、绑定或邮件发送。

开发者工具匿名 wx.request 实测被拦截：`request:fail url not in domain list`。证据为 `evidence/devtools-20261007/backend-readiness.json`，域名校验没有关闭。这一结果证明当前开发者工具配置不能访问该主机，不能仅凭持有域名认定接入完成。

公开页面未检出备案展示，不能据此断言域名未备案。现有隐私页面仍描述 Web，微信绑定及小程序权限说明待补齐。

## 当前需要用户提供/完成

1. **现有生产服务器连接信息**：SSH 地址、端口（非默认时）、用户名，以及本机已有密钥是否可用，或现有部署入口。无需发送密码、私钥。本机 SSH 配置未发现项目专用目标，不能猜测生产登录账号。
2. **微信后台域名设置**：在本 AppID `wxb76121c123fbc80c` 的「开发 → 开发管理/开发设置 → 服务器域名」添加 request 合法域名 `https://beadhue.com`。当前 API、原图、缩略图和 PDF 字体均走 request；没有 uploadFile 或 WebSocket，不需要为当前实现额外配置这两项。若后续改用 downloadFile，再配置 download 合法域名。保存若要求管理员扫码，由本人完成。
3. **微信 AppSecret 的安全配置**：若服务器没有配置，需要从微信后台取得，直接保存到服务器秘密环境或密钥管理，不发送到聊天、不放到仓库。现有 AppID 可以由我们填入服务器配置。

微信管理后台的浏览器操作已被工具安全策略禁止；禁止通过其他浏览器、脚本或接口绕过限制，因此这部分需要用户在后台完成。其他代码、测试、迁移准备和可访问的服务器操作由代理继续处理。

## 服务器接入内容（由代理执行，前提是连接可用且候选版本通过发布门禁）

保持现有 `/opt/doupu`、Compose 名 doupu、网络 doupu_default、数据库、COS 和邮件配置。部署包含小程序后端接口与 WOFF 的候选 Web 镜像，按现有流程执行增量迁移 `0022_wechat_personal`；不在生产服务器绕过门禁从任意分支源码重建。

```dotenv
# 以下仅为说明，不含秘密；真实 AppSecret 只保存在服务器。
MINI_AUTH_ENABLED=true
WECHAT_APP_ID=wxb76121c123fbc80c
WECHAT_APP_SECRET=<由本人安全配置到服务器>
```

先核验迁移和凭据，再启用认证。随后完成实际微信 code、邮箱绑定、会话撤销、两端 CAS、原图、字体和 PNG/PDF 联调；不得把匿名 200 或模拟器通过当作这些链路通过。

## 后续本人必须参与的环节

- 微信后台核验实际 ICP 备案状态、小程序备案、个人类目「工具 → 图片处理」及隐私指引。身份资料、核身、验证码及管理员确认由本人完成；需要准备的技术说明由代理编写。域名所有权不替代后台配置或备案。
- AppSecret、扫码登录/预览/体验版确认涉及本人权限；本人完成后代理继续自动化。
- 真机需本人扫码并允许设备参与；工具能自动完成的操作由代理执行。无法远程观测的 iOS/Android 权限、相册、文件发送等需取得真实证据。

现有 Web 发布流程要求 protected main、CI、真实设备素材验收和 evidence-only attestation；当前分支不能直接打 tag 绕过这些门禁。模拟器截图不得充当真实设备证据。所有门槛关闭后才上传体验版、提审和正式发布。

## 官方填写依据

- [服务器域名与网络要求](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)
- [网络字体与 CORS](https://developers.weixin.qq.com/miniprogram/dev/api/ui/font/wx.loadFontFace.html)
- [小程序备案指引](https://developers.weixin.qq.com/miniprogram/product/record/record_guidelines.html)
- [个人主体类目](https://developers.weixin.qq.com/miniprogram/product/material.html)
- [隐私声明接入](https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/PrivacyAuthorize.html)

此前首轮游客验收、截图和未完成项仍见 `devtools-20261007.md`；本记录更新了域名默认配置与网络阻塞的现状，没有替代原有真机和视觉验收。
