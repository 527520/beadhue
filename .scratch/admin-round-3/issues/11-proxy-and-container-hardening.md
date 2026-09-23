# 11 代理与容器加固

Status: ready-for-human
Completion: complete

## 目标
爬虫/攻击可见、容器有资源上限与最小权限。

## 范围
- `Caddyfile`：`log`（JSON 到 stdout）、`request_body max_size 25MB`、`timeouts`；保留 X-Real-IP 覆盖。
- `docker-compose.prod.yml`：四服务日志轮转上限；app 加 mem_limit/cpus/pids_limit/cap_drop/no-new-privileges/read_only+tmpfs；postgres 加 mem_limit/shm_size/pids_limit/cap_drop；备份改用独立 `BACKUP_COS_*`。
- 新增 `.github/dependabot.yml`；release workflow 加 Trivy 扫描。
- `deploy/CHECKLIST.md` 增三节；`.env.example` 增补变量。

## 验收
`docker compose config` 通过；本地镜像构建 + 启动 + 首页/登录/后台冒烟（不可用时标注为部署门禁）。
