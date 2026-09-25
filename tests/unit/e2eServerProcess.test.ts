import { spawn, type ChildProcess } from 'node:child_process';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_E2E_PORT,
  e2eDevLogPath,
  resolveE2ePort,
  stopProcessTree,
  waitForPortClosed,
  type ProcessRuntime,
} from '../e2e/serverProcess';

describe('E2E 端口可配置（隔离工作树并行运行）', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('缺省 3100，E2E_PORT 可覆盖，非法值直接报错', () => {
    expect(resolveE2ePort(undefined)).toBe(DEFAULT_E2E_PORT);
    expect(resolveE2ePort('')).toBe(3100);
    expect(resolveE2ePort(' 3110 ')).toBe(3110);
    for (const bad of ['abc', '80', '70000', '3100.5', '-1']) expect(() => resolveE2ePort(bad)).toThrow(/E2E_PORT/);
  });

  it('dev 服务日志按端口分文件，并行运行互不串读邮件链接', () => {
    expect(e2eDevLogPath(3100, '/tmp')).toBe(join('/tmp', 'beadhue-e2e-dev-3100.log'));
    expect(e2eDevLogPath(3110, '/tmp')).not.toBe(e2eDevLogPath(3100, '/tmp'));
  });

  it('Playwright baseURL、服务端口与辅助函数的 BASE_URL 都跟随 E2E_PORT', async () => {
    vi.stubEnv('E2E_PORT', '3123');
    vi.stubEnv('E2E_BASE_URL', '');
    delete process.env.E2E_BASE_URL;
    const server = await import('../e2e/serverProcess');
    expect(server.E2E_PORT).toBe(3123);
    expect(server.E2E_ORIGIN).toBe('http://127.0.0.1:3123');
    const { default: config } = await import('../../playwright.config.mjs');
    expect(config.use?.baseURL).toBe('http://127.0.0.1:3123');
  });
});

const children = new Set<ChildProcess>();

afterEach(() => {
  for (const child of children) child.kill('SIGKILL');
  children.clear();
});

async function spawnHttpServer(ignoreSigterm = false): Promise<{ child: ChildProcess; port: number }> {
  const child = spawn(
    process.execPath,
    [
      '-e',
      `${ignoreSigterm ? "process.on('SIGTERM',()=>{});" : ''}const s=require('node:http').createServer((_q,r)=>r.end('ok'));s.listen(0,'127.0.0.1',()=>console.log(s.address().port));`,
    ],
    {
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );
  children.add(child);
  const port = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.stdout!.once('data', (chunk) => resolve(Number(String(chunk).trim())));
  });
  return { child, port };
}

function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

describe('E2E dev server lifecycle', () => {
  it('stops the whole Unix process group and waits until its port is closed', async () => {
    const { child, port } = await spawnHttpServer();
    expect(await canConnect(port)).toBe(true);

    await stopProcessTree(child.pid!, port);

    expect(await canConnect(port)).toBe(false);
    children.delete(child);
  });

  it('uses taskkill for a Windows process tree and still verifies port release', async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const runtime: ProcessRuntime = {
      platform: 'win32',
      spawnSync(command, args) {
        calls.push({ command, args });
        return { status: 0, error: undefined };
      },
      kill() {
        throw new Error('Windows must not use POSIX kill');
      },
    };

    await stopProcessTree(42, 65_535, runtime, 100);

    expect(calls).toEqual([{ command: 'taskkill', args: ['/pid', '42', '/T', '/F'] }]);
  });

  it('treats a non-zero taskkill status as advisory when the port is released', async () => {
    const runtime: ProcessRuntime = {
      platform: 'win32',
      spawnSync: () => ({ status: 255, error: undefined }),
      kill() {
        throw new Error('Windows must not use POSIX kill');
      },
    };

    await expect(stopProcessTree(42, 65_535, runtime, 100)).resolves.toBeUndefined();
  });

  it('reports the taskkill status when the port stays open on Windows', async () => {
    const { child, port } = await spawnHttpServer();
    const runtime: ProcessRuntime = {
      platform: 'win32',
      spawnSync: () => ({ status: 255, error: undefined }),
      kill() {
        throw new Error('Windows must not use POSIX kill');
      },
    };

    await expect(stopProcessTree(child.pid!, port, runtime, 50)).rejects.toThrow(/exit 255.*仍在监听/);

    child.kill('SIGKILL');
  });

  it.runIf(process.platform !== 'win32')('escalates to SIGKILL when graceful shutdown cannot release the port', async () => {
    const { child, port } = await spawnHttpServer(true);

    await stopProcessTree(child.pid!, port, undefined, 100);

    expect(await canConnect(port)).toBe(false);
    children.delete(child);
  });

  it('reports a port that remains open instead of silently succeeding', async () => {
    const { child, port } = await spawnHttpServer();

    await expect(waitForPortClosed(port, 50)).rejects.toThrow(/仍在监听/);

    child.kill('SIGKILL');
  });
});
