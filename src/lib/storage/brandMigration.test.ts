// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  migrateBrowserPreferences,
  migrateLegacyDatabase,
} from "./brandMigration";
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());
function open(name: string) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("designs", { keyPath: "id" });
      r.result.createObjectStore("progress");
      r.result.createObjectStore("_brand_migrations");
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function write(
  db: IDBDatabase,
  store: string,
  value: unknown,
  key?: IDBValidKey,
) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    if (key === undefined) tx.objectStore(store).put(value);
    else tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
}
function read(db: IDBDatabase, store: string, key: IDBValidKey) {
  return new Promise<unknown>((resolve, reject) => {
    const r = db.transaction(store).objectStore(store).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
it("copies designs and binary progress, preserves the legacy source and existing new records", async () => {
  const old = await open("doupu-test"),
    next = await open("beadhue-test");
  await write(old, "designs", { id: "a", name: "旧设计" });
  await write(old, "designs", { id: "b", name: "旧名称" });
  await write(old, "progress", new Uint8Array([1, 0, 1]), "a");
  await write(next, "designs", { id: "b", name: "新名称" });
  await migrateLegacyDatabase(next);
  expect(await read(next, "designs", "a")).toEqual({ id: "a", name: "旧设计" });
  expect(await read(next, "designs", "b")).toEqual({ id: "b", name: "新名称" });
  expect(Array.from((await read(next, "progress", "a")) as Uint8Array)).toEqual(
    [1, 0, 1],
  );
  expect(await read(old, "designs", "a")).toEqual({ id: "a", name: "旧设计" });
  await write(next, "designs", { id: "a", name: "迁移后修改" });
  await migrateLegacyDatabase(next);
  expect(await read(next, "designs", "a")).toEqual({
    id: "a",
    name: "迁移后修改",
  });
  old.close();
  next.close();
});
it("retries preference migration after denied writes without removing old preferences", () => {
  localStorage.setItem("doupu-theme", "light");
  localStorage.setItem("doupu-progress", "old");
  localStorage.setItem("beadhue-progress", "new");
  const put = vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementationOnce(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
  migrateBrowserPreferences();
  expect(localStorage.getItem("doupu-theme")).toBe("light");
  put.mockRestore();
  migrateBrowserPreferences();
  expect(localStorage.getItem("beadhue-theme")).toBe("light");
  expect(localStorage.getItem("beadhue-progress")).toBe("new");
  expect(localStorage.getItem("doupu-progress")).toBe("old");
});
