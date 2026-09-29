import { describe, it, expect } from "vitest";
import { openFileStorage } from "./storage";
import type { FilePort } from "./files";
import type { ProjectFile } from "@beadhue/core/types";
import { createStitchProgress } from "@beadhue/core/stitch";
const project: ProjectFile = {
  format: "beadhue-project",
  version: 3,
  engineVersion: "2.0.0",
  boardProfile: "5mm-29",
  name: "test",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  paletteSelection: { palette: { kind: "builtin", brand: "MARD" }, kitTier: 0 },
  params: {
    targetWidth: 20,
    targetColorCount: 20,
    dithering: false,
    mode: "dominant",
    brightness: 0,
    contrast: 0,
    backgroundRemoval: false,
    bgTolerance: 8,
  },
  pattern: {
    width: 1,
    height: 1,
    cells: [{ hex: null, code: null, transparent: true }],
  },
};
const id = "12345678-1234-4234-8234-123456789012";
const record = {
  id,
  name: "test",
  projectJson: JSON.stringify(project),
  thumbnail: null,
  updatedAt: project.updatedAt,
  revision: 0,
  syncState: "dirty" as const,
};
function memory() {
  const map = new Map<string, string | ArrayBuffer>();
  let failure = "";
  const files: FilePort = {
    read: (p) => {
      const v = map.get(p);
      if (typeof v !== "string") throw Error("missing");
      return v;
    },
    bytes: (p) => {
      const v = map.get(p);
      if (!(v instanceof ArrayBuffer)) throw Error("missing");
      return v.slice(0);
    },
    write: (p, v) => {
      if (failure === "write") throw Error("quota");
      map.set(p, v);
    },
    rename: (a, b) => {
      if (failure === "commit" && b.startsWith("commit-")) throw Error("crash");
      if (!map.has(a)) throw Error("missing");
      map.set(b, map.get(a)!);
      map.delete(a);
    },
    remove: (p) => {
      map.delete(p);
    },
    list: () => [...map.keys()],
  };
  return {
    files,
    map,
    fail: (s: string) => {
      failure = s;
    },
  };
}
describe("file storage crash recovery", () => {
  it("round trips project, pixels and device-only progress across restart", async () => {
    const m = memory();
    const store = openFileStorage(m.files);
    await store.put(record, {
      mode: "replace",
      source: {
        version: 1,
        width: 1,
        height: 1,
        rgba: new Uint8Array([1, 2, 3, 255]).buffer,
      },
    });
    const progress = createStitchProgress(1, 1);
    progress.done[0] = 1;
    await store.putStitchProgress(id, progress);
    const recovered = openFileStorage(m.files);
    expect(await recovered.getAll()).toEqual([record]);
    expect(
      Array.from(
        new Uint8Array((await recovered.getGenerationSource(id))!.rgba),
      ),
    ).toEqual([1, 2, 3, 255]);
    expect((await recovered.getStitchProgress(id))?.done[0]).toBe(1);
    expect(
      JSON.parse((await recovered.getAll())[0].projectJson),
    ).not.toHaveProperty("progress");
  });
  it.each(["write", "commit"])(
    "preserves the last design when %s fails",
    async (failure) => {
      const m = memory();
      const s = openFileStorage(m.files);
      await s.put(record);
      m.fail(failure);
      await expect(s.put({ ...record, name: "changed" })).rejects.toThrow(
        "保存失败",
      );
      m.fail("");
      expect((await openFileStorage(m.files).getAll())[0].name).toBe("test");
    },
  );
  it("recovers from a corrupt latest commit and can save again", async () => {
    const m = memory();
    const s = openFileStorage(m.files);
    await s.put(record);
    await s.setMeta("setting", "x");
    m.map.set("commit-2.json", "truncated");
    const recovered = openFileStorage(m.files);
    expect((await recovered.getAll())[0].id).toBe(id);
    await recovered.setMeta("new", "y");
    expect(await openFileStorage(m.files).getMeta("new")).toBe("y");
  });
  it("retains a fully valid predecessor after recovering a missing data file", async () => {
    const m = memory();
    const store = openFileStorage(m.files);
    await store.put(record);
    await store.put({ ...record, name: "lost" });
    const broken = JSON.parse(m.files.read("commit-2.json"));
    m.map.delete(broken.designs[id].record);
    const recovered = openFileStorage(m.files);
    await recovered.setMeta("saved-again", "yes");
    expect(m.map.has("commit-1.json")).toBe(true);
    expect(m.map.has("commit-2.json")).toBe(false);
    m.map.set("commit-3.json", "interrupted");
    expect((await openFileStorage(m.files).getAll())[0].name).toBe("test");
  });
  it("keeps users in different file spaces and never evicts a dirty project", async () => {
    const a = memory(),
      b = memory();
    await openFileStorage(a.files).put(record);
    expect(await openFileStorage(b.files).getAll()).toEqual([]);
    const s = openFileStorage(a.files);
    for (let i = 0; i < 10; i++) await s.setMeta("last", String(i));
    expect((await openFileStorage(a.files).getAll())[0].syncState).toBe(
      "dirty",
    );
  });
  it("deletes progress with its design and clears pixels explicitly", async () => {
    const m = memory(),
      s = openFileStorage(m.files);
    await s.put(record, {
      mode: "replace",
      source: { version: 1, width: 1, height: 1, rgba: new ArrayBuffer(4) },
    });
    await s.putStitchProgress(id, createStitchProgress(1, 1));
    await s.put(record, { mode: "clear" });
    expect(await s.getGenerationSource(id)).toBeNull();
    await s.delete(id);
    const restarted = openFileStorage(m.files);
    expect(await restarted.getAll()).toEqual([]);
    expect(await restarted.getStitchProgress(id)).toBeNull();
  });
});
