import { createSyncClient, type SyncClient } from "@beadhue/core/sync";
import {
  parseStoredProject,
  type StorageAdapter,
  type GenerationSourceWrite,
} from "@beadhue/core/storage";
import {
  type ProjectFile,
  DEFAULT_GENERATION_PARAMS,
} from "@beadhue/core/types";
import { ENGINE_VERSION } from "@beadhue/core/limits";
import { createBlankPattern } from "@beadhue/core/kit";
import { wxFiles } from "./files";
import { openFileStorage } from "./storage";
import { cloudApi, session } from "./network";

const stores = new Map<string, StorageAdapter>();
export function namespace() {
  const s = session();
  return s?.emailVerified ? `user-${s.userId}` : "guest";
}
export function storageFor(space: string): StorageAdapter {
  let storage = stores.get(space);
  if (!storage) {
    storage = openFileStorage(wxFiles(space));
    stores.set(space, storage);
  }
  return storage;
}
export function storage() {
  return storageFor(namespace());
}
export function newId(): string {
  // IDs are not authentication credentials. Server sessions use cryptographic randomness.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === "x" ? r : (r & 3) | 8).toString(16);
  });
}
const syncs = new Map<
  string,
  { client: SyncClient; running?: ReturnType<SyncClient["sync"]> }
>();
export function syncClient() {
  const s = session();
  if (!s?.emailVerified) throw new Error("请登录并验证邮箱后开启云同步");
  let slot = syncs.get(s.token);
  if (!slot) {
    slot = {
      client: createSyncClient(
        storageFor(`user-${s.userId}`),
        cloudApi(s.token),
        { newId },
      ),
    };
    syncs.set(s.token, slot);
  }
  return slot;
}
export async function synchronize() {
  const slot = syncClient();
  if (!slot.running)
    slot.running = slot.client.sync().finally(() => {
      slot.running = undefined;
    });
  return slot.running;
}
export async function loadDesign(id: string) {
  const store = storage();
  const record = (await store.getAll()).find((x) => x.id === id);
  const project = record && parseStoredProject(record.projectJson);
  if (!record || !project) throw new Error("设计不存在或已损坏");
  return { record, project, store };
}
export async function saveDesign(
  id: string,
  project: ProjectFile,
  store = storage(),
  source?: GenerationSourceWrite,
) {
  const old = (await store.getAll()).find((x) => x.id === id);
  await store.put(
    {
      id,
      name: project.name,
      projectJson: JSON.stringify(project),
      thumbnail: old?.thumbnail ?? null,
      updatedAt: project.updatedAt,
      revision: old?.revision ?? 0,
      syncState: "dirty",
    },
    source,
  );
}
export function blankProject(
  name = "未命名设计",
  width = 29,
  height = 29,
): ProjectFile {
  const now = new Date().toISOString();
  return {
    format: "beadhue-project",
    version: 3,
    engineVersion: ENGINE_VERSION,
    boardProfile: "5mm-29",
    name,
    createdAt: now,
    updatedAt: now,
    paletteSelection: {
      palette: { kind: "builtin", brand: "MARD" },
      kitTier: 0,
    },
    params: { ...DEFAULT_GENERATION_PARAMS },
    pattern: createBlankPattern(width, height),
  };
}
export async function migrateGuestDesigns() {
  const target = storage();
  if (namespace() === "guest") throw new Error("请先验证邮箱");
  const guest = storageFor("guest");
  // Copy first and never delete the guest originals. New IDs prevent accidental remote merges.
  for (const record of await guest.getAll()) {
    const project = parseStoredProject(record.projectJson);
    if (!project) continue;
    const copiedKey = `guest-copy:${record.id}:${record.updatedAt}`;
    if (await target.getMeta(copiedKey)) continue;
    const id = newId();
    const source = await guest.getGenerationSource(record.id);
    if (project.original) {
      const name = `original-${project.original.sha256}.bin`;
      const guestFiles = wxFiles("guest");
      if (guestFiles.list().includes(name))
        wxFiles(namespace()).write(name, guestFiles.bytes(name));
    }
    await saveDesign(
      id,
      project,
      target,
      source ? { mode: "replace", source } : undefined,
    );
    const progress = await guest.getStitchProgress(record.id);
    if (progress) await target.putStitchProgress(id, progress);
    await target.setMeta(copiedKey, id);
  }
}
