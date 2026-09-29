import { it, expect, vi } from "vitest";
import { cachePreview, clearPreviewCache } from "./preview-cache";
it("bounds original previews and never deletes saved designs or pending original bytes", () => {
  const files = new Map<string, unknown>([
    ["/data/beadhue-guest", {}],
    ["/data/original-pending.bin", new ArrayBuffer(4)],
  ]);
  vi.stubGlobal("wx", {
    env: { USER_DATA_PATH: "/data" },
    getFileSystemManager: () => ({
      readdirSync: () => [...files.keys()].map((p) => p.slice(6)),
      unlinkSync: (p: string) => files.delete(p),
      writeFileSync: (p: string, v: unknown) => files.set(p, v),
    }),
  });
  const first = cachePreview(
    "user-a",
    "/api/designs/a/original",
    new ArrayBuffer(4),
  );
  expect(
    cachePreview("user-a", "/api/designs/a/original", new ArrayBuffer(8)),
  ).toBe(first);
  for (let i = 0; i < 20; i++)
    cachePreview("user-a", `/api/designs/${i}/original`, new ArrayBuffer(4));
  expect([...files.keys()].filter((n) => n.includes("preview-"))).toHaveLength(
    1,
  );
  clearPreviewCache();
  expect(files.size).toBe(2);
  vi.unstubAllGlobals();
});
