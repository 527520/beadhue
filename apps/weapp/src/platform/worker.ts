import type { WorkerTask } from "../workers/tasks";
let active: {
  id: number;
  instance?: WechatMiniprogram.Worker;
  reject: (reason: Error) => void;
} | null = null;
let sequence = 0;
function aborted() {
  const error = new Error("任务已取消");
  error.name = "AbortError";
  return error;
}
export function cancelTask() {
  const old = active;
  active = null;
  old?.instance?.terminate();
  old?.reject(aborted());
}
/** At most ONE native worker, including generation and exports. Replacing a task invalidates its result. */
export function runTask<T>(task: WorkerTask): Promise<T> {
  cancelTask();
  const id = ++sequence;
  return new Promise<T>((resolve, reject) => {
    active = { id, reject };
    wx.preDownloadSubpackage({
      packageType: "workers",
      success() {
        if (active?.id !== id) return;
        try {
          const instance = wx.createWorker("workers/index.js");
          active.instance = instance;
          instance.onMessage((raw) => {
            const message = raw as unknown as {
              id: number;
              error?: string;
              result?: T;
            };
            if (active?.id !== id || message.id !== id) return;
            active = null;
            instance.terminate();
            if (message.error) reject(new Error(message.error));
            else resolve(message.result as T);
          });
          instance.onProcessKilled(() => {
            if (active?.id === id) {
              active = null;
              reject(new Error("设备内存不足，请保存设计后重试"));
            }
          });
          instance.postMessage({ id, task });
        } catch (error) {
          if (active?.id === id) active = null;
          reject(error);
        }
      },
      fail() {
        if (active?.id !== id) return;
        active = null;
        reject(new Error("计算资源加载失败，请联网后重试"));
      },
    });
  });
}
