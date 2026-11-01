import { describe, expect, it } from "vitest";
import {
  canCommitRound,
  canUndoRound,
  cardsForRound,
  commitRound,
  correctRound,
  createMatchState,
  deriveTrickMatch as deriveMatch,
  maxAllowedCards,
  nextGiverId,
  peakCards,
  rematch,
  reorderSeats,
  resetCurrentRound,
  roundPlan,
  roundPoints,
  setAllCorrect,
  setBid,
  setCorrect,
  setDeckSize,
  setGiver,
  totalRounds,
  undoRound,
} from "./engine";
import { rankTotals } from "../../core";
import type { TrickDerivedPlayer as DerivedPlayer, TrickMatchState as MatchState } from "./types";
type DeckSize = number;

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
}

const ids = ["a", "b", "c", "d"];
function mk(n = 4, deckSize: DeckSize = 32, maxCards: number | null = null): MatchState {
  return createMatchState({
    players: ids.slice(0, n).map((id) => ({ id, name: id.toUpperCase(), userId: null })),
    deckSize,
    maxCards,
  });
}

/** play one round: bids per player, correct per player */
function play(s: MatchState, bids: number[], ok: boolean[]): MatchState {
  s.setup.players.forEach((p, i) => {
    s = setBid(s, p.id, bids[i]!);
    s = setCorrect(s, p.id, ok[i]!);
  });
  return commitRound(s);
}

describe("helpers", () => {
  it("round sequence 32 cards / 4 players", () => {
    expect(maxAllowedCards(32, 4)).toBe(8);
    const peak = peakCards({ deckSize: 32, maxCards: null, playerCount: 4 });
    expect(peak).toBe(8);
    expect(totalRounds(peak)).toBe(15);
    const seq = Array.from({ length: 15 }, (_, i) => cardsForRound(i + 1, peak));
    expect(seq).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 7, 6, 5, 4, 3, 2, 1]);
  });
  it("cap 3 -> 1,2,3,2,1", () => {
    const peak = peakCards({ deckSize: 32, maxCards: 3, playerCount: 4 });
    expect(peak).toBe(3);
    expect(totalRounds(peak)).toBe(5);
    expect(Array.from({ length: 5 }, (_, i) => cardsForRound(i + 1, peak))).toEqual([1, 2, 3, 2, 1]);
  });
  it("oversized / invalid cap is treated as null", () => {
    expect(peakCards({ deckSize: 32, maxCards: 20, playerCount: 4 })).toBe(8);
    expect(peakCards({ deckSize: 32, maxCards: 0, playerCount: 4 })).toBe(8);
    expect(peakCards({ deckSize: 52, maxCards: null, playerCount: 0 })).toBe(0);
    expect(peakCards({ deckSize: 64, maxCards: null, playerCount: 10 })).toBe(6);
  });
  it("scoring", () => {
    expect(roundPoints(3, true)).toBe(13);
    expect(roundPoints(0, true)).toBe(10);
    expect(roundPoints(5, false)).toBe(-10);
  });
  it("competition ranking with ties", () => {
    expect(rankTotals([10, 30, 30, 5])).toEqual([3, 1, 1, 4]);
    expect(rankTotals([])).toEqual([]);
    expect(rankTotals([0, 0, 0])).toEqual([1, 1, 1]);
  });
  it("nextGiverId wraps and falls back", () => {
    const ps = mk().setup.players;
    expect(nextGiverId(ps, "a")).toBe("b");
    expect(nextGiverId(ps, "d")).toBe("a");
    expect(nextGiverId(ps, "zzz")).toBe("a");
  });
});

describe("createMatchState", () => {
  it("initial state", () => {
    const s = mk();
    expect(s.currentGiverId).toBe("a");
    expect(s.rounds).toEqual([]);
    const d = deriveMatch(s);
    expect(d.roundNumber).toBe(1);
    expect(d.cardsThisRound).toBe(1);
    expect(d.totalRounds).toBe(15);
    expect(d.finished).toBe(false);
    expect(d.players.every((p) => p.placement === null && p.total === 0)).toBe(true);
    expect(d.giverName).toBe("A");
  });
  it("custom first giver", () => {
    const s = createMatchState(mk().setup, "c");
    expect(s.currentGiverId).toBe("c");
  });
  it("rejects < 2 players and unknown giver", () => {
    expect(() => mk(1)).toThrow(/at least 2/);
    expect(() => createMatchState(mk().setup, "nope")).toThrow(/Unknown player/);
  });
});

describe("current round", () => {
  it("setBid / calledSum / sumMatchesCards", () => {
    let s = mk();
    s = setBid(s, "a", 1);
    expect(deriveMatch(s).calledSum).toBe(1);
    expect(deriveMatch(s).sumMatchesCards).toBe(true);
    s = setBid(s, "b", 1);
    expect(deriveMatch(s).sumMatchesCards).toBe(false);
  });
  it("rejects invalid bids and players", () => {
    const s = mk();
    expect(() => setBid(s, "a", -1)).toThrow();
    expect(() => setBid(s, "a", 1.5)).toThrow();
    expect(() => setBid(s, "x", 1)).toThrow(/Unknown player/);
    expect(() => setCorrect(s, "x", true)).toThrow(/Unknown player/);
  });
  it("allMarked / canCommit / setAllCorrect / reset", () => {
    let s = mk();
    expect(canCommitRound(s)).toBe(false);
    s = setCorrect(s, "a", false);
    expect(deriveMatch(s).allMarked).toBe(false);
    s = setAllCorrect(s, true);
    expect(deriveMatch(s).allMarked).toBe(true);
    expect(canCommitRound(s)).toBe(true);
    s = setBid(s, "a", 1);
    s = resetCurrentRound(s);
    expect(s.current).toEqual({ bids: {}, correct: {} });
    expect(canCommitRound(s)).toBe(false);
  });
  it("commit throws when not all marked", () => {
    expect(() => commitRound(mk())).toThrow(/not all/);
  });
});

describe("commit / scoring / giver", () => {
  it("scores, placements and giver rotation", () => {
    let s = mk();
    s = play(s, [1, 0, 0, 0], [true, true, false, false]);
    const d = deriveMatch(s);
    expect(d.players.map((p) => p.total)).toEqual([11, 10, -10, -10]);
    expect(d.players.map((p) => p.placement)).toEqual([1, 2, 3, 3]);
    expect(d.players[0]!.roundPoints).toEqual([11]);
    expect(d.roundNumber).toBe(2);
    expect(d.cardsThisRound).toBe(2);
    expect(s.rounds[0]!.giverId).toBe("a");
    expect(s.currentGiverId).toBe("b");
    expect(s.current).toEqual({ bids: {}, correct: {} });
  });
  it("missing bids count as 0 and are filled in", () => {
    let s = mk();
    s = setAllCorrect(s, true);
    s = commitRound(s);
    expect(s.rounds[0]!.bids).toEqual({ a: 0, b: 0, c: 0, d: 0 });
    expect(deriveMatch(s).players[0]!.total).toBe(10);
  });
  it("giver wraps and match finishes after totalRounds", () => {
    let s = mk(4, 32, 3); // 5 rounds
    const givers: string[] = [];
    for (let i = 0; i < 5; i++) {
      givers.push(s.currentGiverId);
      s = setAllCorrect(s, true);
      s = commitRound(s);
    }
    expect(givers).toEqual(["a", "b", "c", "d", "a"]);
    const d = deriveMatch(s);
    expect(d.finished).toBe(true);
    expect(d.roundNumber).toBe(5);
    expect(d.roundsPlayed).toBe(5);
    expect(d.cardsThisRound).toBe(1);
    expect(canCommitRound(setAllCorrect(s, true))).toBe(false);
    expect(() => commitRound(setAllCorrect(s, true))).toThrow(/finished/);
  });
  it("cards use the capped peak", () => {
    let s = mk(4, 32, 2); // 1,2,1
    const cards: number[] = [];
    for (let i = 0; i < 3; i++) {
      cards.push(deriveMatch(s).cardsThisRound);
      s = commitRound(setAllCorrect(s, false));
    }
    expect(cards).toEqual([1, 2, 1]);
    expect(deriveMatch(s).finished).toBe(true);
  });
});

describe("undo", () => {
  it("roundtrip restores bids, marks and giver", () => {
    let s = mk();
    s = setBid(s, "a", 1);
    s = setBid(s, "b", 0);
    s = setCorrect(s, "a", true);
    s = setCorrect(s, "b", false);
    s = setCorrect(s, "c", true);
    s = setCorrect(s, "d", true);
    const before = s;
    const committed = commitRound(before);
    expect(canUndoRound(committed)).toBe(true);
    const undone = undoRound(committed);
    expect(undone.rounds).toEqual([]);
    expect(undone.currentGiverId).toBe(before.currentGiverId);
    expect(undone.current.correct).toEqual({ a: true, b: false, c: true, d: true });
    expect(undone.current.bids.a).toBe(1);
    expect(deriveMatch(undone).players.every((p) => p.total === 0)).toBe(true);
    expect(deriveMatch(undone).players[0]!.stats.winStreak).toBe(0);
  });
  it("throws without rounds", () => {
    expect(canUndoRound(mk())).toBe(false);
    expect(() => undoRound(mk())).toThrow(/undo/);
  });
  it("works after finish", () => {
    let s = mk(4, 32, 1); // 1 round
    s = commitRound(setAllCorrect(s, true));
    expect(deriveMatch(s).finished).toBe(true);
    const u = undoRound(s);
    expect(deriveMatch(u).finished).toBe(false);
    expect(canCommitRound(u)).toBe(true);
  });
  it("stats re-derive after undo", () => {
    let s = mk();
    s = commitRound(setAllCorrect(s, true));
    s = commitRound(setAllCorrect(s, true));
    expect(deriveMatch(s).players[0]!.stats.winStreak).toBe(2);
    s = undoRound(s);
    expect(deriveMatch(s).players[0]!.stats.winStreak).toBe(1);
    expect(deriveMatch(s).players[0]!.stats.firstPlaces).toBe(1);
  });
});

describe("correctRound", () => {
  it("re-derives scores and placements", () => {
    let s = mk();
    s = play(s, [1, 0, 0, 0], [true, false, false, false]);
    s = play(s, [0, 0, 0, 0], [false, true, false, false]);
    // totals: a 1, b 0, c -20, d -20
    expect(deriveMatch(s).players.map((p) => p.placement)).toEqual([1, 2, 3, 3]);
    const c = correctRound(s, 0, "a", { correct: false });
    const d = deriveMatch(c);
    expect(d.players[0]!.total).toBe(-20);
    expect(d.players.map((p) => p.placement)).toEqual([2, 1, 2, 2]);
    expect(d.players[0]!.placements).toEqual([1, 2]);
    expect(d.players[0]!.stats.maxWonStiche).toBe(0);
    const b = correctRound(s, 0, "a", { bid: 3 });
    expect(deriveMatch(b).players[0]!.roundPoints[0]).toBe(13);
    expect(deriveMatch(b).players[0]!.stats.maxCalledStiche).toBe(3);
    expect(deriveMatch(b).players[0]!.stats.maxWonStiche).toBe(3);
  });
  it("validates input", () => {
    const s = commitRound(setAllCorrect(mk(), true));
    expect(() => correctRound(s, 5, "a", {})).toThrow(/round index/);
    expect(() => correctRound(s, -1, "a", {})).toThrow();
    expect(() => correctRound(s, 0, "zz", {})).toThrow(/Unknown player/);
    expect(() => correctRound(s, 0, "a", { bid: -1 })).toThrow();
  });
});

describe("streak stats", () => {
  it("win/lose streaks, first/last places, max stiche", () => {
    let s = mk(2, 32);
    // round 1: a right (bid 1) -> a 11, b -10
    s = play(s, [1, 0], [true, false]);
    // round 2: a right (bid 2) -> a 23, b -20
    s = play(s, [2, 1], [true, false]);
    // round 3: a wrong, b right (bid 3) -> a 13, b -7
    s = play(s, [0, 3], [false, true]);
    const [a, b] = deriveMatch(s).players as [DerivedPlayer, DerivedPlayer];
    expect(a.stats).toMatchObject({
      onWinStreak: false,
      winStreak: 0,
      maxWinStreak: 2,
      loseStreak: 1,
      maxLoseStreak: 1,
      firstPlaces: 3,
      lastPlaces: 0,
      maxCalledStiche: 2,
      maxWonStiche: 2,
    });
    expect(b.stats).toMatchObject({
      onWinStreak: true,
      winStreak: 1,
      maxWinStreak: 1,
      loseStreak: 0,
      maxLoseStreak: 2,
      firstPlaces: 0,
      lastPlaces: 3,
      maxCalledStiche: 3,
      maxWonStiche: 3,
    });
  });
  it("tied last does not count as last place", () => {
    let s = mk(3, 32);
    s = play(s, [0, 0, 0], [true, false, false]); // a 10, b -10, c -10 -> b,c rank 2
    const d = deriveMatch(s);
    expect(d.players.map((p) => p.stats.lastPlaces)).toEqual([0, 0, 0]);
    expect(d.players.map((p) => p.stats.firstPlaces)).toEqual([1, 0, 0]);
  });
});

describe("reorderSeats / setGiver", () => {
  it("keeps the giver person and derives from new order", () => {
    let s = mk();
    s = setGiver(s, "c");
    const r = reorderSeats(s, ["d", "c", "b", "a"]);
    expect(r.currentGiverId).toBe("c");
    expect(deriveMatch(r).giverName).toBe("C");
    expect(deriveMatch(r).players.map((p) => p.id)).toEqual(["d", "c", "b", "a"]);
    expect(deriveMatch(r).players[0]!.seat).toBe(0);
    // next giver follows new order
    const n = commitRound(setAllCorrect(r, true));
    expect(n.currentGiverId).toBe("b");
  });
  it("keeps history keyed by player", () => {
    let s = mk();
    s = play(s, [1, 0, 0, 0], [true, false, false, false]);
    const r = reorderSeats(s, ["d", "c", "b", "a"]);
    const d = deriveMatch(r);
    expect(d.players.find((p) => p.id === "a")?.total).toBe(11);
    expect(d.players.find((p) => p.id === "d")?.total).toBe(-10);
  });
  it("rejects invalid sets", () => {
    const s = mk();
    expect(() => reorderSeats(s, ["a", "b", "c"])).toThrow();
    expect(() => reorderSeats(s, ["a", "b", "c", "c"])).toThrow();
    expect(() => reorderSeats(s, ["a", "b", "c", "x"])).toThrow();
    expect(() => reorderSeats(s, ["a", "b", "c", "d", "a"])).toThrow();
  });
  it("setGiver rejects unknown", () => {
    expect(() => setGiver(mk(), "x")).toThrow(/Unknown player/);
  });
});

describe("setDeckSize", () => {
  it("changes deck and resets oversized cap", () => {
    const s = mk(4, 64, 12);
    const r = setDeckSize(s, 32);
    expect(r.setup.deckSize).toBe(32);
    expect(r.setup.maxCards).toBeNull();
    expect(deriveMatch(r).totalRounds).toBe(15);
  });
  it("keeps valid cap", () => {
    expect(setDeckSize(mk(4, 52, 5), 32).setup.maxCards).toBe(5);
  });
  it("rejects when too many rounds already played", () => {
    let s = mk(4, 64); // peak 16
    for (let i = 0; i < 16; i++) s = commitRound(setAllCorrect(s, true));
    expect(() => setDeckSize(s, 32)).toThrow(/Deck size/);
    expect(setDeckSize(s, 52).setup.deckSize).toBe(52); // peak 13 -> 25 rounds, 16 ok
  });
});

describe("rematch", () => {
  it("same players/seats/deck/cap, no rounds, giver = first seat", () => {
    let s = mk(3, 52, 4);
    s = reorderSeats(s, ["c", "a", "b"]);
    s = commitRound(setAllCorrect(s, true));
    const r = rematch(s);
    expect(r.rounds).toEqual([]);
    expect(r.current).toEqual({ bids: {}, correct: {} });
    expect(r.currentGiverId).toBe("c");
    expect(r.setup).toEqual(s.setup);
  });
});

describe("immutability", () => {
  it("never mutates frozen inputs", () => {
    let s = deepFreeze(mk());
    s = deepFreeze(setBid(s, "a", 1));
    s = deepFreeze(setCorrect(s, "a", true));
    s = deepFreeze(setAllCorrect(s, true));
    expect(() => deriveMatch(s)).not.toThrow();
    s = deepFreeze(commitRound(s));
    s = deepFreeze(correctRound(s, 0, "a", { bid: 2, correct: false }));
    s = deepFreeze(reorderSeats(s, ["d", "c", "b", "a"]));
    s = deepFreeze(setGiver(s, "b"));
    s = deepFreeze(setDeckSize(s, 52));
    s = deepFreeze(resetCurrentRound(s));
    const u = deepFreeze(undoRound(s));
    expect(() => rematch(u)).not.toThrow();
    expect(() => undoRound(deepFreeze(commitRound(setAllCorrect(u, true))))).not.toThrow();
  });
});

describe("variants", () => {
  const withRules = (s: MatchState, patch: { repeatPeak?: boolean; firstBidder?: "giver" | "afterGiver" }): MatchState => ({
    ...s,
    rules: {
      ...s.rules,
      rounds: { ...s.rules.rounds, repeatPeak: patch.repeatPeak ?? s.rules.rounds.repeatPeak },
      bidding: { ...s.rules.bidding, firstBidder: patch.firstBidder ?? s.rules.bidding.firstBidder },
    },
  });

  it("repeatPeak plays the peak hand size twice", () => {
    const s = withRules(mk(4, 32, 3), { repeatPeak: true });
    expect(roundPlan(s.rules, { deckSize: 32, maxCards: 3, playerCount: 4 })).toEqual([1, 2, 3, 3, 2, 1]);
    expect(deriveMatch(s).totalRounds).toBe(6);
    const asc = { ...s.rules, rounds: { ...s.rules.rounds, schedule: "ascending" as const } };
    expect(roundPlan(asc, { deckSize: 32, maxCards: 3, playerCount: 4 })).toEqual([1, 2, 3, 3]);
    const desc = { ...s.rules, rounds: { ...s.rules.rounds, schedule: "descending" as const } };
    expect(roundPlan(desc, { deckSize: 32, maxCards: 3, playerCount: 4 })).toEqual([3, 3, 2, 1]);
  });

  it("without repeatPeak the pyramid is unchanged", () => {
    expect(roundPlan(mk().rules, { deckSize: 32, maxCards: 3, playerCount: 4 })).toEqual([1, 2, 3, 2, 1]);
  });

  it("firstBidder: giver bids first by default, afterGiver = next seat", () => {
    const s = mk();
    expect(deriveMatch(s).bidderId).toBe("a");
    const after = withRules(s, { firstBidder: "afterGiver" });
    expect(deriveMatch(after).bidderId).toBe("b");
    expect(deriveMatch(setGiver(after, "d")).bidderId).toBe("a");
  });

  it("states without variant fields behave like the defaults", () => {
    const s = mk();
    const legacy = JSON.parse(JSON.stringify(s)) as MatchState;
    delete (legacy.rules.rounds as Partial<MatchState["rules"]["rounds"]>).repeatPeak;
    delete (legacy.rules.bidding as Partial<MatchState["rules"]["bidding"]>).firstBidder;
    expect(deriveMatch(legacy).totalRounds).toBe(deriveMatch(s).totalRounds);
    expect(deriveMatch(legacy).bidderId).toBe("a");
  });
});
