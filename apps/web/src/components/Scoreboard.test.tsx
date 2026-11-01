import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DerivedMatch, DerivedPlayer } from "@scheisse/shared";
import { Scoreboard } from "./Scoreboard";

const stats = {
  onWinStreak: false, winStreak: 0, maxWinStreak: 0, loseStreak: 0, maxLoseStreak: 0,
  firstPlaces: 0, lastPlaces: 0, maxCalledStiche: 0, maxWonStiche: 0,
};

function player(id: string, name: string, seat: number, p: Partial<DerivedPlayer>): DerivedPlayer {
  return {
    id, name, userId: null, seat, bids: [], correct: [], roundPoints: [], scores: [], total: 0,
    placements: [], placement: null, stats, ...p,
  };
}

const match: DerivedMatch = {
  players: [
    player("a", "Anna", 0, { bids: [1, 0], correct: [true, false], scores: [11, 1], placements: [1, 2], total: 1, placement: 2 }),
    player("b", "Ben", 1, { bids: [0, 1], correct: [false, true], scores: [-10, 0], placements: [2, 3], total: 0, placement: 3 }),
    player("c", "Cleo", 2, { bids: [0, 0], correct: [true, true], scores: [10, 20], placements: [3, 1], total: 20, placement: 1 }),
  ],
  peak: 3, totalRounds: 5, roundsPlayed: 2, roundNumber: 3, cardsThisRound: 3,
  giverId: "c", giverName: "Cleo", calledSum: 0, sumMatchesCards: false, allMarked: false, finished: false,
};

describe("Scoreboard", () => {
  it("renders bids, cumulative scores and medal colours by placement", () => {
    render(<Scoreboard match={match} />);
    expect(screen.getByText("Anna")).toBeInTheDocument();
    const first = screen.getByTestId("cell-0-a");
    expect(first).toHaveTextContent("1");
    expect(first).toHaveTextContent("11");
    expect(first).toHaveAttribute("data-placement", "1");
    expect(first.className).toMatch(/gold/);
    expect(screen.getByTestId("cell-0-b").className).toMatch(/silver/);
    expect(screen.getByTestId("cell-0-c").className).toMatch(/bronze/);
    expect(screen.getByTestId("cell-1-c").className).toMatch(/gold/);
  });

  it("shows right/wrong colouring and handles clicks in correction mode", () => {
    const onCellClick = vi.fn();
    render(<Scoreboard match={match} correctionMode onCellClick={onCellClick} />);
    expect(screen.getByTestId("cell-0-a")).toHaveAttribute("data-correct", "true");
    expect(screen.getByTestId("cell-0-b")).toHaveAttribute("data-correct", "false");
    expect(screen.getByTestId("cell-0-a").className).toMatch(/right/);
    expect(screen.getByTestId("cell-0-b").className).toMatch(/wrong/);
    fireEvent.click(screen.getByRole("button", { name: /Runde 2, Ben/ }));
    expect(onCellClick).toHaveBeenCalledWith(1, "b");
  });

  it("is not clickable outside correction mode", () => {
    render(<Scoreboard match={match} onCellClick={vi.fn()} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
