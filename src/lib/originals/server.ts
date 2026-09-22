import { lockOriginalReferences } from "./lock";
import { persistOriginalAsset } from "./assets";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { AnyDatabase } from "@/../db/client";
import {
  communityOriginals,
  designs,
  originalAssets,
  originalGarbage,
} from "@/../db/schema";
import { lockActiveAccount } from "@/lib/auth/writeAccess";
import { AppError } from "@/lib/errors";
import { validateImageFile } from "@/lib/image/validation";
import {
  assertRevisionOriginalUpload,
  deleteObjectIfUnreferenced,
} from "@/lib/community/originals";
import type { Actor } from "@/lib/auth/authorization";
import type { OriginalObjectStore } from "@/lib/community/originalStore";
import type { OriginalReference } from "./geometry";

export async function requireOwnedDesign(
  db: AnyDatabase,
  userId: string,
  id: string,
  revision?: number,
) {
  const [row] = await db
    .select()
    .from(designs)
    .where(
      and(
        eq(designs.id, id),
        eq(designs.userId, userId),
        isNull(designs.deletedAt),
      ),
    );
  if (!row) throw new AppError("NOT_FOUND", "设计不存在");
  if (revision !== undefined && row.revision !== revision)
    throw new AppError("REVISION_CONFLICT", "云端版本已更新");
  return row;
}

/** Called in the same owner-locked transaction as the design revision update. */
export async function assertOriginalBinding(
  db: AnyDatabase,
  userId: string,
  original?: OriginalReference,
) {
  if (!original?.assetId) return;
  await lockOriginalReferences(db);
  const [asset] = await db
    .select()
    .from(originalAssets)
    .where(
      and(
        eq(originalAssets.id, original.assetId),
        eq(originalAssets.userId, userId),
        isNull(originalAssets.deletedAt),
      ),
    );
  if (
    !asset ||
    asset.sha256 !== original.sha256 ||
    (original.width !== undefined &&
      asset.width !== null &&
      asset.width !== original.width) ||
    (original.height !== undefined &&
      asset.height !== null &&
      asset.height !== original.height)
  ) {
    throw new AppError("VALIDATION", "原图版本与设计不匹配", "original");
  }
}

export async function storePrivateOriginal(
  db: AnyDatabase,
  store: OriginalObjectStore,
  input: {
    userId: string;
    designId: string;
    revision: number;
    bytes: Uint8Array;
  },
) {
  const validation = validateImageFile({
    bytes: input.bytes,
    name: "original",
  });
  if (!validation.ok)
    throw new AppError(
      "VALIDATION",
      `原图不可用：${validation.code}`,
      "original",
    );
  return db.transaction(async (tx) => {
    await lockActiveAccount(tx, input.userId);
    await requireOwnedDesign(tx, input.userId, input.designId, input.revision);
    return persistOriginalAsset(
      tx,
      store,
      input.userId,
      input.bytes,
      validation.type,
    );
  });
}

export async function readPrivateOriginal(
  db: AnyDatabase,
  store: OriginalObjectStore,
  userId: string,
  designId: string,
) {
  const design = await requireOwnedDesign(db, userId, designId);
  const original = (design.project as { original?: OriginalReference } | null)
    ?.original;
  if (!original?.assetId)
    throw new AppError("NOT_FOUND", "设计尚未保存完整原图");
  await assertOriginalBinding(db, userId, original);
  const [asset] = await db
    .select()
    .from(originalAssets)
    .where(eq(originalAssets.id, original.assetId));
  const object = await store.get(asset.cosKey);
  if (!object) throw new AppError("NOT_FOUND", "原图暂时不可用");
  return { asset, body: object.body };
}

/** Freeze a private asset into a public revision without uploading its bytes again. */
export async function attachPrivateOriginalToRevision(
  db: AnyDatabase,
  input: { actor: Actor; revisionId: string; assetId: string },
) {
  return db.transaction(async (tx) => {
    await lockActiveAccount(tx, input.actor.userId);
    const revision = await assertRevisionOriginalUpload(
      tx,
      input.actor,
      input.revisionId,
    );
    await lockOriginalReferences(tx);
    const [asset] = await tx
      .select()
      .from(originalAssets)
      .where(
        and(
          eq(originalAssets.id, input.assetId),
          eq(originalAssets.userId, input.actor.userId),
          isNull(originalAssets.deletedAt),
        ),
      );
    if (!asset) throw new AppError("NOT_FOUND", "原图不存在");
    const expected = (
      revision.snapshot as { original?: { sha256: string } } | null
    )?.original?.sha256;
    if (expected && expected !== asset.sha256)
      throw new AppError(
        "VALIDATION",
        "原图与当前公开修订不匹配，请先更新图纸",
        "original",
      );
    const values = {
      workId: revision.workId,
      cosKey: asset.cosKey,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      sha256: asset.sha256,
      width: asset.width,
      height: asset.height,
      uploadedByUserId: input.actor.userId,
      deletedAt: null,
      blockedAt: null,
      purgedAt: null,
    };
    const [previous] = await tx
      .select({ cosKey: communityOriginals.cosKey })
      .from(communityOriginals)
      .where(eq(communityOriginals.revisionId, revision.id));
    if (previous && previous.cosKey !== asset.cosKey)
      await tx
        .insert(originalGarbage)
        .values({ cosKey: previous.cosKey })
        .onConflictDoNothing();
    await tx
      .insert(communityOriginals)
      .values({ revisionId: revision.id, ...values })
      .onConflictDoUpdate({
        target: communityOriginals.revisionId,
        set: values,
      });
    return { revisionId: revision.id, ...values };
  });
}

/** Deferred GC: release is transactional; object deletion never precedes a design commit. */
export async function cleanupPrivateOriginals(
  db: AnyDatabase,
  store: OriginalObjectStore,
  now = new Date(),
) {
  const cutoff = new Date(now.getTime() - 24 * 3600_000);
  const candidates = await db
    .select({ id: originalAssets.id })
    .from(originalAssets)
    .where(
      and(
        or(
          lt(originalAssets.deletedAt, cutoff),
          and(
            isNull(originalAssets.deletedAt),
            lt(originalAssets.createdAt, cutoff),
          ),
        ),
        sql`not exists (select 1 from ${designs} where ${designs.deletedAt} is null and ${designs.project}->'original'->>'assetId' = ${originalAssets.id}::text) and not exists (select 1 from ${communityOriginals} where ${communityOriginals.deletedAt} is null and ${communityOriginals.cosKey} = ${originalAssets.cosKey})`,
      ),
    )
    .limit(200);
  let removed = 0;
  for (const candidate of candidates) {
    try {
      await db.transaction(async (tx) => {
        await lockOriginalReferences(tx);
        const [asset] = await tx
          .select()
          .from(originalAssets)
          .where(eq(originalAssets.id, candidate.id));
        if (!asset || (asset.deletedAt ?? asset.createdAt) > cutoff) return;
        const [bound] = await tx
          .select({ id: designs.id })
          .from(designs)
          .where(
            and(
              isNull(designs.deletedAt),
              sql`${designs.project}->'original'->>'assetId' = ${asset.id}`,
            ),
          )
          .limit(1);
        if (bound) return;
        const [publicUse] = await tx
          .select({ id: communityOriginals.id })
          .from(communityOriginals)
          .where(
            and(
              eq(communityOriginals.cosKey, asset.cosKey),
              isNull(communityOriginals.deletedAt),
            ),
          )
          .limit(1);
        const [otherOwner] = await tx
          .select({ id: originalAssets.id })
          .from(originalAssets)
          .where(
            and(
              eq(originalAssets.cosKey, asset.cosKey),
              sql`${originalAssets.id} <> ${asset.id}`,
            ),
          )
          .limit(1);
        if (!publicUse && !otherOwner) await store.delete(asset.cosKey);
        await tx.delete(originalAssets).where(eq(originalAssets.id, asset.id));
        removed++;
      });
    } catch {
      /* Failed deletion retains the durable row for the next sweep. */
    }
  }
  for (const garbage of await db.select().from(originalGarbage).limit(200)) {
    try {
      await deleteObjectIfUnreferenced(db, store, garbage.cosKey);
      await db
        .delete(originalGarbage)
        .where(eq(originalGarbage.cosKey, garbage.cosKey));
    } catch {
      /* Keep failed deletions discoverable for retry. */
    }
  }
  return removed;
}

/** Caller holds the owner's write lock and has removed the design association. */
export async function releasePrivateOriginal(
  tx: AnyDatabase,
  userId: string,
  assetId: string,
) {
  await lockOriginalReferences(tx);
  const [bound] = await tx
    .select({ id: designs.id })
    .from(designs)
    .where(
      and(
        isNull(designs.deletedAt),
        sql`${designs.project}->'original'->>'assetId' = ${assetId}`,
      ),
    )
    .limit(1);
  if (bound) return;
  await tx
    .update(originalAssets)
    .set({ deletedAt: new Date() })
    .where(
      and(eq(originalAssets.id, assetId), eq(originalAssets.userId, userId)),
    );
}
