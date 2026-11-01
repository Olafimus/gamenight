import { describe, expect, it } from "vitest";
import { WIZARD_RULES, WIZARD_RULESETS } from "../../games/wizard";
import { createMatch } from "../../match";
import { matchResults } from "../../stats";
import {
  canCommitRound,
  commitBlocker,
  commitRound,
  correctRound,
  createMatchState,
  deriveTrickMatch,
  roundPlan,
  setBid,
  setTricks,
  undoRound,
} from "./engine";
import { trickRulesSchema, type TrickRules } from "./rules";
import type { TrickMatchState } from "./types";

const players = ["a", "b", "c"].map((id) => ({ id, name: id.toUpperCase(), userId: null }));
const wizard = (rules: TrickRules = WIZARD_RULES): TrickMatchState =>
  createMatchState({ players, deckSize: 60, maxCards: null }, undefined, { gameId: "wizard", ruleset: { id: "wizard.standard", name: "Standard" }, rules });

function play(s: TrickMatchState, bids: number[], tricks: number[]): TrickMatchState {
  s.setup.players.forEach((p, i) => {
    s = setBid(s, p.id, bids[i]!);
    s = setTricks(s, p.id, tricks[i]!);
  });
  return commitRound(s);
}

describe("round plans", () => {
  it("wizard: ascending 1..60/n", () => {
    expect(roundPlan(WIZARD_RULES, { deckSize: 60, maxCards: null, playerCount: 3 })).toHaveLength(20);
    expect(roundPlan(WIZARD_RULES, { deckSize: 60, maxCards: null, playerCount: 6 })).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
  it("descending and fixed", () => {
    expect(roundPlan({ ...WIZARD_RULES, rounds: { ...WIZARD_RULES.rounds, schedule: "descending" } }, { deckSize: 60, maxCards: 3, playerCount: 4 })).toEqual([3, 2, 1]);
    const fixed = { ...WIZARD_RULES, rounds: { schedule: "fixed" as const, fixedCards: 5, fixedRounds: 4, allowMaxCards: false, repeatPeak: false } };
    expect(roundPlan(fixed, { deckSize: 60, maxCards: null, playerCount: 4 })).toEqual([5, 5, 5, 5]);
  });
  it("maxCards is ignored when the rules don't allow it", () => {
    const rules = { ...WIZARD_RULES, rounds: { ...WIZARD_RULES.rounds, allowMaxCards: false, repeatPeak: false } };
    expect(roundPlan(rules, { deckSize: 60, maxCards: 3, playerCount: 3 })).toHaveLength(20);
  });
});

describe("wizard scoring", () => {
  it("right: 20 + 10/trick, wrong: −10 per trick off", () => {
    let s = wizard();
    s = play(s, [1, 0, 0], [1, 0, 0]); // round 1: 1 card
    s = play(s, [2, 0, 1], [0, 1, 1]); // round 2: 2 cards
    const d = deriveTrickMatch(s);
    expect(d.players.map((p) => p.roundPoints)).toEqual([
      [30, -20],
      [20, -10],
      [20, 30],
    ]);
    expect(d.players.map((p) => p.tricks)).toEqual([
      [1, 0],
      [0, 1],
      [0, 1],
    ]);
    expect(d.players.map((p) => p.correct[1])).toEqual([false, false, true]);
    expect(d.players.map((p) => p.total)).toEqual([10, 10, 50]);
    expect(d.players.map((p) => p.placement)).toEqual([2, 2, 1]);
  });

  it("tricks must add up to the cards", () => {
    let s = wizard();
    s = setTricks(setTricks(setTricks(s, "a", 1), "b", 1), "c", 0);
    expect(commitBlocker(s)).toBe("tricks_sum");
    expect(() => commitRound(s)).toThrow(/add up/);
    s = setTricks(s, "b", 0);
    expect(canCommitRound(s)).toBe(true);
  });

  it("variant: bids must not add up to the cards", () => {
    const rules = WIZARD_RULESETS.find((r) => r.id === "wizard.not-even")!.rules;
    let s = wizard(rules);
    s = setBid(setBid(setBid(s, "a", 1), "b", 0), "c", 0);
    s = setTricks(setTricks(setTricks(s, "a", 1), "b", 0), "c", 0);
    expect(deriveTrickMatch(s).bidSumAllowed).toBe(false);
    expect(commitBlocker(s)).toBe("bid_sum");
    s = setBid(s, "a", 0);
    expect(canCommitRound(s)).toBe(true);
  });

  it("undo restores tricks, correction re-derives hit", () => {
    let s = play(wizard(), [1, 0, 0], [1, 0, 0]);
    const undone = undoRound(s);
    expect(undone.current.tricks).toEqual({ a: 1, b: 0, c: 0 });
    s = correctRound(s, 0, "a", { tricks: 0 });
    expect(s.rounds[0]!.correct.a).toBe(false);
    expect(deriveTrickMatch(s).players[0]!.roundPoints).toEqual([-10]);
  });

  it("setTricks is rejected for hit-based rules", () => {
    const s = createMatchState({ players, deckSize: 32, maxCards: null });
    expect(() => setTricks(s, "a", 1)).toThrow();
  });

  it("results of a finished match", () => {
    const rules = { ...WIZARD_RULES, rounds: { schedule: "fixed" as const, fixedCards: 1, fixedRounds: 1, allowMaxCards: false, repeatPeak: false } };
    const s = play(wizard(rules), [1, 0, 1], [1, 0, 0]);
    const res = matchResults("m", s);
    expect(res.map((r) => [r.gameId, r.finalScore, r.placement, r.correctRounds])).toEqual([
      ["wizard", 30, 1, 1],
      ["wizard", 20, 2, 1],
      ["wizard", -10, 3, 0],
    ]);
  });

  it("createMatch enforces the player range of the ruleset", () => {
    const rs = WIZARD_RULESETS[0]!;
    expect(() => createMatch(rs, players.slice(0, 2))).toThrow(/at least 3/);
    expect(createMatch(rs, players).kind).toBe("trick-bidding");
  });
});

describe("trick rules validation", () => {
  it("accepts the built-ins", () => {
    expect(trickRulesSchema.safeParse(WIZARD_RULES).success).toBe(true);
  });
  it("rejects inconsistent rules", () => {
    const bad = (patch: Partial<TrickRules>) => trickRulesSchema.safeParse({ ...WIZARD_RULES, ...patch }).success;
    expect(bad({ entry: "hit" })).toBe(false); // missPerTrickDiff / tricksMustSumToCards need tricks
    expect(bad({ deck: { sizes: [60], defaultSize: 52 } })).toBe(false);
    expect(bad({ players: { min: 5, max: 4 } })).toBe(false);
    expect(bad({ rounds: { schedule: "fixed", fixedCards: null, fixedRounds: 3, allowMaxCards: false, repeatPeak: false } })).toBe(false);
  });
});
