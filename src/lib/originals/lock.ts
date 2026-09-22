import { sql } from "drizzle-orm";
import type { AnyDatabase } from "@/../db/client";

/** Acquire after account/work locks. All reference creation and GC use this lock. */
export async function lockOriginalReferences(tx: AnyDatabase): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended('beadhue:original-references', 0))`,
  );
}
