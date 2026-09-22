import { sha256 as hashSha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { openIndexedDb, parseStoredProject } from "@/lib/storage";
import { enqueueDesignSync, withDesignStorageLock } from "@/lib/sync/queue";
import { createBeadhueApi } from "@/lib/sync/api";
import type { ImageType } from "@/lib/image/sniff";

export interface CachedOriginal {
  sha256: string;
  bytes: ArrayBuffer;
  type: ImageType;
  name: string;
}
export interface OriginalTask {
  key: string;
  url: string;
  sha256: string;
  email: string;
  designId?: string;
  status: "pending" | "uploading" | "waiting" | "failed" | "done" | "cancelled";
  retryAt?: number;
  message?: string;
  result?: Record<string, unknown>;
}
const EVENT = "beadhue:original-status";
export const ORIGINAL_STATUS_EVENT = EVENT;
const listeners = new Map<
  string,
  {
    resolve: (value: Record<string, unknown>) => void;
    reject: (error: Error) => void;
  }[]
>();
let running: Promise<void> | null = null;
let rerun = false;
let activeEmail: string | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("beadhue-originals", 2);
    request.onupgradeneeded = () => {
      for (const [name, keyPath] of [
        ["images", "sha256"],
        ["tasks", "key"],
        ["cooldowns", "email"],
      ]) {
        if (!request.result.objectStoreNames.contains(name))
          request.result.createObjectStore(name, { keyPath });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function access<T>(
  name: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(name, mode);
      const request = fn(tx.objectStore(name));
      let value: T;
      request.onsuccess = () => {
        value = request.result;
      };
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function cacheOriginal(
  bytes: Uint8Array,
  type: ImageType,
  name: string,
): Promise<CachedOriginal> {
  const sha256 = bytesToHex(hashSha256(bytes));
  const record = { sha256, bytes: new Uint8Array(bytes).buffer, type, name };
  await access("images", "readwrite", (s) => s.put(record));
  return record;
}
export async function getCachedOriginal(
  sha256: string,
): Promise<CachedOriginal | null> {
  return (
    (await access<CachedOriginal | undefined>("images", "readonly", (s) =>
      s.get(sha256),
    )) ?? null
  );
}
export async function originalTasks(): Promise<OriginalTask[]> {
  return access("tasks", "readonly", (s) => s.getAll());
}
async function saveTask(task: OriginalTask) {
  await access("tasks", "readwrite", (s) => s.put(task));
  window.dispatchEvent(new Event(EVENT));
}
/** The durable state transition is the cancellation/claim linearization point. */
async function changeTask(
  key: string,
  update: (task: OriginalTask) => OriginalTask | null,
): Promise<OriginalTask | null> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("tasks", "readwrite");
      const store = tx.objectStore("tasks");
      let next: OriginalTask | null = null;
      const read = store.get(key);
      read.onsuccess = () => {
        if (read.result) {
          next = update(read.result);
          if (next) store.put(next);
        }
      };
      tx.oncomplete = () => {
        window.dispatchEvent(new Event(EVENT));
        resolve(next);
      };
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function cooldown(email: string): Promise<number> {
  const row = await access<{ email: string; retryAt: number } | undefined>(
    "cooldowns",
    "readonly",
    (store) => store.get(email),
  );
  return row?.retryAt ?? 0;
}
export async function cancelOriginalTask(key: string) {
  const cancelled = await changeTask(key, (task) =>
    ["pending", "waiting", "failed"].includes(task.status)
      ? { ...task, status: "cancelled", message: "已取消原图上传" }
      : null,
  );
  if (cancelled) settle(key, new Error("已取消原图上传"));
}
export async function retryOriginalTask(key: string) {
  await changeTask(key, (task) =>
    ["failed", "cancelled"].includes(task.status)
      ? { ...task, status: "pending", retryAt: undefined }
      : null,
  );
  void resumeOriginalUploads();
}
function settle(key: string, result: Record<string, unknown> | Error) {
  for (const pending of listeners.get(key) ?? []) {
    if (result instanceof Error) pending.reject(result);
    else pending.resolve(result);
  }
  listeners.delete(key);
}

export async function enqueueOriginalUpload(input: {
  url: string;
  sha256: string;
  email: string;
  designId?: string;
}): Promise<Record<string, unknown>> {
  const key = `${input.email}:${input.url}:${input.sha256}`;
  const existing = (await originalTasks()).find((t) => t.key === key);
  if (!input.designId && existing?.status === "done" && existing.result)
    return existing.result;
  if (
    !existing ||
    existing.status === "cancelled" ||
    existing.status === "failed" ||
    existing.status === "done"
  )
    await saveTask({
      ...existing,
      ...input,
      key,
      status: "pending",
      retryAt: undefined,
    });
  const promise = new Promise<Record<string, unknown>>((resolve, reject) => {
    const list = listeners.get(key) ?? [];
    list.push({ resolve, reject });
    listeners.set(key, list);
  });
  void resumeOriginalUploads();
  return promise;
}

async function bindPrivate(
  task: OriginalTask,
  result: Record<string, unknown>,
) {
  const auth = await fetch("/api/auth/me", { cache: "no-store" }).then((r) =>
    r.ok ? r.json() : null,
  );
  if (auth?.email !== task.email)
    throw new Error("登录账号已变化，请切回原账号后重试");
  const adapter = await openIndexedDb();
  if (!adapter) throw new Error("本机存储不可用");
  await withDesignStorageLock(async () => {
    const record = (await adapter.getAll()).find((r) => r.id === task.designId);
    const project = record && parseStoredProject(record.projectJson);
    if (
      !record ||
      !project?.original ||
      project?.original?.sha256 !== task.sha256
    )
      throw new Error("原图已更换，旧上传已保留但未关联");
    project.original = { ...project.original, assetId: String(result.assetId) };
    await adapter.put({
      ...record,
      projectJson: JSON.stringify(project),
      syncState: "dirty",
    });
  });
  window.dispatchEvent(
    new CustomEvent("beadhue:original-bound", {
      detail: {
        designId: task.designId,
        sha256: task.sha256,
        assetId: result.assetId,
      },
    }),
  );
  await enqueueDesignSync(adapter, createBeadhueApi());
  const synced = (await adapter.getAll()).find((r) => r.id === task.designId);
  const project = synced && parseStoredProject(synced.projectJson);
  if (
    synced?.syncState !== "synced" ||
    project?.original?.assetId !== result.assetId ||
    project?.original?.sha256 !== task.sha256
  )
    throw new Error("图纸版本发生冲突，原图已保留；请确认设计后重试关联");
}

async function drain() {
  const tasks = await originalTasks();
  const auth = (await fetch("/api/auth/me")
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)) as { email?: string } | null;
  activeEmail = auth?.email ?? null;
  if (!activeEmail) return;
  for (const snapshot of tasks) {
    if (snapshot.status === "done" && snapshot.result)
      settle(snapshot.key, snapshot.result);
    if (["failed", "cancelled"].includes(snapshot.status))
      settle(snapshot.key, new Error(snapshot.message ?? "原图上传未完成"));
    if (snapshot.email !== activeEmail) continue;
    const retryAt = await cooldown(snapshot.email);
    if (retryAt > Date.now()) {
      await changeTask(snapshot.key, (task) =>
        ["pending", "uploading", "waiting"].includes(task.status)
          ? { ...task, status: "waiting", retryAt, message: "原图上传较频繁" }
          : null,
      );
      continue;
    }
    const task = await changeTask(snapshot.key, (current) =>
      ["pending", "uploading", "waiting"].includes(current.status) &&
      (current.retryAt ?? 0) <= Date.now()
        ? { ...current, status: "uploading" }
        : null,
    );
    if (!task) continue;
    try {
      let result = task.result;
      const lookup = await fetch(`/api/originals?sha256=${task.sha256}`, {
        cache: "no-store",
      });
      if (!lookup.ok) throw new Error("暂时无法检查原图版本，请稍后重试");
      const { asset } = (await lookup.json()) as {
        asset: Record<string, unknown> | null;
      };
      if (task.designId && result?.assetId && asset?.assetId !== result.assetId)
        result = undefined;
      if (asset) {
        if (task.designId) result = asset;
        else {
          const attached = await fetch(task.url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ assetId: asset.assetId }),
          });
          if (!attached.ok) {
            const error = await attached.json().catch(() => null);
            throw new Error(error?.error?.message ?? "原图关联失败");
          }
          result = (await attached.json()) as Record<string, unknown>;
        }
      }
      if (!result) {
        const headers: Record<string, string> = {
          "content-type": "application/octet-stream",
        };
        if (task.designId) {
          const adapter = await openIndexedDb();
          if (!adapter) throw new Error("本机存储不可用");
          await enqueueDesignSync(adapter, createBeadhueApi());
          const record = (await adapter.getAll()).find(
            (r) => r.id === task.designId,
          );
          const project = record && parseStoredProject(record.projectJson);
          if (!record || !record.revision || record.syncState !== "synced")
            throw new Error("图纸尚未同步，稍后可重试原图");
          if (project?.original?.sha256 !== task.sha256)
            throw new Error("原图已更换，请取消旧任务");
          headers["if-match"] = String(record.revision);
        }
        if (!result) {
          const cached = await getCachedOriginal(task.sha256);
          if (!cached) throw new Error("本机完整原图缺失，请重新选择");
          await saveTask({ ...task, status: "uploading" });
          const response = await fetch(task.url, {
            method: "PUT",
            headers,
            body: cached.bytes,
            credentials: "same-origin",
          });
          if (response.status === 429) {
            const seconds = Math.max(
              1,
              Number(response.headers.get("retry-after")) || 60,
            );
            const retryAt = Math.max(
              await cooldown(task.email),
              Date.now() + seconds * 1000,
            );
            await access("cooldowns", "readwrite", (store) =>
              store.put({ email: task.email, retryAt }),
            );
            for (const waiting of await originalTasks()) {
              if (waiting.email !== task.email) continue;
              await changeTask(waiting.key, (current) =>
                ["pending", "uploading", "waiting"].includes(current.status)
                  ? {
                      ...current,
                      status: "waiting",
                      retryAt: Math.max(retryAt, current.retryAt ?? 0),
                      message: "原图上传较频繁",
                    }
                  : null,
              );
            }
            return;
          }
          if (!response.ok) {
            const error = await response.json().catch(() => null);
            throw new Error(error?.error?.message ?? "原图上传失败");
          }
          result = (await response.json()) as Record<string, unknown>;
        }
        // Persist successful bytes before binding. A binding conflict/reload never reuploads bytes.
        await saveTask({ ...task, result, status: "uploading" });
      }
      if (task.designId) await bindPrivate(task, result);
      await saveTask({
        ...task,
        result,
        status: "done",
        retryAt: undefined,
        message: undefined,
      });
      settle(task.key, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "原图上传失败";
      const latest =
        (await originalTasks()).find((t) => t.key === task.key) ?? task;
      await saveTask({ ...latest, status: "failed", message });
      settle(task.key, new Error(message));
    }
  }
}
export function resumeOriginalUploads(): Promise<void> {
  if (typeof indexedDB === "undefined") return Promise.resolve();
  rerun = true;
  if (running) return running;
  clearTimeout(timer);
  running = (async () => {
    try {
      do {
        rerun = false;
        if (navigator.locks)
          await navigator.locks.request("beadhue-original-uploads", () =>
            drain(),
          );
        else await drain();
        const tasks = await originalTasks();
        const next = tasks
          .filter(
            (t) =>
              t.email === activeEmail && t.status === "waiting" && t.retryAt,
          )
          .map((t) => t.retryAt!);
        clearTimeout(timer);
        if (next.length)
          timer = setTimeout(
            () => void resumeOriginalUploads(),
            Math.min(
              24 * 3600_000,
              Math.max(1000, Math.min(...next) - Date.now()),
            ),
          );
      } while (rerun);
    } catch {
      // Offline/private storage leaves durable tasks untouched.
    } finally {
      running = null;
    }
  })();
  return running;
}
