# 0.7.0 候选发布准备（2026-10-07）

关联：[14 候选发布票](issues/14-release-candidate.md)、[12 E2E 修复](issues/12-ci-release.md)、[13 依赖安全](issues/13-dependency-security.md)。

## 当前范围和版本

新增原生微信个人工具客户端按 minor 版本准备 0.7.0。APP_VERSION、根 package.json、lock 顶层及根包版本已同步，CHANGELOG 包含候选功能和实际安全修复；小程序独立包版本仍为 0.1.0。最终 main 候选及发布证据仍需按下述门槛冻结。

最终候选 SHA 尚未冻结。记录开始时已提交 HEAD 为 4278408a，E2E 修复、安全依赖与本次版本内容仍在工作区；该 SHA 不是最终候选，也不能作为待发布证据的 candidateCommit。完整 CHANGELOG、版本与代码必须先进入候选提交，然后再测试该确切 SHA。

## 已复核与尚未完成

| 项目 | 本次证据与界限 |
|---|---|
| 后台迁移名 E2E | 已只读复核 dt 对应 dd 的可见性和完整文本断言，journal 没有最新 tag 时直接失败。已读取 `/tmp/beadhue-migration-assert-green.log`，Chromium、Firefox、WebKit 共 3 项通过、总 1.4 分钟；此处未重跑测试。 |
| 版本说明 | APP_VERSION、根包与 lock 均为 0.7.0，CHANGELOG 有单独候选条目。 |
| 依赖安全 | 票 13 的原审计命令通过：0 critical / 0 high / 14 moderate。干净安装、两端类型、小程序 33 测试与生产/watch 构建通过；root 补正常共享 DAG 上游对照后安全测试 10/10、全仓 lint 通过。完整 Linux CI、Alpine 最终镜像和独立安装图审查仍需确认。 |
| 最终完整 CI | 等待全部变更落入最终 SHA 后重新验证；旧 PR、旧 SHA 或定向本机绿灯不能替代。 |
| 正式发布证据 | 现有最新 mobile/algorithm JSON 为 v0.6.0，均引用 affd30e9f09f0fa6c3197b6d6f258af14afde73e。没有最终 0.7.0 候选的真机或人工算法通过证据。 |
| 小程序与生产验收 | 域名、密钥的配置进展见各自记录；它们不证明实际微信登录、跨端同步、真机导出、备案提审或生产部署已完成。 |

## 候选构建、正式镜像发布和上线

1. **候选构建**：合并必要修改、完成版本一致性并固定 SHA。现有 CI release-safety 在生产依赖审计后用 Dockerfile 构建 `beadhue-app:local`，执行最终镜像、PostgreSQL 和浏览器检查；该镜像不推送，也不更新 latest。隔离环境的同源本地构建只作为验证结果，不能冒充正式 release。Web Docker 镜像与小程序前端构建、微信上传分别记录。
2. **正式镜像发布**：取得该候选的物理 iPhone Safari / Android Chrome 矩阵及六类人工算法结果，创建仅含两份证据 JSON 的单父 attestation，引用其父候选 SHA；attestation 进入受保护 main 后才能推送稳定 tag。现有 release workflow 会重新运行完整 CI、检查版本和证据、推送稳定镜像及 latest，再做 Trivy；必须全部成功后记录版本、SHA、workflow 和 digest。工作流没有“只构建、不推 latest”的 release 开关，不用预发布 tag 或占位证据绕过。
3. **生产部署与小程序发布**：镜像构建成功不改变线上运行版本。可靠备份恢复、服务端配置、协议预检、增量迁移、健康切换和真实联调另行执行。微信真机、隐私、备案、体验版与提审也有独立门槛，不由 Web 镜像发布代替。

## 主任务后续清单

- 版本已同步；继续完成最终审查与 CI，冻结前确定 CHANGELOG 日期与措辞，避免在冻结候选后再改代码或说明。
- 完成对应候选的 Web 与 WeChat CI；故障按真实原因修复，不降低安全或验收门槛。
- 缺失的物理设备、人工算法与微信验收结果保持待办，待取得真实证据后再生成 attestation；不复制 v0.6.0 的 passed 值。
- 独立跟进备份恢复 workflow 凭据：当前仍读取应用 COS_SECRET_ID/KEY，部署清单要求 BACKUP_COS_SECRET_ID/KEY；本次没有编辑工作流或读取凭据。

轻量校验已通过：使用 Node assert 读取并确认 APP_VERSION 为 0.7.0、CHANGELOG 只有一个待发布 0.7.0 条目且位于 0.6.0 前、项目协议仍为 v3、引擎版本仍为 2.0.0、两份准备文档存在；限定文件的 git diff --check 通过。未调用依赖安装，不与票 13 的 node_modules 修改交叉运行测试。

本次没有运行 Web 构建、E2E 或生产操作，没有提交、tag、工作流触发或证据 JSON 写入。
