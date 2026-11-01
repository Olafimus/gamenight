import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { LeaderboardEntryDto, LeaderboardResponse } from "@scheisse/shared";
import { fmt1, fmtPercent, fmtPp, fmtSigned, filterLeaderboard, sortEntries } from "./leaderboardUtils";
import { Leaderboard } from "./Leaderboard";

const e = (name: string, p: Partial<LeaderboardEntryDto>): LeaderboardEntryDto => ({
  kind: "user",
  key: name,
  userId: name,
  name,
  provisional: false,
  rank: 0,
  elo: 1000,
  eloDelta: 0,
  matchCount: 5,
  wins: 0,
  winRate: 0,
  expectedWinRate: 0.25,
  placementScore: 0.5,
  avgPoints: 0,
  hitRate: 0.5,
  form: [1, 0.5, 0],
  ...p,
});
const data = [
  e("Anna", { elo: 1100, rank: 2, winRate: 0.5, avgPoints: 3, matchCount: 6 }),
  e("Ben", { elo: 1200, rank: 1, winRate: 0.2, avgPoints: 1, matchCount: 9 }),
  e("Gus", { kind: "guest", key: "g:gus", userId: null, elo: 1500, provisional: true, matchCount: 1, winRate: 1 }),
  e("Cleo", { elo: 1050, rank: 3, winRate: 0.9, avgPoints: 8, matchCount: 4 }),
];
const response: LeaderboardResponse = {
  category: "gesamt",
  period: "all",
  categories: [
    { id: "gesamt", label: "Gesamt", matchCount: 12 },
    { id: "klein", label: "Kleine Runden (2–3)", matchCount: 7 },
    { id: "2", label: "Duell (2 Spieler)", matchCount: 3 },
    { id: "3", label: "Dreierrunde", matchCount: 4 },
  ],
  entries: data,
};

describe("leaderboard helpers", () => {
  it("sorts by metric, direction, keeping provisional last", () => {
    expect(sortEntries(data, "elo").map((x) => x.name)).toEqual(["Ben", "Anna", "Cleo", "Gus"]);
    expect(sortEntries(data, "elo", "asc").map((x) => x.name)).toEqual(["Cleo", "Anna", "Ben", "Gus"]);
    expect(sortEntries(data, "winRate").map((x) => x.name)).toEqual(["Cleo", "Anna", "Ben", "Gus"]);
    expect(data[0]?.name).toBe("Anna");
  });
  it("filters by substring case-insensitively", () => {
    expect(filterLeaderboard(data, " EN ").map((x) => x.name)).toEqual(["Ben"]);
    expect(filterLeaderboard(data, "")).toHaveLength(4);
  });
  it("formats numbers", () => {
    expect(fmt1(1.5)).toBe("1,5");
    expect(fmtPercent(0.5)).toContain("50");
    expect(fmtSigned(12.4)).toBe("+12");
    expect(fmtSigned(-4.6)).toBe("−5");
    expect(fmtSigned(0.2)).toBe("±0");
    expect(fmtPp(0.42, 0.25)).toBe("+17 pp");
  });
});

describe("Leaderboard", () => {
  afterEach(() => vi.unstubAllGlobals());

  function setup() {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(response), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <Leaderboard />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    return fetchMock;
  }
  const names = () => screen.getAllByTestId("lb-name").map((n) => n.querySelector("span")!.textContent);

  it("shows labelled category chips only for categories with data and requests the chosen one", async () => {
    const fetchMock = setup();
    await waitFor(() => expect(screen.getAllByText("Ben").length).toBeGreaterThan(0));
    for (const label of ["Gesamt", "Kleine Runden (2–3)", "Duell (2 Spieler)", "Dreierrunde"]) {
      expect(screen.getByRole("button", { name: (n) => n.startsWith(`${label},`) })).toBeInTheDocument();
    }
    expect(screen.getByText("Duell")).toBeInTheDocument(); // short label for phones
    expect(screen.queryByText("Viererrunde")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Dreierrunde/ }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String((c as unknown[])[0]).includes("category=3"))).toBe(true));
  });

  it("lists provisional players last, sorts on header click (toggle direction) and can hide provisional", async () => {
    setup();
    await waitFor(() => expect(screen.getAllByText("Ben").length).toBeGreaterThan(0));
    expect(names()).toEqual(["Ben", "Anna", "Cleo", "Gus"]);
    expect(screen.getByText("vorläufig")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Nach Siegquote sortieren/ }));
    expect(names()).toEqual(["Cleo", "Anna", "Ben", "Gus"]);
    fireEvent.click(screen.getByRole("button", { name: /Nach Siegquote sortieren/ }));
    expect(names()).toEqual(["Ben", "Anna", "Cleo", "Gus"]);
    expect(screen.getAllByTestId("lb-name").find((n) => n.textContent?.startsWith("Gus"))!.closest("a")).toHaveAttribute("href", "/stats/guests/Gus");
    fireEvent.click(screen.getByLabelText("Vorläufige anzeigen"));
    expect(names()).toEqual(["Ben", "Anna", "Cleo"]);
  });
});
