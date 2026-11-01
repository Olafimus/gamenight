import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../ui";
import { useGameStore } from "./store";
import { PlayPage } from "./PlayPage";
import { SetupPage } from "./SetupPage";
import { CeremonyPage } from "./CeremonyPage";
import { TrickStatsPage as StatsPage } from "./StatsPage";
import { TrickScoreboardPage as ScoreboardPage } from "./ScoreboardPage";

vi.mock("../../lib/auth", () => ({ useAuth: () => ({ user: null, loading: false }) }));

const wrap = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );

const s = () => useGameStore.getState();

beforeEach(() => {
  window.localStorage.clear();
  s().endGame();
  useGameStore.setState({ setupDraft: { players: [], gameId: "scheisse", rulesetId: "scheisse.standard", deckSize: 32, maxCards: null, repeatPeak: false, firstBidder: "giver" } });
});

describe("setup page", () => {
  it("adds guests, rejects duplicates, enables start at 2 players", async () => {
    wrap(<SetupPage />);
    const start = screen.getByRole("button", { name: "Spiel starten" });
    expect(start).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Neu (Gast)" }));
    const input = screen.getByLabelText("Name des Gasts");
    for (const n of ["anna", "ben", "Anna"]) {
      fireEvent.change(input, { target: { value: n } });
      fireEvent.click(screen.getByRole("button", { name: "Gast hinzufügen" }));
      await act(async () => {
        await new Promise((r) => setTimeout(r, 30));
      });
    }
    expect(await screen.findByText("Spieler bereits hinzugefügt!")).toBeInTheDocument();
    expect(s().setupDraft.players.map((p) => p.name)).toEqual(["Anna", "Ben"]);
    expect(start).toBeEnabled();
    expect(screen.getByText("Runden")).toBeInTheDocument();
  });
});

describe("running game", () => {
  const begin = () => {
    s().addDraftPlayer({ name: "Anna", userId: null });
    s().addDraftPlayer({ name: "Ben", userId: null });
    s().startMatch();
  };

  it("shows header info and plays a round", () => {
    begin();
    wrap(<PlayPage />);
    expect(screen.getByText("Scheisse · Runde 1 von 31")).toBeInTheDocument();
    expect(screen.getByText("Geber:", { exact: false })).toBeInTheDocument();
    expect(screen.getByTestId("stiche")).toHaveTextContent("Stiche: 0 / 1");
    const next = screen.getByRole("button", { name: "Nächste Runde" });
    expect(next).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Alle richtig" }));
    expect(next).toBeEnabled();
    fireEvent.click(next);
    expect(screen.getByText("Scheisse · Runde 2 von 31")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Letzte Runde" })).toBeEnabled();
  });

  it("renders scoreboard, stats and ceremony states", () => {
    begin();
    s().setAllCorrect(true);
    s().commit();
    wrap(<StatsPage />);
    expect(screen.getByText("Meiste 1. Plätze")).toBeInTheDocument();
    wrap(<ScoreboardPage />);
    wrap(<CeremonyPage />);
    expect(screen.getByText("Das Spiel läuft noch")).toBeInTheDocument();
  });

  it("shows the ceremony for a finished match", () => {
    s().addDraftPlayer({ name: "Anna", userId: null });
    s().addDraftPlayer({ name: "Ben", userId: null });
    s().setDraftMaxCards(1);
    s().startMatch();
    s().setCorrect(s().state!.setup.players[0]!.id, true);
    s().setCorrect(s().state!.setup.players[1]!.id, false);
    s().commit();
    wrap(<CeremonyPage />);
    expect(screen.getByText("Anna gewinnt!", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Noch ein Match" })).toBeInTheDocument();
  });

  it("shows empty state without a match", () => {
    wrap(<ScoreboardPage />);
    expect(screen.getByText("Kein laufendes Spiel")).toBeInTheDocument();
  });
});
