import { describe, expect, it } from "vitest";
import { BUILTIN_RULESETS, GAMES, defaultRuleset } from "./games";
import { assertMatchConsistent, createMatch, deriveMatch, matchStateSchema, rematchMatch, upgradeMatchState } from "./match";
import { rulesetSchema } from "./ruleset";

const players = ["a", "b", "c"].map((id) => ({ id, name: id.toUpperCase(), userId: null }));

/** A state as stored by app version 1 (Scheisse only). */
const legacy = {
  setup: { players, deckSize: 32, maxCards: 3 },
  rounds: [{ giverId: "a", bids: { a: 1, b: 0, c: 0 }, correct: { a: true, b: false, c: true } }],
  current: { bids: { a: 1 }, correct: {} },
  currentGiverId: "b",
};

describe("catalog", () => {
  it("every game has a valid default ruleset of its kind", () => {
    for (const g of GAMES) {
      const rs = defaultRuleset(g.id);
      expect(rs.kind).toBe(g.kind);
      expect(rs.gameId).toBe(g.id);
    }
  });
  it("all built-in rulesets pass the schema and have unique ids", () => {
    for (const rs of BUILTIN_RULESETS) expect(rulesetSchema.safeParse(rs).success, rs.id).toBe(true);
    expect(new Set(BUILTIN_RULESETS.map((r) => r.id)).size).toBe(BUILTIN_RULESETS.length);
  });
});

describe("legacy states", () => {
  it("v1 states are upgraded to Scheisse standard", () => {
    const parsed = matchStateSchema.parse(legacy);
    expect(parsed.kind).toBe("trick-bidding");
    expect(parsed.gameId).toBe("scheisse");
    expect(parsed.ruleset.id).toBe("scheisse.standard");
    const d = deriveMatch(parsed);
    expect(d.totalRounds).toBe(5);
    expect(d.players.map((p) => p.total)).toEqual([11, -10, 10]);
  });
  it("current states pass through unchanged", () => {
    const s = createMatch(defaultRuleset("kniffel"), players);
    expect(upgradeMatchState(s)).toBe(s);
    expect(matchStateSchema.parse(s)).toEqual(s);
  });
  it("garbage is rejected", () => {
    expect(matchStateSchema.safeParse({ foo: 1 }).success).toBe(false);
    expect(matchStateSchema.safeParse({ ...legacy, kind: "chess" }).success).toBe(false);
  });
});

describe("generic match api", () => {
  it("creates, validates and rematches every built-in game", () => {
    for (const rs of BUILTIN_RULESETS) {
      const s = createMatch(rs, players.slice(0, Math.max(rs.rules.players.min, 3)));
      expect(() => assertMatchConsistent(s)).not.toThrow();
      expect(matchStateSchema.safeParse(s).success).toBe(true);
      const d = deriveMatch(s);
      expect(d.finished).toBe(false);
      expect(d.roundNumber).toBe(1);
      expect(rematchMatch(s)).toEqual(s);
    }
  });
  it("consistency check catches rule violations", () => {
    const s = createMatch(defaultRuleset("wizard"), players);
    const k = createMatch(defaultRuleset("kniffel"), players);
    if (s.kind !== "trick-bidding" || k.kind !== "score-sheet") throw new Error("unexpected kinds");
    expect(() => assertMatchConsistent({ ...s, setup: { ...s.setup, deckSize: 32 } })).toThrow(/deck size/);
    expect(() => assertMatchConsistent({ ...s, currentGiverId: "x" })).toThrow(/giver/i);
    expect(() => assertMatchConsistent({ ...k, entries: [{ playerId: "a", column: 0, categoryId: "einser", points: 7 }] })).toThrow();
  });
});
