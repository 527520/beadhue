# 豆色绘上线检查单（腾讯云海外地域）

> 适用：单机 Docker 部署（ADR-0005）。以下步骤仅能由账号所有者本人完成；按顺序执行，每步完成后勾选。
> 当前决策 D31 为海外节点，不填写或展示 ICP 备案号。若将来迁入中国大陆地域，必须先另立合规决策并完成备案，不能直接复用本清单切流。

## 第 0 步：发布源码到 GitHub（开源合规，ADR-0001）

- [ ] 登录 github.com/527520，新建仓库 **beadhue**（Public，不勾选任何初始化文件——仓库已有完整历史）。
- [ ] 本地执行（Windows 凭据管理器会处理认证；若提示登录，按指引完成）：
  ```powershell
  git push -u origin main
  ```
- [ ] 确认 https://github.com/527520/beadhue 可访问，Actions 页 CI 全绿。
- [ ] （可选）`git tag v0.1.0 && git push origin v0.1.0` 触发 release 工作流构建 GHCR 镜像。

## 第 1 步：购买服务器

- [ ] 登录腾讯云控制台（实名认证为个人）。
- [ ] 购买海外地域「轻量应用服务器」（例如中国香港/新加坡）：2 核 2 GB 内存、系统盘 ≥ 40 GB、带宽 ≥ 3 Mbps，系统镜像选 **Ubuntu 22.04 LTS**（或 Debian 12）。
- [ ] 记录：公网 IP、地域，并确认不是中国大陆地域。
- [ ] 防火墙（安全组）放行：`22`（SSH，建议限制来源 IP）、`80`、`443`。
- [ ] 设置 SSH 登录：推荐密钥登录，禁用密码登录（`/etc/ssh/sshd_config` 中 `PasswordAuthentication no`）。

## 第 2 步：注册域名（DNSPod）

- [ ] 保留已有 SITE_DOMAIN 与 APP_URL（当前 doupu.fun）；品牌更名不迁移域名。新域名须另行确认注册、DNS 和证书方案。
- [ ] 完成域名实名认证（个人，身份证，通常 1–2 小时内完成）。
- [ ] 记录域名与 DNSPod 管理权限，待服务器安全加固完成后解析。

## 第 3 步：部署地域合规确认

- [ ] 再次确认实例、公网 IP 与实际入口均在海外地域，不经过未备案的中国大陆源站。
- [ ] 页脚不展示虚构或占位 ICP 备案号。
- [ ] 若架构、地域或域名合规要求变化，停止发布并先更新 ADR/本清单。

## 第 4 步：域名解析与 TLS

- [ ] 安全加固完成后，在 DNSPod 添加解析：`@` 与 `www` 的 A 记录 → 服务器公网 IP。
- [ ] `nslookup <域名>` 确认解析生效。
- [ ] TLS 证书无需手动购买：Caddy 首次启动自动申请 Let's Encrypt 证书并自动续期（前提：80 端口可达、解析已生效）。

## 第 5 步：邮件推送（腾讯云 SES）

- [ ] 开通「邮件推送 SES」，创建发信域名（用主域名即可），按指引添加 SPF 与 DKIM 的 DNS 记录并验证。
- [ ] 创建发信地址（如 `noreply@<域名>`）。
- [ ] 获取 SMTP 凭证（账号/密码），填入服务器 `.env`（`SMTP_*` 变量，见 `.env.example`）。

## 第 6 步：对象存储（COS：数据库备份 + 作品原图）

- [ ] 创建一个 COS 存储桶（如 `beadhue-<地域>`），**私有读写**；不开公有读、不配 CDN。备份写在 `beadhue-backup/` 前缀，作品原图（D49）写在 `originals/` 前缀，应用只通过服务端代理读写原图，浏览器永不直连该桶。
- [ ] **不要**给这个桶配自动删除的生命周期规则：原图跟随作品生命周期由应用删除（作者撤回 / 注销即删；下架 30 天未恢复由维护任务删除），整桶或无前缀限定的过期规则会把原图一起删掉。备份文件由人工定期到 `beadhue-backup/` 下清理。
- [ ] 创建子账号 API 密钥（仅授予该桶读写），填入 `.env`（`COS_*` 变量）。应用启动时校验 `COS_BUCKET` 与凭证齐全，缺失拒绝启动。
- [ ] 可选：若想把原图放到另一个私有桶或另一个子账号，再建一个同样不设自动删除的私有桶，填 `.env` 的 `COS_ORIGINALS_BUCKET`（及按需 `COS_ORIGINALS_SECRET_ID/KEY/REGION`）；留空即与备份共用。
- [ ] 上线后验证：用测试账号投稿一次并上传原图，控制台能看到 `originals/<修订ID>/<sha256>.<ext>` 对象；撤回作品后对象消失。

## 第 6b 步：评论内容安全（腾讯云文本内容安全，D50）

- [ ] 开通「内容安全 → 文本内容安全」，在「策略管理」创建或选用策略，记录策略编号（`BizType`）；开通前评论全部进入人工待审。
- [ ] 购买资源包或确认按量计费；应用侧成本护栏：每天最多 `TMS_DAILY_BUDGET` 次调用（默认 2000），同文 7 天缓存不重复计费，超预算评论自动转人工。
- [ ] 到访问管理（CAM）给第 6 步的 COS 子账号追加 `tms:TextModeration` 权限（新建自定义策略或直接关联预设的 `QcloudTMSFullAccess`）。应用默认沿用 `COS_SECRET_ID/KEY` 调用内容安全，不需要新建密钥；只有想用另一把密钥时才填 `TMS_SECRET_ID/KEY`。
- [ ] `.env` 新增 `TMS_BIZ_TYPE=<策略编号>`（唯一必须新加的变量；留空则用腾讯云默认策略）。
- [ ] 上线后到「管理后台 → 系统信息 → 评论内容安全服务」确认状态为「运行正常」，并用一条明显广告文案验证会被拦截且进入「评论处理」队列。

## 第 7 步：部署

- [ ] SSH 登录服务器，安装 Docker 与 docker compose 插件（OpenCloudOS：`sudo dnf -y install docker-ce docker-ce-cli containerd.io docker-compose-plugin`，仓库见 docker-ce 官方源/腾讯云镜像；Ubuntu：`apt install docker.io docker-compose-v2`），将当前用户加入 docker 组。
- [ ] 将仓库中的部署编排文件同步到 `/opt/beadhue`，并 `chmod +x deploy/scripts/*.sh`；应用源码不会在服务器构建。
- [ ] 复制 `.env.example` 为 `.env`，填写全部变量；`APP_IMAGE` 必须指向 release workflow 推送的稳定 GHCR tag 或 digest（禁止 `latest`）。
- [ ] （镜像加固，本轮新增）备份改用独立子账号密钥：到 CAM 新建一把只有该 COS 桶 `beadhue-backup/` 前缀读写权限的子账号密钥，填 `.env` 的 `BACKUP_COS_SECRET_ID` / `BACKUP_COS_SECRET_KEY`。`COS_SECRET_ID/KEY` 仍留给应用（作品原图）。这一项**必须做**：备份容器已不再回退到应用密钥，未配置时 `backup` 容器启动即失败并告警（`docker compose -f docker-compose.prod.yml logs backup` 会看到 `COS_SECRET_ID/COS_SECRET_KEY/COS_BUCKET/COS_REGION must all be configured`）。
- [ ] （镜像加固，本轮新增）同一把备份密钥也要加到 GitHub 仓库 Secrets（`BACKUP_COS_SECRET_ID` / `BACKUP_COS_SECRET_KEY`）并让 `Production backup restore drill` 工作流读取它；否则每月 1 日的恢复演练仍在用应用密钥，密钥隔离只做了一半。
- [ ] （容器加固，本轮新增）确认 Docker 版本满足新编排项：`docker compose version` 为 v2.x，且 `docker info` 能看到 cgroup v2（`read_only` / `mem_limit` / `pids_limit` / `cap_drop` 都是标准能力，但老 compose v1 不认 `pids_limit`）。
- [ ] 执行 `bash deploy/scripts/deploy.sh`（拉取已门禁应用镜像 → 在线只读预检 → 短暂停止 Caddy → 再次只读终检；全新空库直接放行，终检失败自动恢复原入口 → 运行数据库迁移 → 替换 app 并恢复 caddy/backup）。
- [ ] 验证：`docker compose ps` 中 app/postgres 为 healthy、caddy 为 running；backup 在首次校验备份完成前可为 starting，成功后必须为 healthy；backup 若重试耗尽后为 exited(non-zero)，按容器日志修复备份或告警链路；`curl -I https://<域名>` 返回 200。

## 发版升级（上线后的日常更新）

部署就绪后，日常发版按以下门禁流程执行：

- 推送稳定版本 tag，等待 release workflow 全绿；同步部署编排文件，在 `.env` 更新 `APP_IMAGE=ghcr.io/527520/beadhue:vX.Y.Z`，再执行 `bash deploy/scripts/deploy.sh`。
- 注意：同步编排文件时**不要覆盖**服务器 `.env`（SES/COS/SMTP/TMS 等配置保留）；数据库迁移随 deploy.sh 幂等执行。
- 本轮（迁移 0013–0015）起原图默认写入备份桶 `COS_BUCKET` 的 `originals/` 前缀，`.env` 无需新增变量；升级前到控制台把该桶已有的「30 天自动删除」生命周期规则删掉（备份改为人工定期清理），确认桶上不再有任何过期规则。若 `COS_*` 不齐全，新镜像启动校验失败并自动回滚到旧入口。
- **镜像加固那一轮新增的例外**：备份改用独立密钥后，`.env` 必须先补上 `BACKUP_COS_SECRET_ID` / `BACKUP_COS_SECRET_KEY`（见第 7 步），否则该轮升级后 `backup` 容器会启动失败并告警——这是刻意的显式失败，不是回归。容器资源上限的 8 个变量全部有默认值，不填不影响升级。

## 第 8 步：迟迟（chi）接入 —— 同机第二个应用

迟迟是与本仓库并行的独立部署单元，放在 `/opt/chi`，自带 compose 文件与部署脚本；
它通过 external network `doupu_default` 加入本网络，**不发布任何宿主机端口**，
由本仓库的 Caddy 一并反代（Caddyfile 末尾的 `{$CHI_SITE_DOMAIN}` 站点块）。
两者共用同一台 Postgres 实例，但使用独立 database `chi` + 独立 role `chi`。

- [ ] DNS：为迟迟域名（如 `chi.doupu.fun`）添加 A 记录指向本机公网 IP；**先确认解析生效再改 Caddy 配置**——Caddy 启动时若该域名 ACME 挑战失败会拖慢整体证书加载。
- [ ] 防火墙/安全组无需新增端口：沿用已放行的 `80`/`443`；迟迟在本网络内以 `chi:3200` 被访问。
- [ ] 引导数据库（幂等，可重复执行）：
  ```
  cd /opt/beadhue
  docker compose -f docker-compose.prod.yml exec -T postgres \
    psql -U beadhue -d postgres -v chi_password='<强随机密码>' \
    -f - < /opt/chi/deploy/postgres/bootstrap-chi.sql
  ```
  该脚本创建 role `chi` 与 database `chi`，并**收回 chi 对 `beadhue` 库的一切权限**（防止误连写脏数据）。输出末行的 `role_chi`/`database_chi` 应为 `1`/`1`。
- [ ] `.env` 新增两项：`CHI_SITE_DOMAIN=chi.doupu.fun` 与（可留默认）`CHI_UPSTREAM=chi:3200`。
- [ ] 部署迟迟：`cd /opt/chi && cp deploy/.env.example deploy/.env`（填 `DATABASE_URL=postgres://chi:<密码>@postgres:5432/chi` 与 `ADMIN_TOKEN`）→ `bash deploy/scripts/deploy.sh`。
- [ ] 让新站点生效：`cd /opt/beadhue && docker compose -f docker-compose.prod.yml up -d caddy`。
- [ ] 验收：`curl -I https://chi.doupu.fun` 返回 200 且证书有效；`curl -I https://<豆色绘域名>` 仍返回 200；迟迟页面能建房、两个浏览器可实时同步。
- [ ] 隔离性验收：`docker compose -f docker-compose.prod.yml exec -T postgres psql -U chi -d beadhue -c 'select 1'` 必须报 `permission denied for database "beadhue"`（而不是返回结果）。这正是隔离生效的证据；迟迟日志里出现同样的错误说明它的 `DATABASE_URL` 配错了库。
- [ ] 隔离性验收 2（可选）：`psql -U chi -d chi -c 'create database x'` 与 `-c 'create role x'` 都应被拒绝，确认 chi 只是普通角色。
- [ ] 冒烟验收：迟迟镜像内置了 `scripts/smoke.js`，`deploy/scripts/deploy.sh` 会自动跑（36 项）。手动重跑：`cd /opt/chi && docker compose -f deploy/docker-compose.yml exec -T chi node scripts/smoke.js http://127.0.0.1:3200`。
- [ ] 回滚方式：`cd /opt/chi && docker compose -f deploy/docker-compose.yml down`；如需一并撤销入口，从 Caddyfile 删除迟迟站点块后 `docker compose -f docker-compose.prod.yml up -d caddy`。迟迟的 `chi` 库与豆色绘的 `beadhue` 库互不影响。

## 第 9 步：上线验收（对照 spec §10）

- [ ] HTTPS 正常、无证书告警；HTTP 自动跳转 HTTPS。
- [ ] 注册 → 收到验证邮件 → 验证 → 登录 全流程可用（若收不到：检查 SES 控制台发信状态与 SPF/DKIM 验证）。
- [ ] 上传照片 → 生成图纸 → 导出 PNG/PDF/项目文件 全流程可用（用手机与桌面各测一次）。
- [ ] 先提交完整候选版本并记录 commit SHA；在物理 iPhone Safari 与 Android Chrome 完成 `deploy/evidence/mobile/README.md` 的完整矩阵。
- [ ] 按 `deploy/evidence/algorithm/README.md` 对上一版本与该候选 commit 做六类固定素材人工并排验收。
- [ ] 创建单父 attestation commit：相对候选父提交只新增当版本 mobile/algorithm 两份 JSON，二者的 `candidateCommit` 均填父提交 SHA；先将该 attestation commit 合入并推送到受保护的 `main`，再让 tag 指向它，否则 release workflow 拒绝发布镜像。
- [ ] 双设备同步：修改设计后在另一设备登录可见。
- [ ] 备份验证：手动触发一次备份脚本，从 COS 下载 dump 并确认可恢复（`deploy/restore.md` 演练）。
- [ ] 页脚不显示 ICP 占位号，开源链接与隐私政策页可访问。

## 查看 Caddy 访问日志

Caddyfile 本轮给主站与迟迟站点都加了 `log`（JSON 写 stdout），爬虫 / 扫描器 / 异常请求第一次可见。

- [ ] 实时跟踪：
  ```bash
  cd /opt/beadhue
  docker compose -f docker-compose.prod.yml logs -f --tail=100 caddy
  ```
  只看最近一次启动之后的访问行：
  ```bash
  docker compose -f docker-compose.prod.yml logs --since=1h caddy | grep '"logger":"http.log.access"'
  ```
  （容器日志是 json-file，已按 10MB × 5 轮转，不会撑满系统盘。）
- [ ] 重点看什么：
  - `request.remote_ip`：客户端真实 IP（Caddy 记录的即 TCP 对端；应用侧限流用的是同一来源）。
  - `request.uri` + `status`：`404`/`403` 集中在 `/.env`、`/wp-login.php`、`/phpmyadmin` 之类的路径 = 有人在扫站；`429` 变多 = 应用限流正在生效（这是预期行为，不是故障）。
  - `request.headers.User-Agent`：空 UA 或 `python-requests` / `curl` / 各种爬虫库的高频请求。
  - 单个 IP 短时间内大量 `200` 且 URI 分布很广 = 抓站；结合应用侧 `RATE_PUBLIC_READ_IP_HOUR` 判断是否需要收紧。
- [ ] 需要长期留存时：`docker compose -f docker-compose.prod.yml logs --since=24h caddy > access-$(date +%F).log`，再按需下载分析；本票不引入日志聚合服务（超出范围）。

## 资源上限调参

`docker-compose.prod.yml` 给四个服务都设了内存 / CPU / 进程数上限，全部通过 `.env` 覆盖，改完执行 `docker compose -f docker-compose.prod.yml up -d`（Caddy/app 会自动重建）或 `bash deploy/scripts/deploy.sh`。

| 变量 | 默认 | 调大的时机 |
| --- | --- | --- |
| `APP_MEM_LIMIT` | `1g` | app 日志出现 OOM / 容器被内核杀掉（`docker compose ps` 显示 exited 137），或一次性导出大图纸时 |
| `APP_CPUS` | `1.5` | 生成/导出排队明显变慢，且 `docker stats` 显示 app CPU 长期顶在 1.5 |
| `POSTGRES_MEM_LIMIT` | `768m` | 查询报内存不足、或 `docker stats` 里 postgres 长期贴顶 |
| `POSTGRES_PIDS_LIMIT` | `256` | 应用连接池上限（`DB_POOL_MAX`）调大后，连接报 `remaining connection slots` / 进程创建失败 |
| `CADDY_MEM_LIMIT` | `256m` | 几乎不需要动；证书很多或日志量极大时才考虑 |
| `CADDY_PIDS_LIMIT` | `256` | 同上，几乎不需要动 |
| `BACKUP_MEM_LIMIT` | `512m` | 数据库变大后备份容器被 OOM 杀掉（backup 日志出现 `pg_dump failed` 且 `docker inspect` 显示 137） |
| `BACKUP_PIDS_LIMIT` | `256` | 几乎不需要动 |

- [ ] 查看实际占用：`docker stats --no-stream`（MEM USAGE / LIMIT 两列对比）。
- [ ] 2 核 2GB 小机的经验分配：postgres 768m + app 1g + caddy 256m + backup 512m ≈ 2.5g **上限之和大于物理内存是允许的**（上限不是预留），但若 `docker stats` 里多个容器同时贴顶，就要把不常用的上限调小，而不是继续加大。
- [ ] 上限调小后如果 app 起不来，先看 `docker compose -f docker-compose.prod.yml logs app` 是否是 137（OOM）或 `pids limit reached`（进程数）。

## 只读根文件系统的排查

app 容器现在 `read_only: true`：镜像内容不可写，只有两个 tmpfs 可写（`/tmp` 64m、`/app/.next/cache` 128m）。好处是应用被攻破也改不了代码；代价是任何「以为能写盘」的功能都会失败。

- [ ] 典型症状（app 日志 `docker compose -f docker-compose.prod.yml logs app`）：
  - `EROFS: read-only file system, open '/app/...'` —— 有新代码路径往镜像目录写文件。
  - `ENOSPC: no space left on device` 且路径在 `/tmp` 或 `/app/.next/cache` —— tmpfs 容量不够（不是磁盘满）。
  - 页面能开但缩略图/导出报 500，日志里是 `EROFS`/`ENOSPC` —— 多半就是缓存或临时目录。
- [ ] 判断是不是只读导致的：先确认配置真的生效，再确认哪些路径可写（都在 app 容器内执行，不需要重建）：
  ```bash
  cd /opt/beadhue
  # 1) 只读根 + 两个 tmpfs 是否生效
  docker compose -f docker-compose.prod.yml exec -T app sh -c 'grep " / " /proc/mounts'
  # 2) 根文件系统应当报 Read-only file system
  docker compose -f docker-compose.prod.yml exec -T app sh -c 'touch /app/.ro-probe'
  # 3) 两个 tmpfs 应当可写（下面两条都必须成功）
  docker compose -f docker-compose.prod.yml exec -T app sh -c 'touch /tmp/.probe && echo tmp-ok'
  docker compose -f docker-compose.prod.yml exec -T app sh -c 'mkdir -p /app/.next/cache/fetch-cache && touch /app/.next/cache/.probe && echo cache-ok'
  ```
  第 2 条报 `Read-only file system` 是预期（说明只读生效）；第 3 条失败则说明 tmpfs 没挂上或容量不足。
- [ ] 确认需要新可写目录后，在 `docker-compose.prod.yml` 的 app 服务 `tmpfs:` 下加一行（路径写容器内绝对路径，容量按需给，不要给 `rw` 挂载宿主机目录）：
  ```yaml
    tmpfs:
      - /tmp:size=64m,mode=1777
      - /app/.next/cache:size=128m,mode=1777
      - /app/新目录:size=32m,mode=1777   # 说明为什么需要它，并同步 .env.example/本清单
  ```
  然后 `docker compose -f docker-compose.prod.yml up -d app` 生效（无需重新构建镜像）。
- [ ] 若某个目录确实需要**持久化**（重启不丢），tmpfs 不适用：那种数据应当落在数据库或 COS，而不是容器文件系统（这是本部署的既定边界，见 ADR-0005 / ADR-0019）。

## 应急速查

- 服务器失联：腾讯云控制台 VNC 登录排查；数据以每日 COS 备份为准。
- 证书续期失败：检查 80 端口可达性与 DNS；Caddy 日志 `docker compose logs caddy`。
- 邮件进垃圾箱：核对 SPF/DKIM 记录、发信域名验证状态、模板文案（避免纯链接）。
- 磁盘将满：`docker system df` 看日志/镜像占用；容器日志已限 10MB×5，主要嫌疑是旧镜像（`docker image prune`）与 `pgdata`。
- 备份失败告警：先看 `docker compose -f docker-compose.prod.yml logs backup`；`must all be configured` = `BACKUP_COS_SECRET_ID/KEY` 没填或填错。
