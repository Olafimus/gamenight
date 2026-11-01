/**
 * Pure engine of the "trick-bidding" kind. All functions are pure and never mutate their inputs.
 *
 * Rules are taken from `state.rules` (see rules.ts):
 *   peak         = maxCards ?? floor(deckSize / playerCount)   (maxCards clamped to 1..maxAllowedCards)
 *   roundCards   = schedule(peak)                               (pyramid / ascending / descending / fixed)
 *   hit          = entry "hit" ? marked ✓ : tricks === bid
 *   roundPoints  = hit ? hitBase + hitPerTrick·bid : missBase + missPerTrickDiff·|bid − tricks|
 *   rank         = competition ranking by total (rules.winner)
 *   giver rotates one seat forward (setup.players order, wrapping) after every committed round
 */
import { assertPlayerIn, assertPlayers, nextSeatId, onlyKnownKeys, rankTotals, reorderPlayers, type MatchPlayer, type RulesetRef } from "../../core";
import { SCHEISSE_RULES, SCHEISSE_RULESET_REF } from "../../games/scheisse";
import type { TrickRules, TrickScoring } from "./rules";
import type {
  InMatchStats,
  TrickCurrentRound,
  TrickDerivedMatch,
  TrickDerivedPlayer,
  TrickMatchState,
  TrickRoundEntry,
  TrickSetup,
} from "./types";

function assertBid(bid: number): void {
  if (!Number.isInteger(bid) || bid < 0) throw new Error(`Invalid bid: ${bid} (must be a non-negative integer)`);
}

function assertTricks(tricks: number): void {
  if (!Number.isInteger(tricks) || tricks < 0) throw new Error(`Invalid tricks: ${tricks} (must be a non-negative integer)`);
}

const EMPTY_ROUND = (rules: TrickRules): TrickCurrentRound =>
  rules.entry === "tricks" ? { bids: {}, correct: {}, tricks: {} } : { bids: {}, correct: {} };

// ---------------------------------------------------------------------------
// Round plan & scoring helpers
// ---------------------------------------------------------------------------

export function maxAllowedCards(deckSize: number, playerCount: number): number {
  if (playerCount <= 0) return 0;
  return Math.floor(deckSize / playerCount);
}

/** Effective peak hand size (respects a valid maxCards cap). Returns 0 for 0 players. */
export function peakCards(setup: Pick<TrickSetup, "deckSize" | "maxCards"> & { playerCount: number }): number {
  const allowed = maxAllowedCards(setup.deckSize, setup.playerCount);
  if (allowed === 0) return 0;
  const cap = setup.maxCards;
  if (cap === null || cap === undefined || !Number.isFinite(cap) || cap < 1 || cap > allowed) return allowed;
  return Math.floor(cap);
}

/** Pyramid schedule: number of rounds for a peak. */
export function totalRounds(peak: number): number {
  return peak <= 0 ? 0 : 2 * peak - 1;
}

/** Pyramid schedule: cards per player in round `round` (1-based). */
export function cardsForRound(round: number, peak: number): number {
  return round <= peak ? round : 2 * peak - round;
}

/** Cards per player for every round of a match with these rules and setup. */
export function roundPlan(rules: TrickRules, setup: Pick<TrickSetup, "deckSize" | "maxCards"> & { playerCount: number }): number[] {
  const { schedule, fixedCards, fixedRounds, allowMaxCards } = rules.rounds;
  if (setup.playerCount <= 0) return [];
  if (schedule === "fixed") {
    const cards = Math.min(fixedCards ?? 1, maxAllowedCards(setup.deckSize, setup.playerCount));
    return cards <= 0 ? [] : Array.from({ length: fixedRounds ?? 1 }, () => cards);
  }
  const peak = peakCards({ ...setup, maxCards: allowMaxCards ? setup.maxCards : null });
  // Variant "repeatPeak": the peak hand size is played twice in a row.
  const up = Array.from({ length: peak + (rules.rounds.repeatPeak && peak > 0 ? 1 : 0) }, (_, i) => Math.min(i + 1, peak));
  if (schedule === "ascending") return up;
  if (schedule === "descending") return up.reverse();
  return [...up, ...Array.from({ length: peak - 1 }, (_, i) => peak - 1 - i)];
}

/** Who bids first in a round given by its giver (rules.bidding.firstBidder). */
export function firstBidderId(rules: TrickRules, players: MatchPlayer[], giverId: string): string {
  return (rules.bidding.firstBidder ?? "giver") === "afterGiver" ? nextSeatId(players, giverId) : giverId;
}

export function roundPoints(bid: number, correct: boolean, scoring: TrickScoring = SCHEISSE_RULES.scoring, tricks: number | null = null): number {
  if (correct) return scoring.hitBase + scoring.hitPerTrick * bid;
  const diff = tricks === null ? 0 : Math.abs(bid - tricks);
  return scoring.missBase + scoring.missPerTrickDiff * diff;
}

/** @deprecated use nextSeatId */
export const nextGiverId = nextSeatId;

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

/** Derives everything shown in the UI from a trick-bidding match state. */
export function deriveTrickMatch(state: TrickMatchState): TrickDerivedMatch {
  const { setup, rounds, current, rules } = state;
  const n = setup.players.length;
  const plan = roundPlan(rules, { deckSize: setup.deckSize, maxCards: setup.maxCards, playerCount: n });
  const total = plan.length;
  const played = rounds.length;
  const tricksMode = rules.entry === "tricks";

  const acc = setup.players.map((p) => ({
    p,
    bids: [] as number[],
    correct: [] as boolean[],
    tricks: [] as (number | null)[],
    pts: [] as number[],
    scores: [] as number[],
    placements: [] as number[],
    total: 0,
    stats: {
      onWinStreak: false,
      winStreak: 0,
      maxWinStreak: 0,
      loseStreak: 0,
      maxLoseStreak: 0,
      firstPlaces: 0,
      lastPlaces: 0,
      maxCalledStiche: 0,
      maxWonStiche: 0,
    } as InMatchStats,
  }));

  for (const round of rounds) {
    for (const a of acc) {
      const bid = round.bids[a.p.id] ?? 0;
      const tricks = tricksMode ? (round.tricks?.[a.p.id] ?? 0) : null;
      const ok = tricksMode ? tricks === bid : round.correct[a.p.id] === true;
      const rp = roundPoints(bid, ok, rules.scoring, tricks);
      a.total += rp;
      a.bids.push(bid);
      a.correct.push(ok);
      a.tricks.push(tricks);
      a.pts.push(rp);
      a.scores.push(a.total);
      const st = a.stats;
      st.maxCalledStiche = Math.max(st.maxCalledStiche, bid);
      if (ok) {
        st.winStreak += 1;
        st.loseStreak = 0;
        st.onWinStreak = true;
        st.maxWinStreak = Math.max(st.maxWinStreak, st.winStreak);
        st.maxWonStiche = Math.max(st.maxWonStiche, bid);
      } else {
        st.loseStreak += 1;
        st.winStreak = 0;
        st.onWinStreak = false;
        st.maxLoseStreak = Math.max(st.maxLoseStreak, st.loseStreak);
      }
    }
    const ranks = rankTotals(
      acc.map((a) => a.total),
      rules.winner,
    );
    acc.forEach((a, i) => {
      const r = ranks[i] ?? 1;
      a.placements.push(r);
      if (r === 1) a.stats.firstPlaces += 1;
      if (r === n) a.stats.lastPlaces += 1;
    });
  }

  const players: TrickDerivedPlayer[] = acc.map((a, i) => ({
    ...a.p,
    seat: i,
    bids: a.bids,
    correct: a.correct,
    tricks: a.tricks,
    roundPoints: a.pts,
    scores: a.scores,
    total: a.total,
    placements: a.placements,
    placement: played > 0 ? (a.placements[played - 1] ?? null) : null,
    stats: a.stats,
  }));

  const finished = played >= total;
  const roundNumber = finished ? total : played + 1;
  const cardsThisRound = plan[roundNumber - 1] ?? 0;
  const giver = setup.players.find((p) => p.id === state.currentGiverId) ?? setup.players[0];
  const bidder = giver && setup.players.find((p) => p.id === firstBidderId(rules, setup.players, giver.id));
  let calledSum = 0;
  let tricksSum = 0;
  for (const p of setup.players) {
    calledSum += current.bids[p.id] ?? 0;
    tricksSum += current.tricks?.[p.id] ?? 0;
  }
  const allMarked =
    n > 0 &&
    setup.players.every((p) => (tricksMode ? typeof current.tricks?.[p.id] === "number" : typeof current.correct[p.id] === "boolean"));
  const allBid = n > 0 && setup.players.every((p) => typeof current.bids[p.id] === "number");

  return {
    kind: "trick-bidding",
    gameId: state.gameId,
    players,
    roundCards: plan,
    peak: plan.reduce((m, c) => Math.max(m, c), 0),
    totalRounds: total,
    roundsPlayed: played,
    roundNumber,
    cardsThisRound,
    giverId: giver ? giver.id : "",
    giverName: giver ? giver.name : "",
    bidderId: bidder ? bidder.id : "",
    bidderName: bidder ? bidder.name : "",
    calledSum,
    sumMatchesCards: calledSum === cardsThisRound,
    bidSumAllowed: !(rules.bidding.sumRule === "notEqualCards" && allBid && calledSum === cardsThisRound),
    tricksSum,
    tricksSumValid: !(tricksMode && rules.tricksMustSumToCards && allMarked && tricksSum !== cardsThisRound),
    allMarked,
    finished,
  };
}

/** Structural checks the derivation does not enforce (ids, rules vs. setup). Throws on inconsistency. */
export function assertTrickConsistent(state: TrickMatchState): void {
  const { setup, rules } = state;
  assertPlayers(setup.players, rules.players);
  const ids = new Set(setup.players.map((p) => p.id));
  if (!ids.has(state.currentGiverId)) throw new Error("unknown currentGiverId");
  if (!rules.deck.sizes.includes(setup.deckSize)) throw new Error(`deck size ${setup.deckSize} not allowed by the rules`);
  if (setup.maxCards !== null && !rules.rounds.allowMaxCards) throw new Error("rules do not allow a maxCards cap");
  const c = state.current;
  if (!onlyKnownKeys(c.bids, ids) || !onlyKnownKeys(c.correct, ids) || !onlyKnownKeys(c.tricks, ids)) {
    throw new Error("unknown player in current round");
  }
  for (const r of state.rounds) {
    if (!ids.has(r.giverId) || !onlyKnownKeys(r.bids, ids) || !onlyKnownKeys(r.correct, ids) || !onlyKnownKeys(r.tricks, ids)) {
      throw new Error("unknown player in committed round");
    }
  }
  const total = roundPlan(rules, { deckSize: setup.deckSize, maxCards: setup.maxCards, playerCount: setup.players.length }).length;
  if (state.rounds.length > total) throw new Error(`more rounds (${state.rounds.length}) than the rules allow (${total})`);
}

// ---------------------------------------------------------------------------
// State transitions (pure). Each returns a new TrickMatchState.
// ---------------------------------------------------------------------------

export interface TrickRulesetInput {
  gameId: string;
  ruleset: RulesetRef;
  rules: TrickRules;
}

/** Scheisse standard (default when no ruleset is given). */
export const SCHEISSE_RULESET_INPUT: TrickRulesetInput = { gameId: "scheisse", ruleset: SCHEISSE_RULESET_REF, rules: SCHEISSE_RULES };

/**
 * New match. Giver of round 1 = `firstGiverId` or the first seat.
 * Throws if the player count violates the rules or ids are duplicated.
 */
export function createMatchState(setup: TrickSetup, firstGiverId?: string, ruleset: TrickRulesetInput = SCHEISSE_RULESET_INPUT): TrickMatchState {
  const { rules } = ruleset;
  assertPlayers(setup.players, rules.players);
  if (firstGiverId !== undefined) assertPlayerIn(setup.players, firstGiverId);
  const state: TrickMatchState = {
    kind: "trick-bidding",
    gameId: ruleset.gameId,
    ruleset: { ...ruleset.ruleset },
    rules,
    setup: {
      ...setup,
      maxCards: rules.rounds.allowMaxCards ? setup.maxCards : null,
      players: setup.players.map((p) => ({ ...p })),
    },
    rounds: [],
    current: EMPTY_ROUND(rules),
    currentGiverId: firstGiverId ?? (setup.players[0] as MatchPlayer).id,
  };
  if (!rules.deck.sizes.includes(setup.deckSize)) throw new Error(`deck size ${setup.deckSize} not allowed by the rules`);
  return state;
}

/** Sets a bid in the current round. Negative / non-integer bids are rejected (throw). */
export function setBid(state: TrickMatchState, playerId: string, bid: number): TrickMatchState {
  assertPlayerIn(state.setup.players, playerId);
  assertBid(bid);
  return { ...state, current: { ...state.current, bids: { ...state.current.bids, [playerId]: bid } } };
}

/** entry "hit": marks right/wrong. */
export function setCorrect(state: TrickMatchState, playerId: string, correct: boolean): TrickMatchState {
  assertPlayerIn(state.setup.players, playerId);
  return { ...state, current: { ...state.current, correct: { ...state.current.correct, [playerId]: correct } } };
}

/** entry "tricks": sets the tricks actually taken. */
export function setTricks(state: TrickMatchState, playerId: string, tricks: number): TrickMatchState {
  assertPlayerIn(state.setup.players, playerId);
  assertTricks(tricks);
  if (state.rules.entry !== "tricks") throw new Error("These rules record right/wrong, not tricks");
  return { ...state, current: { ...state.current, tricks: { ...(state.current.tricks ?? {}), [playerId]: tricks } } };
}

/** "alle ✓" / "alle ✗" (entry "hit"). */
export function setAllCorrect(state: TrickMatchState, correct: boolean): TrickMatchState {
  const marks: Record<string, boolean> = {};
  for (const p of state.setup.players) marks[p.id] = correct;
  return { ...state, current: { ...state.current, correct: marks } };
}

/** "Reset": clears bids and results of the current round. */
export function resetCurrentRound(state: TrickMatchState): TrickMatchState {
  return { ...state, current: EMPTY_ROUND(state.rules) };
}

/** Why the current round can't be committed, or null if it can. */
export function commitBlocker(state: TrickMatchState): "finished" | "not_all_marked" | "bid_sum" | "tricks_sum" | null {
  const d = deriveTrickMatch(state);
  if (d.finished) return "finished";
  if (!d.allMarked) return "not_all_marked";
  if (!d.bidSumAllowed) return "bid_sum";
  if (!d.tricksSumValid) return "tricks_sum";
  return null;
}

/** True if the current round can be committed (all results entered, rule checks pass, match not finished). */
export function canCommitRound(state: TrickMatchState): boolean {
  return commitBlocker(state) === null;
}

/**
 * "Nächste Runde": moves `current` into `rounds` (missing bids/tricks count as 0), records giverId,
 * advances the giver, clears `current`. Throws if !canCommitRound.
 */
export function commitRound(state: TrickMatchState): TrickMatchState {
  const blocker = commitBlocker(state);
  if (blocker === "finished") throw new Error("Cannot commit a round: match is already finished");
  if (blocker === "not_all_marked") throw new Error("Cannot commit a round: not all players are marked");
  if (blocker === "bid_sum") throw new Error("Cannot commit a round: the sum of bids must not equal the cards");
  if (blocker === "tricks_sum") throw new Error("Cannot commit a round: tricks don't add up to the cards");
  const d = deriveTrickMatch(state);
  const tricksMode = state.rules.entry === "tricks";
  const bids: Record<string, number> = {};
  const correct: Record<string, boolean> = {};
  const tricks: Record<string, number> = {};
  for (const p of state.setup.players) {
    bids[p.id] = state.current.bids[p.id] ?? 0;
    if (tricksMode) tricks[p.id] = state.current.tricks?.[p.id] ?? 0;
    correct[p.id] = tricksMode ? tricks[p.id] === bids[p.id] : state.current.correct[p.id] === true;
  }
  const entry: TrickRoundEntry = tricksMode ? { giverId: d.giverId, bids, correct, tricks } : { giverId: d.giverId, bids, correct };
  return {
    ...state,
    rounds: [...state.rounds, entry],
    current: EMPTY_ROUND(state.rules),
    currentGiverId: nextSeatId(state.setup.players, d.giverId),
  };
}

/** True if there is a committed round to undo. Undo is also allowed after the match finished. */
export function canUndoRound(state: TrickMatchState): boolean {
  return state.rounds.length > 0;
}

/**
 * "Letzte Runde" (undo): removes the last committed round, restores its bids AND results into
 * `current`, restores currentGiverId to that round's giver.
 */
export function undoRound(state: TrickMatchState): TrickMatchState {
  if (state.rounds.length === 0) throw new Error("No committed round to undo");
  const last = state.rounds[state.rounds.length - 1] as TrickRoundEntry;
  const current: TrickCurrentRound = { bids: { ...last.bids }, correct: { ...last.correct } };
  if (state.rules.entry === "tricks") current.tricks = { ...(last.tricks ?? {}) };
  return { ...state, rounds: state.rounds.slice(0, -1), current, currentGiverId: last.giverId };
}

/** Scoreboard correction of a committed round (0-based roundIndex). Everything re-derives. */
export function correctRound(
  state: TrickMatchState,
  roundIndex: number,
  playerId: string,
  patch: { bid?: number; correct?: boolean; tricks?: number },
): TrickMatchState {
  if (!Number.isInteger(roundIndex) || roundIndex < 0 || roundIndex >= state.rounds.length) {
    throw new Error(`Invalid round index: ${roundIndex}`);
  }
  assertPlayerIn(state.setup.players, playerId);
  if (patch.bid !== undefined) assertBid(patch.bid);
  if (patch.tricks !== undefined) assertTricks(patch.tricks);
  const old = state.rounds[roundIndex] as TrickRoundEntry;
  const bids = patch.bid !== undefined ? { ...old.bids, [playerId]: patch.bid } : { ...old.bids };
  const updated: TrickRoundEntry = { giverId: old.giverId, bids, correct: { ...old.correct } };
  if (state.rules.entry === "tricks") {
    const tricks = { ...(old.tricks ?? {}) };
    if (patch.tricks !== undefined) tricks[playerId] = patch.tricks;
    updated.tricks = tricks;
    updated.correct[playerId] = tricks[playerId] === bids[playerId];
  } else if (patch.correct !== undefined) {
    updated.correct[playerId] = patch.correct;
  }
  return { ...state, rounds: state.rounds.map((r, i) => (i === roundIndex ? updated : r)) };
}

/** New seat order (array of all player ids). Giver stays the same person. */
export function reorderSeats(state: TrickMatchState, orderedIds: string[]): TrickMatchState {
  return { ...state, setup: { ...state.setup, players: reorderPlayers(state.setup.players, orderedIds) } };
}

export function setGiver(state: TrickMatchState, playerId: string): TrickMatchState {
  assertPlayerIn(state.setup.players, playerId);
  return { ...state, currentGiverId: playerId };
}

/**
 * Changes deck size mid-game (one of rules.deck.sizes). maxCards is reset to null if it exceeds the
 * new maxAllowedCards. If this makes rounds.length > total rounds the change is rejected (throw).
 */
export function setDeckSize(state: TrickMatchState, deckSize: number): TrickMatchState {
  if (!state.rules.deck.sizes.includes(deckSize)) throw new Error(`deck size ${deckSize} not allowed by the rules`);
  const n = state.setup.players.length;
  const allowed = maxAllowedCards(deckSize, n);
  const maxCards = state.setup.maxCards !== null && state.setup.maxCards > allowed ? null : state.setup.maxCards;
  const setup: TrickSetup = { ...state.setup, deckSize, maxCards };
  const total = roundPlan(state.rules, { deckSize, maxCards, playerCount: n }).length;
  if (state.rounds.length > total) {
    throw new Error(`Deck size ${deckSize} allows only ${total} rounds, but ${state.rounds.length} were already played`);
  }
  return { ...state, setup };
}

/** "Noch ein Match": same players, seat order, deck/maxCards and rules; no rounds; giver = first seat. */
export function rematch(state: TrickMatchState): TrickMatchState {
  return createMatchState(state.setup, undefined, { gameId: state.gameId, ruleset: state.ruleset, rules: state.rules });
}
