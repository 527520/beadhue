import { beforeEach, it, expect, vi } from "vitest";
const fake = vi.hoisted(() => ({
  meta: new Map<string, string>(),
  records: [] as any[],
  request: vi.fn(),
  files: vi.fn(),
}));
vi.mock("./designs", () => ({
  storageFor: () => ({
    getAll: async () => fake.records,
    getMeta: async (k: string) => fake.meta.get(k) ?? null,
    setMeta: async (k: string, v: string) => {
      fake.meta.set(k, v);
    },
    put: async (r: any) => {
      fake.records = [r];
    },
  }),
}));
vi.mock("./files", () => ({ wxFiles: () => ({ bytes: fake.files }) }));
vi.mock("./network", () => ({
  session: () => ({ emailVerified: true, userId: "owner", token: "captured" }),
  request: fake.request,
}));
import { synchronizeOriginals } from "./originals";
const sha = "a".repeat(64),
  id = "12345678-1234-4234-8234-123456789012";
const project = {
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
  original: { sha256: sha, width: 1, height: 1, geometry: [1, 0, 0, 1, 0, 0] },
};
beforeEach(() => {
  fake.meta.clear();
  fake.request.mockReset();
  fake.files.mockReset().mockReturnValue(new ArrayBuffer(4));
  fake.records = [
    {
      id,
      name: "test",
      projectJson: JSON.stringify(project),
      revision: 1,
      syncState: "synced",
      updatedAt: project.updatedAt,
      thumbnail: null,
    },
  ];
});
it.each([null, `done:${sha}`, "deleted"])(
  "does not resurrect a cloud-deleted or remote original (%s)",
  async (intent) => {
    if (intent) fake.meta.set(`original-upload:${id}`, intent);
    expect(await synchronizeOriginals()).toEqual([]);
    expect(fake.request).not.toHaveBeenCalled();
  },
);
it("uploads only explicit intent, acknowledges it, and retains retry on failure", async () => {
  fake.meta.set(`original-upload:${id}`, sha);
  fake.request.mockRejectedValueOnce(new Error("offline"));
  expect(await synchronizeOriginals()).toEqual(["test：offline"]);
  expect(fake.meta.get(`original-upload:${id}`)).toBe(sha);
  fake.request
    .mockResolvedValueOnce({
      assetId: "22345678-1234-4234-8234-123456789012",
      sha256: sha,
    })
    .mockResolvedValueOnce({ revision: 2, updatedAt: project.updatedAt });
  expect(await synchronizeOriginals()).toEqual([]);
  expect(fake.meta.get(`original-upload:${id}`)).toBe(`done:${sha}`);
  // A later Web deletion keeps SHA but drops assetId. The acknowledgement must suppress re-upload.
  fake.records[0].projectJson = JSON.stringify(project);
  fake.request.mockClear();
  await synchronizeOriginals();
  expect(fake.request).not.toHaveBeenCalled();
});
