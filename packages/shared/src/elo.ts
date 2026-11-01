/**
 * Elo, categories and scope metrics (see docs/spec-stats.md). Pure functions.
 */

export const ELO_START = 1000;
export const ELO_K_BASE = 32;
/** Subjects with fewer matches in the selected scope are "vorläufig". */
export const PROVISIONAL_MATCHES = 3;

export interface StatsCategory {
  id: string;
  label: string;
  /** compact label for phones */
  short: string;
  group: boolean;
  includes: (playerCount: number) => boolean;
}

const COUNT_LABELS: Record<number, [string, string]> = {
  2: ["Duell (2 Spieler)", "Duell"],
  3: ["Dreierrunde", "Dreier"],
  4: ["Viererrunde", "Vierer"],
  5: ["Fünferrunde", "Fünfer"],
  6: ["Sechserrunde", "Sechser"],
  7: ["Siebenerrunde", "Siebener"],
  8: ["Achterrunde", "Achter"],
  9: ["Neunerrunde", "Neuner"],
  10: ["Zehnerrunde", "Zehner"],
};

export const STATS_CATEGORIES: StatsCategory[] = [
  { id: "gesamt", label: "Gesamt", short: "Gesamt", group: true, includes: () => true },
  { id: "klein", label: "Kleine Runden (2–3)", short: "Klein", group: true, includes: (n) => n <= 3 },
  { id: "mittel", label: "Mittlere Runden (4–5)", short: "Mittel", group: true, includes: (n) => n >= 4 && n <= 5 },
  { id: "gross", label: "Große Runden (6+)", short: "Groß", group: true, includes: (n) => n >= 6 },
  ...Object.entries(COUNT_LABELS).map(
    ([n, [label, short]]): StatsCategory => ({ id: String(n), label, short, group: false, includes: (c) => c === Number(n) }),
  ),
];

export const STATS_CATEGORY_IDS: string[] = STATS_CATEGORIES.map((c) => c.id);

export function statsCategory(id: string): StatsCategory | undefined {
  return STATS_CATEGORIES.find((c) => c.id === id);
}

/** Ids of every category a match with `playerCount` players belongs to. */
export function categoriesOf(playerCount: number): string[] {
  return STATS_CATEGORIES.filter((c) => c.includes(playerCount)).map((c) => c.id);
}

export const STATS_PERIODS = ["all", "365d", "90d", "30d"] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];
export const STATS_PERIOD_LABELS: Record<StatsPeriod, string> = { all: "Gesamt", "365d": "Jahr", "90d": "90 Tage", "30d": "30 Tage" };

/** Cutoff timestamp (ms) for a period, or null for "all". */
export function periodCutoff(period: StatsPeriod, now: number): number | null {
  const days = period === "365d" ? 365 : period === "90d" ? 90 : period === "30d" ? 30 : 0;
  return days === 0 ? null : now - days * 86_400_000;
}

export interface EloMatchInput {
  matchId: string;
  /** ISO timestamp (finish time) */
  at: string;
  players: { key: string; placement: number }[];
}

export interface EloHistoryPoint {
  matchId: string;
  at: string;
  elo: number;
}

export interface EloResult {
  /** final rating per subject key */
  ratings: Map<string, number>;
  history: Map<string, EloHistoryPoint[]>;
  /** matchId -> subject key -> delta */
  deltas: Map<string, Map<string, number>>;
}

/**
 * Multiplayer Elo: all pairwise comparisons per match (win 1 / tie 0.5 / loss 0 by placement),
 * K = 32/(n-1) per pair, expected score on the 400 scale. Deltas are applied simultaneously
 * after the match, so every match is zero-sum. Matches are processed by (at, matchId).
 * Duplicate keys within a match are merged (best placement).
 */
export function computeElo(matches: EloMatchInput[]): EloResult {
  const ratings = new Map<string, number>();
  const history = new Map<string, EloHistoryPoint[]>();
  const deltas = new Map<string, Map<string, number>>();
  const sorted = [...matches].sort((a, b) => {
    const ta = Date.parse(a.at);
    const tb = Date.parse(b.at);
    return ta - tb || (a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0);
  });
  for (const m of sorted) {
    const best = new Map<string, number>();
    for (const p of m.players) best.set(p.key, Math.min(best.get(p.key) ?? Infinity, p.placement));
    const ps = [...best.entries()];
    const n = ps.length;
    if (n < 2) continue;
    const k = ELO_K_BASE / (n - 1);
    const r = (key: string) => ratings.get(key) ?? ELO_START;
    const d = new Map<string, number>();
    for (const [ki, pi] of ps) {
      let delta = 0;
      for (const [kj, pj] of ps) {
        if (ki === kj) continue;
        const s = pi < pj ? 1 : pi === pj ? 0.5 : 0;
        const e = 1 / (1 + Math.pow(10, (r(kj) - r(ki)) / 400));
        delta += k * (s - e);
      }
      d.set(ki, delta);
    }
    for (const [key, delta] of d) {
      const next = r(key) + delta;
      ratings.set(key, next);
      let h = history.get(key);
      if (!h) history.set(key, (h = []));
      h.push({ matchId: m.matchId, at: m.at, elo: next });
    }
    deltas.set(m.matchId, d);
  }
  return { ratings, history, deltas };
}

/** (n - placement) / (n - 1), 0..1; 1 for the winner, 0 for last. */
export function placementScore(placement: number, playerCount: number): number {
  return playerCount <= 1 ? 1 : (playerCount - placement) / (playerCount - 1);
}

export interface SubjectMatchRow {
  matchId: string;
  at: string;
  placement: number;
  playerCount: number;
  rounds: number;
  correctRounds: number;
  avgScore: number;
}

export interface ScopeMetrics {
  matchCount: number;
  wins: number;
  winRate: number;
  /** mean of 1/n over the matches */
  expectedWinRate: number;
  /** mean normalized placement 0..1 */
  placementScore: number;
  /** mean points per round */
  avgPoints: number;
  /** correct rounds / rounds played */
  hitRate: number;
  /** sum of Elo deltas in scope */
  eloDelta: number;
  /** normalized placement (0..1) of the last 5 matches, oldest first */
  form: number[];
  provisional: boolean;
  placements: Record<number, number>;
}

/** Metrics over the subject's rows in one scope. `deltaOf(matchId)` gives the subject's Elo delta. */
export function scopeMetrics(rows: SubjectMatchRow[], deltaOf: (matchId: string) => number): ScopeMetrics {
  const sorted = [...rows].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || (a.matchId < b.matchId ? -1 : 1));
  const n = sorted.length;
  let wins = 0, exp = 0, ps = 0, pts = 0, rounds = 0, correct = 0, delta = 0;
  const placements: Record<number, number> = {};
  for (const r of sorted) {
    if (r.placement === 1) wins += 1;
    exp += 1 / r.playerCount;
    ps += placementScore(r.placement, r.playerCount);
    pts += r.avgScore;
    rounds += r.rounds;
    correct += r.correctRounds;
    delta += deltaOf(r.matchId);
    placements[r.placement] = (placements[r.placement] ?? 0) + 1;
  }
  return {
    matchCount: n,
    wins,
    winRate: n ? wins / n : 0,
    expectedWinRate: n ? exp / n : 0,
    placementScore: n ? ps / n : 0,
    avgPoints: n ? pts / n : 0,
    hitRate: rounds ? correct / rounds : 0,
    eloDelta: delta,
    form: sorted.slice(-5).map((r) => placementScore(r.placement, r.playerCount)),
    provisional: n < PROVISIONAL_MATCHES,
    placements,
  };
}

/** Ranking: non-provisional first (by elo desc), then provisional; ties by matches, name. */
export function compareByElo<T extends { provisional: boolean; elo: number; matchCount: number; name: string }>(a: T, b: T): number {
  return (
    Number(a.provisional) - Number(b.provisional) ||
    b.elo - a.elo ||
    b.matchCount - a.matchCount ||
    a.name.localeCompare(b.name, "de")
  );
}
