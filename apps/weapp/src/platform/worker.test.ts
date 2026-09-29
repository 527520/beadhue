import { afterEach, it, expect, vi } from "vitest";
import { runTask, cancelTask } from "./worker";
const task = { kind: "zip" as const, files: {} };
afterEach(() => {
  cancelTask();
  vi.unstubAllGlobals();
});
it("ignores superseded preload and result callbacks while allowing only one worker", async () => {
  const preload: Array<{ success: () => void }> = [],
    workers: Array<{ send: (v: unknown) => void; terminated: boolean }> = [];
  vi.stubGlobal("wx", {
    preDownloadSubpackage: (callbacks: { success: () => void }) =>
      preload.push(callbacks),
    createWorker: () => {
      expect(workers.filter((w) => !w.terminated)).toHaveLength(0);
      const worker = { send: (_v: unknown) => {}, terminated: false };
      workers.push(worker);
      return {
        onMessage: (fn: (v: unknown) => void) => {
          worker.send = fn;
        },
        onProcessKilled: () => {},
        postMessage: () => {},
        terminate: () => {
          worker.terminated = true;
        },
      };
    },
  });
  const old = runTask(task);
  const rejectedOld = expect(old).rejects.toMatchObject({ name: "AbortError" });
  const current = runTask<string>(task);
  preload[0].success();
  expect(workers).toHaveLength(0);
  preload[1].success();
  expect(workers).toHaveLength(1);
  const rejectedCurrent = expect(current).rejects.toMatchObject({
    name: "AbortError",
  });
  const next = runTask<string>(task);
  preload[2].success();
  workers[0].send({ id: 2, result: "stale" });
  workers[1].send({ id: 3, result: "latest" });
  await rejectedOld;
  await rejectedCurrent;
  expect(await next).toBe("latest");
  expect(workers.every((w) => w.terminated)).toBe(true);
});
it("terminates the worker if native postMessage rejects", async () => {
  const terminate = vi.fn();
  vi.stubGlobal("wx", {
    preDownloadSubpackage: ({ success }: { success: () => void }) => success(),
    createWorker: () => ({
      onMessage: () => {},
      onProcessKilled: () => {},
      postMessage: () => {
        throw new Error("native transport");
      },
      terminate,
    }),
  });
  await expect(runTask(task)).rejects.toThrow("native transport");
  expect(terminate).toHaveBeenCalledOnce();
});
