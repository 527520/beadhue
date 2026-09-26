/**
 * E2E 全局设置：启动 Next 16 Turbopack dev 服务器，
 * 捕获 stdout 到日志文件——dev 邮件假实现把验证/重置链接打印到 stdout，测试从中读取。
 * 数据库：不设置 DATABASE_URL → 服务启动钩子初始化进程内 PGlite（每轮测试全新库）。
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync, createWriteStream } from 'node:fs';
import { assertPlaywrightBrowsersInstalled } from './checkBrowsers.cjs';
import { E2E_ORIGIN, E2E_PORT, e2eDevLogPath, stopProcessTree } from './serverProcess';

// 日志放系统临时目录：dev 服务器监听项目内文件，日志写入会触发 Fast Refresh 全量重载；按端口分文件，并行运行互不串读
const LOG_PATH = e2eDevLogPath();
const READY_URL = `${E2E_ORIGIN}/api/auth/me`;

let server: ChildProcess | null = null;

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(READY_URL, { method: 'GET' });
      // /api/auth/me 未登录返回 401 即说明服务器与路由已就绪
      if (response.status === 401 || response.status === 200) return;
    } catch {
      // 尚未就绪，继续轮询
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('E2E dev server did not become ready within 180s');
}

export default async function globalSetup(): Promise<void> {
  // 在启动应用前失败，避免跑到某个 project 才报 browser executable missing。
  assertPlaywrightBrowsersInstalled();
  writeFileSync(LOG_PATH, '', 'utf8'); // 清空旧日志（每次运行全新会话）

  const logStream = createWriteStream(LOG_PATH, { flags: 'a' });
  // 直接以 node 启动 next CLI（避免 npx/.cmd 在跨平台与沙箱下的解析差异）
  const nextBin = require.resolve('next/dist/bin/next');
  server = spawn(
    process.execPath,
    // 显式绑定回环地址：E2E 只走 127.0.0.1，同时跳过 Next 打印局域网地址时的网卡枚举
    // （macOS 缺少「本地网络」权限时该调用会以 EPERM 让进程直接退出）。
    [nextBin, 'dev', '-p', String(E2E_PORT), '-H', '127.0.0.1'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(E2E_PORT),
        NEXT_TELEMETRY_DISABLED: '1',
        // 显式移除 DATABASE_URL → PGlite 回退
        DATABASE_URL: '',
        // 稳定性门禁每段都使用新的内存库；手动设置时可指定持久化数据目录。
        PGLITE_DATA_DIR: process.env.E2E_PGLITE_DATA_DIR ?? '',
        BEADHUE_E2E_SEED: '1',
        BEADHUE_E2E_BUILD: '1',
        // Keep production defaults intact while preventing repeated browser
        // tests from exhausting the shared loopback IP bucket.
        RATE_LOGIN: '1000',
        RATE_REGISTER: '1000',
        RATE_TOKEN: '1000',
        // 豆社写接口（点赞 / 举报 / 引用 / 投稿 / 原图上传）与公开读同样按 IP 计数：
        // 三个浏览器项目串行跑完一轮会上传上百张原图（批次用例一次 50 张），默认 300/小时会在第三个项目里被耗尽。
        RATE_COMMUNITY_WRITE_USER_HOUR: '10000',
        RATE_COMMUNITY_WRITE_IP_HOUR: '10000',
        RATE_PUBLIC_READ_IP_HOUR: '20000',
        // admin-round-3 12 新增的闸门：三个浏览器项目串行跑一轮，登录态账号是「刚注册」，
        // 页面上每次加载都会拉 /api/config，公开读与账号配额都可能被正常用例耗尽 → 按老办法放宽。
        RATE_ACCOUNT_READ_USER_HOUR: '20000',
        RATE_ACCOUNT_READ_DISTINCT_WORKS_HOUR: '20000',
        RATE_NEW_ACCOUNT_READ_USER_HOUR: '20000',
        RATE_NEW_ACCOUNT_READ_DISTINCT_WORKS_HOUR: '20000',
        // 原图上传按账号 / IP 每分钟计：后台批次用例一分钟内会连续上传十几张（与实施指南的手动开发命令同口径）。
        RATE_ORIGINAL_USER_MINUTE: '1000',
        RATE_ORIGINAL_USER_HOUR: '10000',
        RATE_ORIGINAL_IP_MINUTE: '1000',
        RATE_ORIGINAL_IP_HOUR: '10000',
        RATE_ORIGINAL_READ_USER_HOUR: '10000',
        RATE_ORIGINAL_READ_IP_HOUR: '20000',
        RATE_TAGS_IP_HOUR: '20000',
        RATE_CONFIG_IP_HOUR: '20000',
        RATE_CONSENT_IP_HOUR: '10000',
        // 用例会故意输错密码：阈值放大，避免后续用例被临时锁定牵连（锁定语义由单测覆盖）。
        LOGIN_FAILURE_THRESHOLD: '1000',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      // Unix teardown 通过负 PID 终止整个进程组；Windows 由 taskkill /T 处理进程树。
      detached: process.platform !== 'win32',
    },
  );
  server.stdout!.pipe(logStream);
  server.stderr!.pipe(logStream);

  process.env.E2E_DEV_LOG = LOG_PATH;
  process.env.E2E_BASE_URL = E2E_ORIGIN;
  process.env.E2E_SERVER_PID = String(server.pid);

  try {
    await waitForServer();
  } catch (error) {
    if (server.pid) await stopProcessTree(server.pid, E2E_PORT).catch(() => undefined);
    throw error;
  }

  // 预热：逐个请求关键路由，触发 Turbopack 编译，避免测试期首次编译争用
  const warmRoutes = ['/', '/app', '/register', '/login', '/verify-email', '/forgot-password', '/me', '/me/settings', '/palettes', '/admin/reviews', '/admin/batches', '/help', '/about'];
  for (const route of warmRoutes) {
    try {
      await fetch(`${E2E_ORIGIN}${route}`, { method: 'GET' });
    } catch {
      // 忽略预热失败（路由缺失等）
    }
  }
  console.log('[e2e] dev server ready and warmed');
}
