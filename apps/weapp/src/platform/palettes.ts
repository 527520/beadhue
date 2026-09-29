import type { CustomPaletteColor } from "@beadhue/core/types";
import { customPaletteSchema } from "@beadhue/core/schemas";
import type { StorageAdapter } from "@beadhue/core/storage";
import { newId, storage, storageFor } from "./designs";
import { request, session } from "./network";
export interface PaletteRecord {
  id: string;
  name: string;
  colors: CustomPaletteColor[];
  updatedAt: string;
  revision: number;
  dirty: boolean;
  deleted?: boolean;
}
const key = "custom-palettes";
export async function readPalettes(
  store = storage(),
): Promise<PaletteRecord[]> {
  return JSON.parse((await store.getMeta(key)) ?? "[]");
}
export async function savePalette(
  value: Omit<PaletteRecord, "id" | "updatedAt" | "revision" | "dirty"> & {
    id?: string;
  },
) {
  const parsed = customPaletteSchema.parse(value);
  const store = storage();
  const rows = await readPalettes(store);
  const old = rows.find((r) => r.id === value.id);
  const next: PaletteRecord = {
    ...parsed,
    id: value.id ?? newId(),
    updatedAt: new Date().toISOString(),
    revision: old?.revision ?? 0,
    dirty: true,
  };
  await store.setMeta(
    key,
    JSON.stringify([...rows.filter((r) => r.id !== next.id), next]),
  );
}
export async function deletePalette(id: string) {
  const store = storage();
  const rows = await readPalettes(store);
  await store.setMeta(
    key,
    JSON.stringify(
      rows.map((r) => (r.id === id ? { ...r, deleted: true, dirty: true } : r)),
    ),
  );
}
let running: Promise<void> | null = null;
export function syncPalettes() {
  if (running) return running;
  running = doSync().finally(() => {
    running = null;
  });
  return running;
}
async function doSync() {
  const s = session();
  if (!s?.emailVerified) throw new Error("请登录并验证邮箱");
  const store: StorageAdapter = storageFor(`user-${s.userId}`);
  const remote: PaletteRecord[] = [];
  let cursor: string | null = null;
  const seen = new Set<string>();
  do {
    const page: {
      items: Array<Omit<PaletteRecord, "dirty">>;
      nextCursor: string | null;
    } = await request<{
      items: Array<Omit<PaletteRecord, "dirty">>;
      nextCursor: string | null;
    }>(
      `/api/palettes${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      { token: s.token },
    );
    for (const r of page.items) remote.push({ ...r, dirty: false });
    cursor = page.nextCursor;
    if (cursor) {
      if (seen.has(cursor)) throw new Error("云端分页异常");
      seen.add(cursor);
    }
  } while (cursor);
  for (const cloud of remote) {
    const current = await readPalettes(store),
      local = current.find((p) => p.id === cloud.id);
    if (!local) {
      if (!cloud.deleted)
        await store.setMeta(key, JSON.stringify([...current, cloud]));
      continue;
    }
    if (cloud.revision <= local.revision) continue;
    const conflicts =
      local.dirty && !local.deleted
        ? [
            {
              ...local,
              id: newId(),
              name: local.name.slice(0, 80) + "（冲突副本）",
              revision: 0,
              dirty: true,
            },
          ]
        : [];
    await store.setMeta(
      key,
      JSON.stringify([
        ...current.filter((p) => p.id !== cloud.id),
        ...conflicts,
        ...(cloud.deleted ? [] : [cloud]),
      ]),
    );
  }
  for (const local of await readPalettes(store)) {
    if (!local.dirty) continue;
    if (local.deleted && !local.revision) {
      await store.setMeta(
        key,
        JSON.stringify(
          (await readPalettes(store)).filter((r) => r.id !== local.id),
        ),
      );
      continue;
    }
    const response = await request<{ revision: number; updatedAt: string }>(
      `/api/palettes/${local.id}`,
      {
        method: local.deleted ? "DELETE" : "PUT",
        token: s.token,
        data: local.deleted
          ? { baseRevision: local.revision }
          : {
              name: local.name,
              colors: local.colors,
              baseRevision: local.revision,
            },
      },
    );
    const current = await readPalettes(store);
    const latest = current.find((r) => r.id === local.id);
    if (JSON.stringify(latest) !== JSON.stringify(local)) continue;
    await store.setMeta(
      key,
      JSON.stringify(
        current.flatMap((p) =>
          p.id === local.id
            ? local.deleted
              ? []
              : [{ ...p, ...response, dirty: false }]
            : [p],
        ),
      ),
    );
  }
}
