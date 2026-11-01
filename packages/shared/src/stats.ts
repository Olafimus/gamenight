/**
 * Statistics formulas. CONTRACT: signatures fixed.
 * Used by the server (leaderboard/profile) and web. See docs/spec-stats.md.
 */
import { deriveMatch, rankTotals } from "./engine";
import type { MatchState, PlayerMatchResult } from "./types";

/** rating = 1/placement + playerCount/10 + avgScore/100 */
export function calcMatchRating(placement: number, playerCount: number, avgScore: number): number {
  return 1 / placement + playerCount / 10 + avgScore / 100;
}

/** Results of every player of a FINISHED match. Throws if not finished. */
export function matchResults(matchId: string, state: MatchState): PlayerMatchResult[] {
  const d = deriveMatch(state);
  if (!d.finished) throw new Error("Match is not finished");
  const ranks = rankTotals(d.players.map((p) => p.total));
  const rankOf = (i: number): number => ranks[i] ?? 1;
  const playerCount = d.players.length;
  return d.players.map((p, i) => {
    const avgScore = p.total / d.roundsPlayed;
    const placement = rankOf(i);
    return {
      matchId,
      playerId: p.id,
      userId: p.userId,
      name: p.name,
      finalScore: p.total,
      placement,
      playerCount,
      rounds: d.roundsPlayed,
      avgScore,
      rating: calcMatchRating(placement, playerCount, avgScore),
      correctRounds: p.correct.filter(Boolean).length,
    };
  });
}

export interface AggregateStats {
  matchCount: number;
  firstPlaces: number;
  /** firstPlaces / matchCount (0..1), 0 if no matches */
  winRate: number;
  /** mean of avgScore over matches */
  averagePoints: number;
  /** mean of rating over matches */
  averageRating: number;
  /** placement -> count */
  placements: Record<number, number>;
}

/** Aggregates over one player's results (all results must belong to the same player). */
export function aggregateResults(results: PlayerMatchResult[]): AggregateStats {
  const matchCount = results.length;
  const placements: Record<number, number> = {};
  let firstPlaces = 0;
  let sumAvg = 0;
  let sumRating = 0;
  for (const r of results) {
    placements[r.placement] = (placements[r.placement] ?? 0) + 1;
    if (r.placement === 1) firstPlaces += 1;
    sumAvg += r.avgScore;
    sumRating += r.rating;
  }
  return {
    matchCount,
    firstPlaces,
    winRate: matchCount === 0 ? 0 : firstPlaces / matchCount,
    averagePoints: matchCount === 0 ? 0 : sumAvg / matchCount,
    averageRating: matchCount === 0 ? 0 : sumRating / matchCount,
    placements,
  };
}

/** Same as aggregateResults but bucketed by playerCount. */
export function aggregateByPlayerCount(results: PlayerMatchResult[]): Record<number, AggregateStats> {
  const buckets: Record<number, PlayerMatchResult[]> = {};
  for (const r of results) (buckets[r.playerCount] ??= []).push(r);
  const out: Record<number, AggregateStats> = {};
  for (const key of Object.keys(buckets)) out[Number(key)] = aggregateResults(buckets[Number(key)] ?? []);
  return out;
}

export interface VersusEntry {
  userId: string | null;
  name: string;
  /** shared finished matches */
  matches: number;
  /** shared matches the SUBJECT player won (placement 1) — same semantics as original */
  wins: number;
}

/**
 * Co-player table for a subject player.
 * @param subject the subject's results
 * @param allResultsOfThoseMatches every PlayerMatchResult of the matches in `subject`
 * Co-players are grouped by userId (guests grouped by name). Sorted by matches desc.
 */
export function versusTable(subject: PlayerMatchResult[], allResultsOfThoseMatches: PlayerMatchResult[]): VersusEntry[] {
  const subjectByMatch = new Map<string, PlayerMatchResult>();
  for (const s of subject) subjectByMatch.set(s.matchId, s);
  const groups = new Map<string, VersusEntry>();
  for (const r of allResultsOfThoseMatches) {
    const s = subjectByMatch.get(r.matchId);
    if (!s || r.playerId === s.playerId) continue;
    const key = r.userId !== null ? `u:${r.userId}` : `g:${r.name.trim().toLowerCase()}`;
    let g = groups.get(key);
    if (!g) {
      g = { userId: r.userId, name: r.name, matches: 0, wins: 0 };
      groups.set(key, g);
    }
    g.matches += 1;
    if (s.placement === 1) g.wins += 1;
  }
  return [...groups.values()].sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name));
}
