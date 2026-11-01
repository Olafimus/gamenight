import { describe, expect, it } from "vitest";
import {
  categoriesOf,
  compareByElo,
  computeElo,
  periodCutoff,
  placementScore,
  scopeMetrics,
  STATS_CATEGORIES,
  type SubjectMatchRow,
} from "./elo";

const m = (matchId: string, at: string, placements: Record<string, number>) => ({
  matchId,
  at,
  players: Object.entries(placements).map(([key, placement]) => ({ key, placement })),
});

describe("computeElo", () => {
  it("duel from 1000/1000 moves +-16 (K = 32)", () => {
    const r = computeElo([m("m1", "2026-01-01T00:00:00Z", { a: 1, b: 2 })]);
    expect(r.ratings.get("a")).toBeCloseTo(1016);
    expect(r.ratings.get("b")).toBeCloseTo(984);
  });

  it("is zero-sum per match for any size and with ties", () => {
    const r = computeElo([
      m("m1", "2026-01-01T00:00:00Z", { a: 1, b: 2, c: 3, d: 4, e: 5 }),
      m("m2", "2026-01-02T00:00:00Z", { a: 3, b: 1, c: 1, d: 4 }),
    ]);
    for (const d of r.deltas.values()) expect([...d.values()].reduce((x, y) => x + y, 0)).toBeCloseTo(0, 9);
  });

  it("a tie between equal ratings changes nothing", () => {
    const r = computeElo([m("m1", "2026-01-01T00:00:00Z", { a: 1, b: 1, c: 1 })]);
    for (const v of r.ratings.values()) expect(v).toBeCloseTo(1000);
  });

  it("scales K by 1/(n-1): winner of a 3-player match gets 2 pairs * 32/2 * 0.5 = 16", () => {
    const r = computeElo([m("m1", "2026-01-01T00:00:00Z", { a: 1, b: 2, c: 3 })]);
    expect(r.deltas.get("m1")!.get("a")).toBeCloseTo(16);
    expect(r.deltas.get("m1")!.get("b")).toBeCloseTo(0);
    expect(r.deltas.get("m1")!.get("c")).toBeCloseTo(-16);
  });

  it("applies deltas simultaneously (uses ratings from before the match)", () => {
    const first = computeElo([m("m0", "2026-01-01T00:00:00Z", { a: 1, b: 2 })]);
    const r = computeElo([
      m("m0", "2026-01-01T00:00:00Z", { a: 1, b: 2 }),
      m("m1", "2026-01-02T00:00:00Z", { a: 1, b: 2, c: 3 }),
    ]);
    const ra = first.ratings.get("a")!;
    const rb = first.ratings.get("b")!;
    const e = (x: number, y: number) => 1 / (1 + 10 ** ((y - x) / 400));
    const expectA = 16 * (1 - e(ra, rb)) + 16 * (1 - e(ra, 1000));
    expect(r.deltas.get("m1")!.get("a")).toBeCloseTo(expectA);
  });

  it("is chronological: input order irrelevant, ties on time broken by id", () => {
    const a = m("m1", "2026-01-01T00:00:00Z", { x: 1, y: 2 });
    const b = m("m2", "2026-01-02T00:00:00Z", { x: 2, y: 1 });
    expect(computeElo([b, a]).ratings.get("x")).toBeCloseTo(computeElo([a, b]).ratings.get("x")!);
    const s1 = m("a-id", "2026-01-01T00:00:00Z", { x: 1, y: 2 });
    const s2 = m("b-id", "2026-01-01T00:00:00Z", { x: 2, y: 1 });
    const h = computeElo([s2, s1]).history.get("x")!;
    expect(h.map((p) => p.matchId)).toEqual(["a-id", "b-id"]);
  });

  it("returns history per subject", () => {
    const r = computeElo([m("m1", "2026-01-01T00:00:00Z", { a: 1, b: 2 }), m("m2", "2026-01-02T00:00:00Z", { a: 1, b: 2 })]);
    expect(r.history.get("a")).toHaveLength(2);
    expect(r.history.get("a")![1]!.elo).toBe(r.ratings.get("a"));
  });

  it("merges duplicate keys in a match", () => {
    const r = computeElo([m("m1", "2026-01-01T00:00:00Z", {})]);
    expect(r.ratings.size).toBe(0);
    const r2 = computeElo([
      { matchId: "m", at: "2026-01-01T00:00:00Z", players: [{ key: "a", placement: 1 }, { key: "a", placement: 2 }, { key: "b", placement: 2 }] },
    ]);
    expect(r2.ratings.get("a")).toBeCloseTo(1016);
  });
});

describe("placementScore", () => {
  it("normalizes to 0..1", () => {
    expect(placementScore(1, 4)).toBe(1);
    expect(placementScore(4, 4)).toBe(0);
    expect(placementScore(2, 4)).toBeCloseTo(2 / 3);
    expect(placementScore(1, 2)).toBe(1);
  });
});

describe("scopeMetrics", () => {
  const row = (matchId: string, at: string, placement: number, playerCount: number, rounds: number, correct: number, avg: number): SubjectMatchRow => ({
    matchId,
    at,
    placement,
    playerCount,
    rounds,
    correctRounds: correct,
    avgScore: avg,
  });
  const rows = [
    row("a", "2026-01-01T00:00:00Z", 1, 4, 10, 8, 5),
    row("b", "2026-01-02T00:00:00Z", 4, 4, 10, 2, -3),
    row("c", "2026-01-03T00:00:00Z", 2, 2, 5, 3, 1),
  ];
  it("computes win rate vs expectation, placement, hit rate, delta", () => {
    const x = scopeMetrics(rows, (id) => (id === "a" ? 10 : -4));
    expect(x.matchCount).toBe(3);
    expect(x.wins).toBe(1);
    expect(x.winRate).toBeCloseTo(1 / 3);
    expect(x.expectedWinRate).toBeCloseTo((0.25 + 0.25 + 0.5) / 3);
    expect(x.placementScore).toBeCloseTo((1 + 0 + 0) / 3);
    expect(x.avgPoints).toBeCloseTo(1);
    expect(x.hitRate).toBeCloseTo(13 / 25);
    expect(x.eloDelta).toBeCloseTo(2);
    expect(x.provisional).toBe(false);
    expect(x.form).toEqual([1, 0, 0]);
    expect(x.placements).toEqual({ 1: 1, 4: 1, 2: 1 });
  });
  it("marks fewer than 3 matches provisional and handles empty", () => {
    expect(scopeMetrics(rows.slice(0, 2), () => 0).provisional).toBe(true);
    expect(scopeMetrics([], () => 0)).toMatchObject({ matchCount: 0, winRate: 0, hitRate: 0, form: [] });
  });
  it("keeps only the last 5 for form", () => {
    const many = Array.from({ length: 7 }, (_, i) => row(`m${i}`, `2026-01-0${i + 1}T00:00:00Z`, 1 + (i % 2), 2, 1, 1, 0));
    expect(scopeMetrics(many, () => 0).form).toHaveLength(5);
  });
});

describe("categories and ordering", () => {
  it("assigns categories per player count", () => {
    expect(categoriesOf(2)).toEqual(["gesamt", "klein", "2"]);
    expect(categoriesOf(5)).toEqual(["gesamt", "mittel", "5"]);
    expect(categoriesOf(8)).toEqual(["gesamt", "gross", "8"]);
    expect(STATS_CATEGORIES.find((c) => c.id === "3")!.label).toBe("Dreierrunde");
    expect(STATS_CATEGORIES.find((c) => c.id === "klein")!.label).toBe("Kleine Runden (2–3)");
  });
  it("period cutoff", () => {
    expect(periodCutoff("all", 1000)).toBeNull();
    expect(periodCutoff("30d", 30 * 86_400_000 + 5)).toBe(5);
  });
  it("lists provisional after ranked, regardless of elo", () => {
    const e = (name: string, elo: number, provisional: boolean) => ({ name, elo, provisional, matchCount: 1 });
    const sorted = [e("a", 1200, true), e("b", 1000, false), e("c", 1100, false)].sort(compareByElo);
    expect(sorted.map((x) => x.name)).toEqual(["c", "b", "a"]);
  });
});
