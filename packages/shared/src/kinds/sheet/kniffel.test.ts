import { describe, expect, it } from "vitest";
import { KNIFFEL_RULES, KNIFFEL_RULESETS } from "../../games/kniffel";
import { createMatch, deriveMatch } from "../../match";
import { matchResults } from "../../stats";
import { isPossibleScore, scoreDice } from "./dice";
import { clearEntry, correctEntry, createSheetMatch, deriveSheetMatch, previewDice, scoreEntry, undoEntry } from "./engine";
import { sheetCategories, sheetRulesSchema, type SheetRules } from "./rules";
import type { SheetMatchState } from "./types";

const players = ["a", "b"].map((id) => ({ id, name: id.toUpperCase(), userId: null }));
const ref = { gameId: "kniffel", ruleset: { id: "kniffel.standard", name: "Standard" } };
const kniffel = (rules: SheetRules = KNIFFEL_RULES): SheetMatchState => createSheetMatch({ players }, { ...ref, rules });
const cat = (id: string) => sheetCategories(KNIFFEL_RULES).find((c) => c.id === id)!.scoring;

describe("dice scoring", () => {
  it("upper section and pasch", () => {
    expect(scoreDice(cat("dreier"), [3, 3, 1, 3, 6])).toBe(9);
    expect(scoreDice(cat("dreierpasch"), [3, 3, 1, 3, 6])).toBe(16);
    expect(scoreDice(cat("viererpasch"), [3, 3, 1, 3, 6])).toBe(0);
    expect(scoreDice(cat("kniffel"), [4, 4, 4, 4, 4])).toBe(50);
    expect(scoreDice(cat("chance"), [1, 2, 3, 4, 6])).toBe(16);
  });
  it("full house and straights", () => {
    expect(scoreDice(cat("fullhouse"), [2, 5, 2, 5, 5])).toBe(25);
    expect(scoreDice(cat("fullhouse"), [5, 5, 5, 5, 5])).toBe(0); // no joker
    expect(scoreDice(cat("fullhouse"), [5, 5, 5, 5, 5], true)).toBe(25);
    expect(scoreDice(cat("kleine-strasse"), [6, 3, 4, 5, 5])).toBe(30);
    expect(scoreDice(cat("kleine-strasse"), [1, 2, 4, 5, 6])).toBe(0);
    expect(scoreDice(cat("grosse-strasse"), [2, 3, 4, 5, 6])).toBe(40);
  });
  it("possible scores without dice", () => {
    const dice = KNIFFEL_RULES.dice;
    expect(isPossibleScore(cat("vierer"), dice, 12)).toBe(true);
    expect(isPossibleScore(cat("vierer"), dice, 13)).toBe(false);
    expect(isPossibleScore(cat("vierer"), dice, 24)).toBe(false);
    expect(isPossibleScore(cat("fullhouse"), dice, 25)).toBe(true);
    expect(isPossibleScore(cat("fullhouse"), dice, 20)).toBe(false);
    expect(isPossibleScore(cat("dreierpasch"), dice, 0)).toBe(true);
    expect(isPossibleScore(cat("dreierpasch"), dice, 31)).toBe(false);
    expect(isPossibleScore(cat("chance"), dice, 4)).toBe(false);
  });
});

describe("kniffel match", () => {
  it("computes points from dice, sums, upper bonus, turn order", () => {
    let s = kniffel();
    expect(deriveSheetMatch(s).activePlayerId).toBe("a");
    s = scoreEntry(s, { playerId: "a", categoryId: "sechser", dice: [6, 6, 6, 6, 2] });
    expect(deriveSheetMatch(s).activePlayerId).toBe("b");
    s = scoreEntry(s, { playerId: "b", categoryId: "chance", points: 22 });
    for (const [id, pts] of [["einser", 3], ["zweier", 6], ["dreier", 9], ["vierer", 12], ["fuenfer", 15]] as const) {
      s = scoreEntry(s, { playerId: "a", categoryId: id, points: pts });
    }
    const d = deriveSheetMatch(s);
    const a = d.players[0]!;
    expect(a.columns[0]!.cells.sechser?.points).toBe(24);
    expect(a.columns[0]!.sections[0]).toMatchObject({ sum: 69, bonuses: ["bonus"], bonusPoints: 35, total: 104, filled: true });
    expect(a.total).toBe(104);
    expect(a.placement).toBe(1);
    expect(d.players[1]!.placement).toBe(2);
    expect(d.roundsPlayed).toBe(1);
    expect(d.roundNumber).toBe(2);
    expect(d.totalRounds).toBe(13);
    expect(d.activePlayerId).toBe("b");
  });

  it("rejects filled cells, impossible points and mismatching dice", () => {
    let s = scoreEntry(kniffel(), { playerId: "a", categoryId: "einser", points: 2 });
    expect(() => scoreEntry(s, { playerId: "a", categoryId: "einser", points: 1 })).toThrow(/already filled/);
    expect(() => scoreEntry(s, { playerId: "a", categoryId: "fullhouse", points: 24 })).toThrow(/not a possible/);
    expect(() => scoreEntry(s, { playerId: "a", categoryId: "zweier", dice: [2, 2, 1, 1, 1], points: 6 })).toThrow(/match the dice/);
    expect(() => scoreEntry(s, { playerId: "a", categoryId: "zweier", dice: [2, 2, 1, 1] })).toThrow(/5 dice/);
    expect(() => scoreEntry(s, { playerId: "x", categoryId: "zweier", points: 2 })).toThrow(/Unknown player/);
    s = undoEntry(s);
    expect(s.entries).toHaveLength(0);
  });

  it("a full game finishes and yields results", () => {
    let s = createMatch(KNIFFEL_RULESETS[0]!, players) as SheetMatchState;
    for (const c of sheetCategories(KNIFFEL_RULES)) {
      s = scoreEntry(s, { playerId: "a", categoryId: c.id, points: 0 });
      s = scoreEntry(s, { playerId: "b", categoryId: c.id, dice: [1, 1, 1, 1, 1] });
    }
    const d = deriveMatch(s);
    expect(d.finished).toBe(true);
    expect(d.activePlayerId).toBe("");
    // b: einser 5, 3er/4er pasch 5+5, kniffel 50, chance 5
    expect(d.players.map((p) => p.total)).toEqual([0, 70]);
    const res = matchResults("m", s);
    expect(res.map((r) => [r.gameId, r.placement, r.rounds, r.correctRounds])).toEqual([
      ["kniffel", 2, 13, undefined],
      ["kniffel", 1, 13, undefined],
    ]);
  });

  it("correction re-validates later entries", () => {
    const rules = KNIFFEL_RULESETS.find((r) => r.id === "kniffel.joker")!.rules;
    let s = kniffel(rules);
    s = scoreEntry(s, { playerId: "a", categoryId: "kniffel", dice: [3, 3, 3, 3, 3] });
    s = scoreEntry(s, { playerId: "a", categoryId: "dreier", dice: [3, 3, 3, 3, 3] });
    expect(deriveSheetMatch(s).players[0]!.columns[0]!.repeatBonusPoints).toBe(100);
    // striking the Kniffel to 0 removes the bonus (joker still valid)
    s = correctEntry(s, 0, { points: 0 });
    expect(deriveSheetMatch(s).players[0]!.columns[0]!.repeatBonusPoints).toBe(0);
    // removing the Kniffel entry entirely is fine too
    expect(clearEntry(s, 0).entries).toHaveLength(1);
  });

  it("top-down fill order", () => {
    const s = kniffel({ ...KNIFFEL_RULES, fillOrder: "topDown" });
    expect(() => scoreEntry(s, { playerId: "a", categoryId: "zweier", points: 4 })).toThrow(/top-down/);
    expect(scoreEntry(s, { playerId: "a", categoryId: "einser", points: 1 }).entries).toHaveLength(1);
  });

  it("columns with multipliers", () => {
    const rules: SheetRules = { ...KNIFFEL_RULES, columns: [{ label: "×1", multiplier: 1 }, { label: "×2", multiplier: 2 }] };
    let s = kniffel(rules);
    s = scoreEntry(s, { playerId: "a", categoryId: "chance", column: 1, points: 20 });
    s = scoreEntry(s, { playerId: "a", categoryId: "chance", column: 0, points: 10 });
    const a = deriveSheetMatch(s).players[0]!;
    expect(a.columns.map((c) => c.total)).toEqual([10, 40]);
    expect(a.total).toBe(50);
    expect(deriveSheetMatch(s).totalRounds).toBe(26);
  });
});

describe("repeat bonus & joker", () => {
  const joker = KNIFFEL_RULESETS.find((r) => r.id === "kniffel.joker")!.rules;

  it("forced joker: upper category first, then full points elsewhere", () => {
    let s = kniffel(joker);
    s = scoreEntry(s, { playerId: "a", categoryId: "kniffel", dice: [5, 5, 5, 5, 5] });
    expect(() => scoreEntry(s, { playerId: "a", categoryId: "grosse-strasse", dice: [5, 5, 5, 5, 5] })).toThrow(/Fünfer/);
    s = scoreEntry(s, { playerId: "a", categoryId: "fuenfer", dice: [5, 5, 5, 5, 5] });
    s = scoreEntry(s, { playerId: "a", categoryId: "grosse-strasse", dice: [5, 5, 5, 5, 5] });
    const col = deriveSheetMatch(s).players[0]!.columns[0]!;
    expect(col.cells["grosse-strasse"]?.points).toBe(40);
    expect(col.repeatBonusPoints).toBe(200);
  });

  it("no joker / no bonus in the standard rules", () => {
    let s = kniffel();
    s = scoreEntry(s, { playerId: "a", categoryId: "kniffel", dice: [5, 5, 5, 5, 5] });
    s = scoreEntry(s, { playerId: "a", categoryId: "grosse-strasse", dice: [5, 5, 5, 5, 5] });
    const col = deriveSheetMatch(s).players[0]!.columns[0]!;
    expect(col.cells["grosse-strasse"]?.points).toBe(0);
    expect(col.repeatBonusPoints).toBe(0);
    expect(() => scoreEntry(s, { playerId: "a", categoryId: "chance", points: 25, repeat: true })).toThrow(/Repeat bonus/);
  });

  it("previewDice shows selectable categories with joker points", () => {
    let s = kniffel(joker);
    s = scoreEntry(s, { playerId: "a", categoryId: "kniffel", dice: [2, 2, 2, 2, 2] });
    expect(Object.keys(previewDice(s, "a", 0, [2, 2, 2, 2, 2]))).toEqual(["zweier"]);
    s = scoreEntry(s, { playerId: "a", categoryId: "zweier", points: 10, repeat: true });
    const p = previewDice(s, "a", 0, [2, 2, 2, 2, 2]);
    expect(p.fullhouse).toBe(25);
    expect(p.einser).toBe(0);
    expect(p.kniffel).toBeUndefined();
  });
});

describe("sheet rules validation", () => {
  it("accepts the built-ins", () => {
    for (const rs of KNIFFEL_RULESETS) expect(sheetRulesSchema.safeParse(rs.rules).success).toBe(true);
  });
  it("rejects inconsistent rules", () => {
    const bad = (patch: Partial<SheetRules>) => sheetRulesSchema.safeParse({ ...KNIFFEL_RULES, ...patch }).success;
    expect(bad({ dice: null })).toBe(false); // dice categories without dice
    expect(bad({ dice: { count: 3, faces: 6 } })).toBe(false); // 4/5 of a kind impossible
    expect(bad({ repeatBonus: { categoryId: "chance", points: 50, joker: "free" } })).toBe(false);
    const dup = KNIFFEL_RULES.sections.map((s) => ({ ...s, categories: [...s.categories, s.categories[0]!] }));
    expect(bad({ sections: dup })).toBe(false);
  });
  it("manual-only sheets work without dice", () => {
    const rules: SheetRules = {
      ...KNIFFEL_RULES,
      dice: null,
      repeatBonus: null,
      sections: [{ id: "s", label: "S", bonuses: [], categories: [{ id: "x", label: "X", scoring: { type: "manual", min: -50, max: 50, step: 5 } }] }],
    };
    expect(sheetRulesSchema.safeParse(rules).success).toBe(true);
    const s = kniffel(rules);
    expect(() => scoreEntry(s, { playerId: "a", categoryId: "x", points: 3 })).toThrow();
    expect(deriveSheetMatch(scoreEntry(s, { playerId: "a", categoryId: "x", points: -15 })).players[0]!.total).toBe(-15);
  });
});
