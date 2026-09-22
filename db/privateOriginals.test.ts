import { beforeEach, describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestClient, type TestDatabase } from "./testClient";
import { designs, originalAssets, originalGarbage, users } from "./schema";
import { TEST_PNG } from "./testOriginals";
import { createMemoryOriginalStore } from "@/lib/community/originalStore";
import {
  assertOriginalBinding,
  readPrivateOriginal,
  storePrivateOriginal,
  releasePrivateOriginal,
  cleanupPrivateOriginals,
} from "@/lib/originals/server";
import { deleteObjectIfUnreferenced } from "@/lib/community/originals";
import { config } from "@/lib/config";

describe("private original ownership and immutable binding", () => {
  let db: TestDatabase;
  let userId: string;
  let id: string;
  let store: ReturnType<typeof createMemoryOriginalStore>;
  beforeEach(async () => {
    db = await createTestClient();
    store = createMemoryOriginalStore();
    const [user] = await db
      .insert(users)
      .values({ email: "original@example.test", emailVerifiedAt: new Date() })
      .returning();
    userId = user.id;
    id = crypto.randomUUID();
    await db
      .insert(designs)
      .values({ id, userId, name: "private", project: {} });
  }, 30_000);
  const upload = () =>
    storePrivateOriginal(db, store, {
      userId,
      designId: id,
      revision: 1,
      bytes: new Uint8Array(TEST_PNG),
    });
  it("deduplicates bytes per owner and only reads a bound asset", async () => {
    const put = vi.spyOn(store, "put");
    const first = await upload();
    const second = await upload();
    expect(first.id).toBe(second.id);
    expect(put).toHaveBeenCalledTimes(1);
    await expect(
      readPrivateOriginal(db, store, userId, id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const original = {
      assetId: first.id,
      sha256: first.sha256,
      width: 1,
      height: 1,
      geometry: [1, 0, 0, 1, 0, 0],
    };
    await db
      .update(designs)
      .set({ project: { original } })
      .where(eq(designs.id, id));
    expect(
      Buffer.from(
        (await readPrivateOriginal(db, store, userId, id)).body,
      ).equals(TEST_PNG),
    ).toBe(true);
    await expect(
      assertOriginalBinding(
        db,
        "00000000-0000-0000-0000-000000000000",
        original as Parameters<typeof assertOriginalBinding>[2],
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
  it("retains the old object key when reviving a deleted asset under a new key", async () => {
    const asset = await upload();
    const oldKey = "private-originals/previous-owner/shared.png";
    await store.put(oldKey, new Uint8Array(TEST_PNG), "image/png");
    await db
      .update(originalAssets)
      .set({ cosKey: oldKey, deletedAt: new Date() })
      .where(eq(originalAssets.id, asset.id));
    const revived = await upload();
    expect(revived.id).toBe(asset.id);
    expect(await db.select().from(originalGarbage)).toMatchObject([
      { cosKey: oldKey },
    ]);
    await cleanupPrivateOriginals(db, store);
    expect(await store.get(oldKey)).toBeNull();
    expect(await store.get(revived.cosKey)).not.toBeNull();
  });
  it("rejects a stale revision before object writes", async () => {
    const put = vi.spyOn(store, "put");
    await db.update(designs).set({ revision: 2 }).where(eq(designs.id, id));
    await expect(upload()).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    expect(put).not.toHaveBeenCalled();
  });
  it("enforces independent quota before writing COS", async () => {
    const put = vi.spyOn(store, "put");
    await db.insert(originalAssets).values({
      userId,
      sha256: "a".repeat(64),
      cosKey: "reserved",
      mimeType: "image/png",
      byteSize: config.security.originalQuotaBytes - 1,
    });
    await expect(upload()).rejects.toMatchObject({ field: "originalQuota" });
    expect(put).not.toHaveBeenCalled();
  });
  it("public cleanup cannot remove a private original, and deleting one of two designs preserves it", async () => {
    const asset = await upload();
    const other = crypto.randomUUID();
    const original = {
      assetId: asset.id,
      sha256: asset.sha256,
      width: 1,
      height: 1,
    };
    await db
      .update(designs)
      .set({ project: { original } })
      .where(eq(designs.id, id));
    await db
      .insert(designs)
      .values({ id: other, userId, name: "copy", project: { original } });
    expect(await deleteObjectIfUnreferenced(db, store, asset.cosKey)).toBe(
      false,
    );
    await db
      .update(designs)
      .set({ deletedAt: new Date(), project: null, payloadBytes: 0 })
      .where(eq(designs.id, id));
    await releasePrivateOriginal(db, userId, asset.id);
    expect(await store.get(asset.cosKey)).not.toBeNull();
    await db
      .update(designs)
      .set({ deletedAt: new Date(), project: null, payloadBytes: 0 })
      .where(eq(designs.id, other));
    await releasePrivateOriginal(db, userId, asset.id);
    expect(await store.get(asset.cosKey)).not.toBeNull();
    await cleanupPrivateOriginals(
      db,
      store,
      new Date(Date.now() + 25 * 3600_000),
    );
    expect(await store.get(asset.cosKey)).toBeNull();
    expect(await db.select().from(originalAssets)).toHaveLength(0);
  });
});
