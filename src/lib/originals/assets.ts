import { createHash } from "node:crypto";
import { and, eq, isNull, sum } from "drizzle-orm";
import type { AnyDatabase } from "@/../db/client";
import { originalAssets, originalGarbage } from "@/../db/schema";
import { config } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { readDisplayDimensions } from "@/lib/image/dimensions";
import type { ImageType } from "@/lib/image/sniff";
import type { OriginalObjectStore } from "@/lib/community/originalStore";
import { lockOriginalReferences } from "./lock";

/** Caller holds the active owner lock in this transaction. All binary entry points reuse this asset. */
export async function persistOriginalAsset(
  tx: AnyDatabase,
  store: OriginalObjectStore,
  userId: string,
  bytes: Uint8Array,
  type: ImageType,
) {
  await lockOriginalReferences(tx);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const [existing] = await tx
    .select()
    .from(originalAssets)
    .where(
      and(eq(originalAssets.userId, userId), eq(originalAssets.sha256, sha256)),
    );
  if (existing && !existing.deletedAt) return existing;
  const [usage] = await tx
    .select({ bytes: sum(originalAssets.byteSize) })
    .from(originalAssets)
    .where(
      and(eq(originalAssets.userId, userId), isNull(originalAssets.deletedAt)),
    );
  if (
    Number(usage.bytes ?? 0) + bytes.length >
    config.security.originalQuotaBytes
  )
    throw new AppError(
      "CONFLICT",
      "原图空间不足，请清理后重试",
      "originalQuota",
    );
  const dimensions = readDisplayDimensions(bytes, type);
  const mimeType = type === "jpeg" ? "image/jpeg" : `image/${type}`;
  const cosKey = `private-originals/${userId}/${sha256}.${type}`;
  await store.put(cosKey, bytes, mimeType);
  if (existing && existing.cosKey !== cosKey)
    await tx
      .insert(originalGarbage)
      .values({ cosKey: existing.cosKey })
      .onConflictDoNothing();
  const values = {
    userId,
    sha256,
    cosKey,
    mimeType,
    byteSize: bytes.length,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
    deletedAt: null,
    createdAt: new Date(),
  };
  const [asset] = await tx
    .insert(originalAssets)
    .values(values)
    .onConflictDoUpdate({
      target: [originalAssets.userId, originalAssets.sha256],
      set: values,
    })
    .returning();
  return asset;
}
