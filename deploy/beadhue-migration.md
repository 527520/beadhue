# 豆色绘 / BeadHue 生产切换说明

此文是发布准备，不是已执行的迁移记录。本轮不操作线上数据库、COS、域名、网络或容器。

## 保留线上资源身份

GitHub 已从 `527520/doupu` 更名为 `527520/beadhue`，历史保留。本地仓库 remote 更新为 `git@github.com:527520/beadhue.git`。源码、Issues 和新 GHCR 镜像使用新名称；域名仍为现有 `doupu.fun`。不要据工程更名推断已取得新域名。

现有服务器保持 `/opt/doupu` 目录及 Compose 项目名；若需要移动部署编排目录，先在其 `.env` 明确设置 `COMPOSE_PROJECT_NAME=doupu`。否则命名卷可能被当作新卷，出现空库。保留现有 `POSTGRES_USER`、`POSTGRES_DB`、`DATABASE_URL`，不能用新版示例覆盖。迁移记录表 `_doupu_migrations` 与数据库协调锁名保留，以兼容既有迁移历史及混合管理工具。

保持 `APP_NETWORK_NAME=doupu_default`，本轮编排已固定该默认网络名。「迟迟」继续使用原网络、`CHI_SITE_DOMAIN` 与 `CHI_UPSTREAM`，不要重建网络或改为新的工程前缀。原 COS 桶、地域、对象前缀、域名、应用密钥及反向代理配置保持现值。

## 发布前

1. 在独立环境完成类型、Lint、单元/数据库集成、三浏览器流程及生产构建。真实 PostgreSQL 升级演练与真实 COS 授权/大小/读写验证须另列结果。
2. 做数据库备份并用现有恢复脚本演练，记录备份对象位置、镜像 digest、Compose 项目与命名卷。新备份文件名使用 beadhue 前缀，恢复脚本接受旧文件名。
3. 若原 `BACKUP_DESTINATION` 使用旧 rclone remote，更新为 `beadhuecos:<原桶>/<原备份前缀>`；只改客户端 remote 名称，保留桶和已有路径。新版 Compose 的 `RCLONE_CONFIG_BEADHUECOS_*` 从相同 COS 配置取得凭证，不迁移对象。
4. 检查新 GHCR 包的读权限及发布工作流，确认已发布新镜像后再更新 `APP_IMAGE`。现有旧稳定镜像仍可通过部署脚本的格式验证，便于备份恢复演练；这不代表旧协议可直接回滚。
5. 配置原图独立容量 `ORIGINAL_QUOTA_BYTES=2147483648`；上传限制为 `RATE_ORIGINAL_USER_MINUTE=10`、`RATE_ORIGINAL_USER_HOUR=60`、`RATE_ORIGINAL_IP_MINUTE=30`、`RATE_ORIGINAL_IP_HOUR=180`。公网 IP 来源沿用可信代理配置，不能信任任意客户端转发头。

## 升级与恢复

使用既有 migration-first 短维护窗口部署流程，新增迁移0016–0018为独立资产、释放标记与持久清理队列，不改写旧迁移。原有效 doupu-project v3 在新服务中接受，保存后规范化为 beadhue-project v3。发布后的新数据旧版本可能不识别，因此不得把旧镜像直接连接已写入新协议的库；失败时使用对应备份和匹配镜像恢复，在隔离环境先验证，再执行正式恢复。

同域浏览器升级会复制旧 IndexedDB、偏好与跟拼进度，验证成功后记录迁移标记，旧库保留。清空新库但保留旧库会再次迁移；只清 localStorage 不会重复复活已删除的新库记录。旧会话 Cookie 继续鉴权，允许写响应时续为新 Cookie；退出登录清除两者。跨域无法自动迁移浏览器存储，本轮不做域名切换。

## 发布后独立验收

检查账号登录延续、旧v3导入、私人原图上传/下载、已绑定原图的旋转/裁剪跨设备恢复、限流等待、公开冻结/撤回、引用副本与删除回收。分别记录图纸和原图状态，验证手工编辑不被恢复过程重新生成。检查「迟迟」页面及双浏览器实时连接，记录两个站点的实际域名和返回结果。未执行的项目必须标记未验证。
