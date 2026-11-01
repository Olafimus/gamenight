import { beforeEach, describe, expect, it } from "vitest";
import { useLocalHistory, type LocalMatchRecord } from "./localHistory";

const rec = (matchId: string, score = 10): LocalMatchRecord => ({
  matchId,
  code: "ABCDE",
  startedAt: "2025-01-01T10:00:00Z",
  finishedAt: "2025-01-01T11:00:00Z",
  players: [{ name: "Anna", userId: null, finalScore: score, placement: 1 }],
});

describe("localHistory", () => {
  beforeEach(() => useLocalHistory.getState().clear());

  it("dedupes played matches by matchId (replacing the record)", () => {
    const { addPlayedMatch } = useLocalHistory.getState();
    addPlayedMatch(rec("m1", 10));
    addPlayedMatch(rec("m2"));
    addPlayedMatch(rec("m1", 99));
    const matches = useLocalHistory.getState().playedMatches;
    expect(matches).toHaveLength(2);
    expect(matches.find((m) => m.matchId === "m1")?.players[0]?.finalScore).toBe(99);
  });

  it("keeps known players unique and most recent first", () => {
    const { addKnownPlayer } = useLocalHistory.getState();
    addKnownPlayer({ name: "Anna", userId: null });
    addKnownPlayer({ name: "Ben", userId: null });
    addKnownPlayer({ name: "anna", userId: null });
    expect(useLocalHistory.getState().knownPlayers.map((p) => p.name)).toEqual(["anna", "Ben"]);
  });

  it("persists under the documented key and clears", () => {
    useLocalHistory.getState().addKnownPlayer({ name: "Cleo", userId: "u1" });
    expect(localStorage.getItem("scheisse.history.v1")).toContain("Cleo");
    useLocalHistory.getState().clear();
    expect(useLocalHistory.getState().knownPlayers).toEqual([]);
  });
});
