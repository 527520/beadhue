// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { webcrypto } from "node:crypto";

const storage = vi.hoisted(() => ({
  record: null as null | {
    id: string;
    projectJson: string;
    revision: number;
    syncState: string;
  },
  put: vi.fn(),
}));
vi.mock("@/lib/storage", () => ({
  openIndexedDb: async () => ({
    getAll: async () => (storage.record ? [storage.record] : []),
    put: async (record: typeof storage.record) => {
      storage.record = record;
      storage.put(record);
    },
  }),
  parseStoredProject: (json: string) => JSON.parse(json),
}));
vi.mock("@/lib/sync/queue", () => ({
  withDesignStorageLock: async (fn: () => Promise<void>) => fn(),
  enqueueDesignSync: async () => {
    if (storage.record) storage.record.syncState = "synced";
  },
}));
vi.mock("@/lib/sync/api", () => ({ createBeadhueApi: () => ({}) }));
let client: typeof import("./client");
const email = "queue@example.test";
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const json = (value: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(value), { status, headers });
beforeEach(async () => {
  vi.resetModules();
  storage.record = null;
  storage.put.mockClear();
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("crypto", webcrypto);
  client = await import("./client");
});
afterEach(async () => {
  await client.resumeOriginalUploads();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function image(n: number) {
  return client.cacheOriginal(new Uint8Array([n]), "png", `${n}.png`);
}
function fetcher(put: (url: string) => Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/auth/me") return json({ email, state: "verified" });
    if (url.startsWith("/api/originals?")) return json({ asset: null });
    if (init?.method === "PUT") return put(url);
    throw new Error(`Unexpected ${url}`);
  });
}
it("cancels a queued task while another upload is in flight, without reading stale state", async () => {
  const gate = deferred<Response>();
  const put = vi.fn(() => gate.promise);
  vi.stubGlobal("fetch", fetcher(put));
  const a = await image(1),
    b = await image(2);
  const first = client.enqueueOriginalUpload({
    email,
    url: "/revision/a",
    sha256: a.sha256,
  });
  await vi.waitFor(() => expect(put).toHaveBeenCalledOnce());
  const second = client
    .enqueueOriginalUpload({ email, url: "/revision/b", sha256: b.sha256 })
    .catch((e) => e.message);
  await vi.waitFor(async () =>
    expect((await client.originalTasks()).length).toBe(2),
  );
  const task = (await client.originalTasks()).find(
    (t) => t.url === "/revision/b",
  )!;
  await client.cancelOriginalTask(task.key);
  gate.resolve(json({ revisionId: "a" }));
  await first;
  expect(await second).toContain("已取消");
  await client.resumeOriginalUploads();
  expect(put).toHaveBeenCalledOnce();
});
it("persists account cooldown across cancellation and newly enqueued images", async () => {
  const put = vi.fn(
    async () =>
      new Response(null, { status: 429, headers: { "retry-after": "120" } }),
  );
  vi.stubGlobal("fetch", fetcher(put));
  const a = await image(1),
    b = await image(2);
  void client
    .enqueueOriginalUpload({ email, url: "/revision/a", sha256: a.sha256 })
    .catch(() => {});
  await vi.waitFor(async () =>
    expect((await client.originalTasks())[0]?.status).toBe("waiting"),
  );
  await client.cancelOriginalTask((await client.originalTasks())[0].key);
  void client
    .enqueueOriginalUpload({ email, url: "/revision/b", sha256: b.sha256 })
    .catch(() => {});
  await vi.waitFor(async () =>
    expect(
      (await client.originalTasks()).find((t) => t.url.endsWith("/b"))?.status,
    ).toBe("waiting"),
  );
  expect(put).toHaveBeenCalledOnce();
  await client.cancelOriginalTask(
    (await client.originalTasks()).find((t) => t.url.endsWith("/b"))!.key,
  );
});
it("settles callers when another tab has completed the durable task before this tab obtains its lock", async () => {
  const gate = deferred<void>();
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request: async (_name: string, run: () => Promise<void>) => {
        await gate.promise;
        return run();
      },
    },
  });
  vi.stubGlobal(
    "fetch",
    fetcher(async () => {
      throw new Error("must not reupload");
    }),
  );
  const a = await image(3);
  const pending = client.enqueueOriginalUpload({
    email,
    url: "/revision/a",
    sha256: a.sha256,
  });
  await vi.waitFor(async () =>
    expect((await client.originalTasks()).length).toBe(1),
  );
  const task = (await client.originalTasks())[0];
  await new Promise<void>((resolve, reject) => {
    const r = indexedDB.open("beadhue-originals", 2);
    r.onsuccess = () => {
      const db = r.result,
        tx = db.transaction("tasks", "readwrite");
      tx.objectStore("tasks").put({
        ...task,
        status: "done",
        result: { revisionId: "a" },
      });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
  gate.resolve();
  expect(await pending).toEqual({ revisionId: "a" });
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: undefined,
  });
});

it("caches the full original on HTTP LAN without crypto.subtle", async () => {
  vi.stubGlobal("crypto", {});
  const original = await client.cacheOriginal(
    new TextEncoder().encode("abc"),
    "png",
    "lan.png",
  );
  expect(original.sha256).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  expect(
    Array.from(
      new Uint8Array((await client.getCachedOriginal(original.sha256))!.bytes),
    ),
  ).toEqual([97, 98, 99]);
});
it("revalidates and rebinds a completed private upload after A → B → A, without sending bytes again", async () => {
  const a = await image(1);
  let asset: Record<string, unknown> | null = null;
  storage.record = {
    id: "design-a",
    revision: 1,
    syncState: "synced",
    projectJson: JSON.stringify({
      original: { sha256: a.sha256, width: 1, height: 1 },
    }),
  };
  const put = vi.fn(async () => {
    asset = { assetId: "asset-a" };
    return json(asset);
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/auth/me") return json({ email });
      if (String(input).startsWith("/api/originals?")) return json({ asset });
      if (init?.method === "PUT") return put();
      throw new Error("Unexpected request");
    }),
  );
  const input = {
    email,
    url: "/api/designs/design-a/original",
    sha256: a.sha256,
    designId: "design-a",
  };
  await client.enqueueOriginalUpload(input);
  storage.record.projectJson = JSON.stringify({
    original: { sha256: a.sha256, width: 1, height: 1 },
  });
  await client.enqueueOriginalUpload(input);
  expect(JSON.parse(storage.record.projectJson).original.assetId).toBe(
    "asset-a",
  );
  expect(put).toHaveBeenCalledOnce();
  // If the old object was collected, the same task must upload again instead of reviving a stale ID.
  asset = null;
  storage.record.projectJson = JSON.stringify({
    original: { sha256: a.sha256, width: 1, height: 1, assetId: "asset-a" },
  });
  await client.enqueueOriginalUpload(input);
  expect(put).toHaveBeenCalledTimes(2);
});
it("does not overwrite cancellation while applying a 429 cooldown to other queued tasks", async () => {
  const gate = deferred<Response>();
  const put = vi.fn(() => gate.promise);
  vi.stubGlobal("fetch", fetcher(put));
  const a = await image(1),
    b = await image(2);
  void client
    .enqueueOriginalUpload({ email, url: "/revision/a", sha256: a.sha256 })
    .catch(() => {});
  await vi.waitFor(() => expect(put).toHaveBeenCalledOnce());
  const second = client
    .enqueueOriginalUpload({ email, url: "/revision/b", sha256: b.sha256 })
    .catch((e) => e.message);
  await vi.waitFor(async () =>
    expect(await client.originalTasks()).toHaveLength(2),
  );
  const key = (await client.originalTasks()).find(
    (t) => t.url === "/revision/b",
  )!.key;
  window.addEventListener(
    client.ORIGINAL_STATUS_EVENT,
    () => {
      void client.cancelOriginalTask(key);
    },
    { once: true },
  );
  gate.resolve(
    new Response(null, { status: 429, headers: { "retry-after": "120" } }),
  );
  expect(await second).toContain("已取消");
  await client.resumeOriginalUploads();
  expect(
    (await client.originalTasks()).find((t) => t.key === key)?.status,
  ).toBe("cancelled");
  expect(put).toHaveBeenCalledOnce();
  await client.cancelOriginalTask(
    (await client.originalTasks()).find((t) => t.url === "/revision/a")!.key,
  );
});
