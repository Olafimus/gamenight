import { cardsForRound, deriveMatch, type MatchState } from "@scheisse/shared";

export type RoundOutcome = "right" | "wrong" | "neutral";

export interface WatchRow {
  id: string;
  name: string;
  /** null before the first committed round. */
  placement: number | null;
  /** Current round's bid, null if not entered yet. */
  bid: number | null;
  total: number;
  outcome: RoundOutcome;
}

/** Table rows for the live view, sorted by placement (seat order before the first round / on ties). */
export function buildWatchRows(state: MatchState): WatchRow[] {
  const d = deriveMatch(state);
  const rows = d.players.map((p) => {
    const last = p.correct.length - 1;
    const outcome: RoundOutcome = last < 0 ? "neutral" : p.correct[last] ? "right" : "wrong";
    const bid = state.current.bids[p.id];
    const row: WatchRow = { id: p.id, name: p.name, placement: p.placement, bid: bid ?? null, total: p.total, outcome };
    return { row, seat: p.seat };
  });
  rows.sort((a, b) => (a.row.placement ?? 0) - (b.row.placement ?? 0) || a.seat - b.seat);
  return rows.map((r) => r.row);
}

/** After a committed round the result stays visible this long, unless bids for the next round arrive earlier. */
export const CLOSED_HOLD_MS = 10_000;

export type RoundPhase = "closed" | "bidding" | "marking" | "finished";

/**
 * Status of the round shown live: `closed` (last round just scored), `bidding` (pending: bids are being entered;
 * also the fallback after CLOSED_HOLD_MS, since everybody may bid 0 without touching anything),
 * `marking` (right/wrong being entered) or `finished`.
 * `msSinceCommit` = time since the last round was committed (null if unknown).
 */
export function roundPhase(state: MatchState, msSinceCommit: number | null): RoundPhase {
  const d = deriveMatch(state);
  if (d.finished) return "finished";
  if (Object.keys(state.current.correct).length > 0) return "marking";
  if (Object.keys(state.current.bids).length > 0) return "bidding";
  if (d.roundsPlayed > 0 && msSinceCommit !== null && msSinceCommit < CLOSED_HOLD_MS) return "closed";
  return "bidding";
}

export interface LiveRoundRow {
  id: string;
  name: string;
  isGiver: boolean;
  /** null = not entered yet */
  bid: number | null;
  correct: boolean | null;
  /** points of that round, only for a closed round */
  points: number | null;
}

export interface LiveRound {
  /** 1-based number of the round shown */
  round: number;
  cards: number;
  giverName: string;
  calledSum: number;
  /** players in bidding order (giver first) */
  rows: LiveRoundRow[];
}

/** The round to show: the last committed one while `closed`, else the current one. */
export function liveRound(state: MatchState, phase: RoundPhase): LiveRound {
  const d = deriveMatch(state);
  const showLast = (phase === "closed" || phase === "finished") && d.roundsPlayed > 0;
  const idx = d.roundsPlayed - 1;
  const giverId = showLast ? state.rounds[idx]!.giverId : d.giverId;
  const g = Math.max(0, d.players.findIndex((p) => p.id === giverId));
  const ordered = [...d.players.slice(g), ...d.players.slice(0, g)];
  const rows = ordered.map<LiveRoundRow>((p) =>
    showLast
      ? { id: p.id, name: p.name, isGiver: p.id === giverId, bid: p.bids[idx] ?? null, correct: p.correct[idx] ?? null, points: p.roundPoints[idx] ?? null }
      : { id: p.id, name: p.name, isGiver: p.id === giverId, bid: state.current.bids[p.id] ?? null, correct: state.current.correct[p.id] ?? null, points: null },
  );
  return {
    round: showLast ? d.roundsPlayed : d.roundNumber,
    cards: showLast ? cardsForRound(d.roundsPlayed, d.peak) : d.cardsThisRound,
    giverName: ordered[0]?.name ?? "",
    calledSum: rows.reduce((s, r) => s + (r.bid ?? 0), 0),
    rows,
  };
}
