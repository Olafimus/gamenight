import type { LeaderboardEntryDto } from "@gamenight/shared";

export type SortKey = "elo" | "winRate" | "placementScore" | "avgPoints" | "hitRate" | "matchCount";
export type SortDir = "asc" | "desc";

/**
 * Sorts by the given metric. Provisional entries ("vorläufig") always stay behind ranked ones;
 * ties: more matches, then name. Does not mutate.
 */
export function sortEntries(entries: LeaderboardEntryDto[], key: SortKey, dir: SortDir = "desc"): LeaderboardEntryDto[] {
  const sign = dir === "desc" ? -1 : 1;
  return [...entries].sort(
    (a, b) =>
      Number(a.provisional) - Number(b.provisional) ||
      sign * (a[key] - b[key]) ||
      b.matchCount - a.matchCount ||
      a.name.localeCompare(b.name, "de"),
  );
}

/** Case-insensitive substring filter on the name. */
export function filterLeaderboard(entries: LeaderboardEntryDto[], search: string): LeaderboardEntryDto[] {
  const s = search.trim().toLowerCase();
  return s ? entries.filter((e) => e.name.toLowerCase().includes(s)) : entries;
}

export const fmt2 = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmt1 = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const fmtPercent = (n: number) => `${(n * 100).toLocaleString("de-DE", { maximumFractionDigits: 0 })} %`;
export const fmtElo = (n: number) => Math.round(n).toLocaleString("de-DE");
/** "+12" / "−5" / "±0" */
export function fmtSigned(n: number): string {
  const r = Math.round(n);
  return r > 0 ? `+${r}` : r < 0 ? `−${Math.abs(r)}` : "±0";
}
/** Difference in percentage points, e.g. "+17 pp". */
export function fmtPp(actual: number, expected: number): string {
  const r = Math.round((actual - expected) * 100);
  return `${r > 0 ? "+" : r < 0 ? "−" : "±"}${Math.abs(r)} pp`;
}

