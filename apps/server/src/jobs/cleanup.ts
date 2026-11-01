import { and, eq, lt } from "drizzle-orm";
import type { Db } from "../db/client";
import { matches } from "../db/schema";
import type { Hub } from "../sse/hub";

export const CLEANUP_INTERVAL_MS = 30 * 60 * 1000;
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/** Deletes unfinished matches not updated for `maxAgeMs`. Returns deleted ids. */
export async function cleanupStaleMatches(db: Db, now: Date = new Date(), maxAgeMs = STALE_AFTER_MS): Promise<string[]> {
  const cutoff = new Date(now.getTime() - maxAgeMs);
  const rows = await db
    .delete(matches)
    .where(and(eq(matches.finished, false), lt(matches.updatedAt, cutoff)))
    .returning({ id: matches.id });
  return rows.map((r) => r.id);
}

export function startCleanupJob(db: Db, hub?: Hub): NodeJS.Timeout {
  const run = () => {
    cleanupStaleMatches(db)
      .then((ids) => ids.forEach((id) => hub?.publishDeleted(id)))
      .catch((e) => console.error("cleanup failed", e));
  };
  run();
  const t = setInterval(run, CLEANUP_INTERVAL_MS);
  t.unref();
  return t;
}
