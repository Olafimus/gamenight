import { describe, expect, it } from "vitest";
import { commitRound, createMatchState, setAllCorrect, setBid, setCorrect } from "./kinds/trick/engine";
import {
  aggregateByPlayerCount,
  aggregateResults,
  calcMatchRating,
  matchResults,
  versusTable,
} from "./stats";
import type { TrickMatchState as MatchState } from "./kinds/trick/types";
import type { PlayerMatchResult } from "./stats";

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
}

function finishedMatch(): MatchState {
  let s = createMatchState({
    players: [
      { id: "a", name: "A", userId: "u1" },
      { id: "b", name: "B", userId: null },
      { id: "c", name: "C", userId: "u3" },
    ],
    deckSize: 32,
    maxCards: 1, // 1 round
  });
  s = setBid(s, "a", 1);
  s = setCorrect(s, "a", true); // 11
  s = setCorrect(s, "b", false); // -10
  s = setCorrect(s, "c", false); // -10
  return commitRound(s);
}

function res(over: Partial<PlayerMatchResult>): PlayerMatchResult {
  const base: PlayerMatchResult = {
    matchId: "m1",
    gameId: "scheisse",
    playerId: "p",
    userId: "u1",
    name: "A",
    finalScore: 0,
    placement: 1,
    playerCount: 3,
    rounds: 1,
    avgScore: 0,
    rating: 0,
  };
  return { ...base, ...over };
}

describe("calcMatchRating", () => {
  it("formula", () => {
    expect(calcMatchRating(1, 4, 20)).toBeCloseTo(1 + 0.4 + 0.2);
    expect(calcMatchRating(2, 3, -10)).toBeCloseTo(0.5 + 0.3 - 0.1);
  });
});

describe("matchResults", () => {
  it("throws if unfinished", () => {
    const s = createMatchState({
      players: [
        { id: "a", name: "A", userId: null },
        { id: "b", name: "B", userId: null },
      ],
      deckSize: 32,
      maxCards: null,
    });
    expect(() => matchResults("m", s)).toThrow(/not finished/);
  });
  it("computes results with ties and rating", () => {
    const r = matchResults("m1", deepFreeze(finishedMatch()));
    expect(r).toHaveLength(3);
    const a = r[0]!;
    expect(a).toMatchObject({ matchId: "m1", playerId: "a", userId: "u1", name: "A", finalScore: 11, placement: 1, playerCount: 3, rounds: 1, avgScore: 11 });
    expect(a.rating).toBeCloseTo(1 + 0.3 + 0.11);
    expect(r[1]!.placement).toBe(2);
    expect(r[2]!.placement).toBe(2);
    expect(r[1]!.userId).toBeNull();
    expect(r[1]!.rating).toBeCloseTo(0.5 + 0.3 - 0.1);
  });
  it("avgScore divides by rounds", () => {
    let s = createMatchState({
      players: [
        { id: "a", name: "A", userId: null },
        { id: "b", name: "B", userId: null },
      ],
      deckSize: 32,
      maxCards: 2, // 3 rounds
    });
    for (let i = 0; i < 3; i++) s = commitRound(setCorrect(setCorrect(s, "a", true), "b", false));
    const r = matchResults("x", s);
    expect(r[0]!.finalScore).toBe(30);
    expect(r[0]!.rounds).toBe(3);
    expect(r[0]!.avgScore).toBe(10);
    expect(r[1]!.avgScore).toBeCloseTo(-10);
  });
  it("all tied -> all rank 1", () => {
    const s = commitRound(setAllCorrect(createMatchState({
      players: [
        { id: "a", name: "A", userId: null },
        { id: "b", name: "B", userId: null },
      ],
      deckSize: 32,
      maxCards: 1,
    }), true));
    expect(matchResults("x", s).map((r) => r.placement)).toEqual([1, 1]);
  });
});

describe("aggregates", () => {
  const results = [
    res({ matchId: "1", placement: 1, playerCount: 3, avgScore: 10, rating: 2 }),
    res({ matchId: "2", placement: 2, playerCount: 3, avgScore: 0, rating: 1 }),
    res({ matchId: "3", placement: 1, playerCount: 4, avgScore: 20, rating: 3 }),
  ];
  it("empty", () => {
    expect(aggregateResults([])).toEqual({ matchCount: 0, firstPlaces: 0, winRate: 0, averagePoints: 0, averageRating: 0, placements: {} });
    expect(aggregateByPlayerCount([])).toEqual({});
  });
  it("overall", () => {
    const a = aggregateResults(deepFreeze([...results]));
    expect(a.matchCount).toBe(3);
    expect(a.firstPlaces).toBe(2);
    expect(a.winRate).toBeCloseTo(2 / 3);
    expect(a.averagePoints).toBeCloseTo(10);
    expect(a.averageRating).toBeCloseTo(2);
    expect(a.placements).toEqual({ 1: 2, 2: 1 });
  });
  it("by player count counts first match", () => {
    const b = aggregateByPlayerCount(results);
    expect(Object.keys(b).sort()).toEqual(["3", "4"]);
    expect(b[3]!.matchCount).toBe(2);
    expect(b[3]!.firstPlaces).toBe(1);
    expect(b[3]!.winRate).toBe(0.5);
    expect(b[4]!).toMatchObject({ matchCount: 1, firstPlaces: 1, winRate: 1, averagePoints: 20, averageRating: 3 });
    expect(b[4]!.placements).toEqual({ 1: 1 });
  });
});

describe("versusTable", () => {
  const subject = [
    res({ matchId: "1", playerId: "s1", userId: "me", name: "Me", placement: 1 }),
    res({ matchId: "2", playerId: "s2", userId: "me", name: "Me", placement: 2 }),
    res({ matchId: "3", playerId: "s3", userId: "me", name: "Me", placement: 1 }),
  ];
  const all = [
    ...subject,
    res({ matchId: "1", playerId: "x1", userId: "u2", name: "Zed", placement: 2 }),
    res({ matchId: "1", playerId: "g1", userId: null, name: "Gast", placement: 3 }),
    res({ matchId: "2", playerId: "x2", userId: "u2", name: "Zed", placement: 1 }),
    res({ matchId: "2", playerId: "g2", userId: null, name: "gast", placement: 3 }),
    res({ matchId: "3", playerId: "x3", userId: "u9", name: "Anna", placement: 2 }),
    res({ matchId: "3", playerId: "g3", userId: null, name: "GAST", placement: 3 }),
  ];
  it("groups, excludes subject, counts subject wins, sorts", () => {
    const v = versusTable(deepFreeze([...subject]), deepFreeze([...all]));
    expect(v.map((e) => e.name)).toEqual(["Gast", "Zed", "Anna"]);
    expect(v[0]).toMatchObject({ userId: null, matches: 3, wins: 2 });
    expect(v[1]).toMatchObject({ userId: "u2", matches: 2, wins: 1 });
    expect(v[2]).toMatchObject({ userId: "u9", matches: 1, wins: 1 });
    expect(v.some((e) => e.userId === "me")).toBe(false);
  });
  it("ties sorted by name", () => {
    const v = versusTable(
      [subject[0]!],
      [subject[0]!, res({ matchId: "1", playerId: "q", userId: "u5", name: "Bob" }), res({ matchId: "1", playerId: "r", userId: "u6", name: "Al" })],
    );
    expect(v.map((e) => e.name)).toEqual(["Al", "Bob"]);
  });
  it("empty", () => {
    expect(versusTable([], [])).toEqual([]);
  });
});
