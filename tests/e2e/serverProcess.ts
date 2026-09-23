import { spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_E2E_PORT = 3100;

/**
 * E2E dev 服务端口：环境变量 E2E_PORT，缺省 3100。
 * 隔离工作树里并行跑 E2E 时各自指定端口（如 E2E_PORT=3110），互不抢占；非法值直接报错，不静默回退到别人的端口。
 */
export function resolveE2ePort(value: string | undefined = process.env.E2E_PORT): number {
  if (value === undefined || value.trim() === '') return DEFAULT_E2E_PORT;
  const port = Number(value.trim());
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`E2E_PORT 必须是 1024–65535 之间的整数，收到：${value}`);
  }
  return port;
}

export const E2E_PORT = resolveE2ePort();
export const E2E_ORIGIN = `http://127.0.0.1:${E2E_PORT}`;

/** dev 服务日志按端口分文件：并行的几轮 E2E 各读各的邮件链接。放系统临时目录，避免触发 dev 服务的文件监听。 */
export function e2eDevLogPath(port: number = E2E_PORT, dir: string = tmpdir()): string {
  return join(dir, `beadhue-e2e-dev-${port}.log`);
}

interface SpawnResult {
  status: number | null;
  error?: Error;
}

export interface ProcessRuntime {
  platform: NodeJS.Platform;
  spawnSync(command: string, args: string[]): SpawnResult;
  kill(pid: number, signal: NodeJS.Signals): void;
}

const defaultRuntime: ProcessRuntime = {
  platform: process.platform,
  spawnSync(command, args) {
    return spawnSync(command, args, { stdio: 'ignore' });
  },
  kill(pid, signal) {
    process.kill(pid, signal);
  },
};

function portIsOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    let settled = false;
    const finish = (open: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(250, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

/** 等待 E2E 服务完全释放端口；超时必须失败，避免下一轮误连残留服务。 */
export async function waitForPortClosed(port: number, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await portIsOpen(port))) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`E2E dev server 端口 ${port} 在 ${timeoutMs}ms 后仍在监听`);
}

/**
 * 终止由 globalSetup 启动的完整进程树，并以端口释放作为完成条件。
 * Unix 依赖 spawn(detached=true) 建立独立进程组；Windows 使用 taskkill /T。
 */
export async function stopProcessTree(
  pid: number,
  port: number,
  runtime: ProcessRuntime = defaultRuntime,
  timeoutMs = 10_000,
): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error(`无效的 E2E server pid: ${pid}`);

  if (runtime.platform === 'win32') {
    const result = runtime.spawnSync('taskkill', ['/pid', String(pid), '/T', '/F']);
    if (result.error) throw result.error;
    // taskkill /T 枚举后逐个终止；Turbopack 池工作进程会在父进程被杀时自行退出，
    // 随后对它的终止报「无运行实例」并让整体退出码非零（实测 255），但进程树已清空。
    // 因此退出码只作诊断，端口是否释放才是成败依据。
    if (result.status !== 0) {
      try {
        await waitForPortClosed(port, timeoutMs);
        return;
      } catch (error) {
        throw new Error(`taskkill 终止 E2E server 失败（exit ${result.status}）：${(error as Error).message}`);
      }
    }
  } else {
    try {
      runtime.kill(-pid, 'SIGTERM');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  }

  try {
    await waitForPortClosed(port, timeoutMs);
  } catch (error) {
    if (runtime.platform === 'win32') throw error; // taskkill /F 已经是强制终止
    try {
      runtime.kill(-pid, 'SIGKILL');
    } catch (killError) {
      if ((killError as NodeJS.ErrnoException).code !== 'ESRCH') throw killError;
    }
    await waitForPortClosed(port, Math.max(timeoutMs, 1_000));
  }
}
