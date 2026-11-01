import { describe, expect, it } from "vitest";
import { commitRound, createMatchState, setBid, setCorrect } from "@gamenight/shared";
import { CLOSED_HOLD_MS, buildWatchRows, liveRound, roundPhase } from "./watchTable";

const setup = {
  players: [
    { id: "a", name: "Anna", userId: null },
    { id: "b", name: "Ben", userId: null },
  ],
  deckSize: 32 as const,
  maxCards: null,
};

describe("buildWatchRows", () => {
  it("keeps seat order and neutral outcome before the first round", () => {
    const rows = buildWatchRows(createMatchState(setup));
    expect(rows.map((r) => r.name)).toEqual(["Anna", "Ben"]);
    expect(rows.every((r) => r.outcome === "neutral" && r.placement === null)).toBe(true);
  });

  it("sorts by placement and colours by last round", () => {
    let s = createMatchState(setup);
    s = setBid(s, "a", 1);
    s = setBid(s, "b", 0);
    s = setCorrect(s, "a", false);
    s = setCorrect(s, "b", true);
    s = commitRound(s);
    s = setBid(s, "a", 2);
    const rows = buildWatchRows(s);
    expect(rows[0]?.name).toBe("Ben");
    expect(rows[0]?.placement).toBe(1);
    expect(rows[0]?.outcome).toBe("right");
    expect(rows[1]?.outcome).toBe("wrong");
    expect(rows[1]?.bid).toBe(2);
    expect(rows[0]?.bid).toBeNull();
  });
});

describe("roundPhase / liveRound", () => {
  const committed = () => {
    let s = createMatchState(setup);
    s = setBid(s, "a", 1);
    s = setBid(s, "b", 0);
    s = setCorrect(s, "a", true);
    s = setCorrect(s, "b", false);
    return commitRound(s);
  };

  it("is pending (bidding) before anything happened", () => {
    expect(roundPhase(createMatchState(setup), null)).toBe("bidding");
  });

  it("shows the closed round for a while, then falls back to pending", () => {
    const s = committed();
    expect(roundPhase(s, 1000)).toBe("closed");
    expect(roundPhase(s, CLOSED_HOLD_MS + 1)).toBe("bidding");
    expect(roundPhase(s, null)).toBe("bidding");
    const lr = liveRound(s, "closed");
    expect(lr.round).toBe(1);
    expect(lr.rows.map((r) => [r.name, r.bid, r.correct, r.isGiver])).toEqual([
      ["Anna", 1, true, true],
      ["Ben", 0, false, false],
    ]);
    expect(lr.rows[0]?.points).toBe(11);
  });

  it("switches to pending as soon as the first bid of the next round arrives", () => {
    const s = setBid(committed(), "a", 0);
    expect(roundPhase(s, 500)).toBe("bidding");
    const lr = liveRound(s, "bidding");
    expect(lr.round).toBe(2);
    // Ben gives round 2 and bids first
    expect(lr.rows.map((r) => [r.name, r.bid])).toEqual([
      ["Ben", null],
      ["Anna", 0],
    ]);
    expect(roundPhase(setCorrect(s, "a", true), 500)).toBe("marking");
  });
});
