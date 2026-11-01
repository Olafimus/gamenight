/**
 * Statistics formulas. Used by the server (leaderboard/profile) and web. See docs/spec-stats.md.
 * Everything here is game-independent: it only needs totals and placements.
 */
import { rankTotals } from "./core";
import { deriveMatch, isTrickMatch, type MatchState } from "./match";

/** Final result of one player in one finished match (input for statistics). */
export interface PlayerMatchResult {
  matchId: string;
  gameId: string;
  playerId: string;
  userId: string | null;
  name: string;
  finalScore: number;
  /** Competition rank by final score (ties share best rank; rules.winner decides the direction). */
  placement: number;
  playerCount: number;
  /** Rounds (trick-bidding) or filled cells (score-sheet). */
  rounds: number;
  /** finalScore / rounds */
  avgScore: number;
  rating: number;
  /** trick-bidding: rounds with a right bid (undefined for other kinds / legacy data). */
  correctRounds?: number;
}

/** rating = 1/placement + playerCount/10 + avgScore/100 */
export function calcMatchRating(placement: number, playerCount: number, avgScore: number): number {
  return 1 / placement + playerCount / 10 + avgScore / 100;
}

/** Results of every player of a FINISHED match. Throws if not finished. */
export function matchResults(matchId: string, state: MatchState): PlayerMatchResult[] {
  const d = deriveMatch(state);
  if (!d.finished) throw new Error("Match is not finished");
  const ranks = rankTotals(
    d.players.map((p) => p.total),
    state.rules.winner,
  );
  const playerCount = d.players.length;
  const rounds = d.roundsPlayed;
  const trick = isTrickMatch(state) ? deriveMatch(state) : null;
  return d.players.map((p, i) => {
    const avgScore = rounds > 0 ? p.total / rounds : 0;
    const placement = ranks[i] ?? 1;
    const result: PlayerMatchResult = {
      matchId,
      gameId: state.gameId,
      playerId: p.id,
      userId: p.userId,
      name: p.name,
      finalScore: p.total,
      placement,
      playerCount,
      rounds,
      avgScore,
      rating: calcMatchRating(placement, playerCount, avgScore),
    };
    const tp = trick?.players[i];
    if (tp) result.correctRounds = tp.correct.filter(Boolean).length;
    return result;
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
