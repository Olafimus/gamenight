import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { deriveMatch, sheetCategories, KNIFFEL_RULES, type SheetMatchState, type TrickMatchState } from "@gamenight/shared";
import { ToastProvider } from "../../ui";
import { GAME_STORAGE_KEY } from "../home/useRunningMatch";
import { useSelectedGameStore } from "../../lib/games";
import { useGameStore } from "./store";
import { PlayPage } from "./PlayPage";
import { SetupPage } from "./SetupPage";
import { SheetPlayPage } from "./sheet/SheetPlayPage";

vi.mock("../../lib/auth", () => ({ useAuth: () => ({ user: null, loading: false }) }));

const wrap = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );

const s = () => useGameStore.getState();
const sheet = () => s().state as SheetMatchState;
const trick = () => s().state as TrickMatchState;

function addPlayers(names: string[]) {
  for (const n of names) expect(s().addDraftPlayer({ name: n, userId: null })).toBeNull();
}

beforeEach(() => {
  useSelectedGameStore.setState({ gameId: "scheisse" });
  window.localStorage.clear();
  s().endGame();
  useGameStore.setState({ setupDraft: { players: [], gameId: "scheisse", rulesetId: "scheisse.standard", deckSize: 32, maxCards: null, repeatPeak: false, firstBidder: "giver" } });
});

describe("store: games and rulesets", () => {
  it("switching the game keeps the players and resets ruleset/options", () => {
    addPlayers(["Anna", "Ben"]);
    s().setDraftMaxCards(3);
    s().setDraftGame("wizard");
    expect(s().setupDraft).toMatchObject({ gameId: "wizard", rulesetId: "wizard.standard", deckSize: 60, maxCards: null });
    expect(s().setupDraft.players).toHaveLength(2);
    // Wizard needs 3 players
    expect(s().startMatch()).toMatch(/mindestens 3/i);
    addPlayers(["Cleo"]);
    expect(s().startMatch()).toBeNull();
    expect(s().state?.gameId).toBe("wizard");
  });

  it("wizard: tricks are entered, wrong tricks sum blocks the commit", () => {
    s().setDraftGame("wizard");
    addPlayers(["Anna", "Ben", "Cleo"]);
    s().startMatch();
    const [a, b, c] = trick().setup.players;
    s().setBid(a!.id, 1);
    s().setTricks(a!.id, 1);
    s().setTricks(b!.id, 1);
    s().setTricks(c!.id, 0);
    s().commit(); // 2 tricks with 1 card: blocked
    expect(trick().rounds).toHaveLength(0);
    s().setTricks(b!.id, 0);
    s().commit();
    expect(deriveMatch(trick()).players.map((p) => p.total)).toEqual([30, 20, 20]);
    expect(s().setCorrect(a!.id, true)).toBeNull(); // harmless, ignored by tricks rules
  });

  it("kniffel: entries, undo, rematch, end keeps game and ruleset for the next setup", () => {
    s().setDraftGame("kniffel");
    addPlayers(["Anna"]);
    expect(s().startMatch()).toBeNull();
    const [a] = sheet().setup.players;
    expect(s().scoreEntry({ playerId: a!.id, categoryId: "kniffel", dice: [3, 3, 3, 3, 3] })).toBeNull();
    expect(s().scoreEntry({ playerId: a!.id, categoryId: "kniffel", points: 0 })).toMatch(/.+/);
    expect(deriveMatch(sheet()).players[0]!.total).toBe(50);
    s().undoEntry();
    expect(sheet().entries).toHaveLength(0);
    s().rematch();
    expect(s().state?.gameId).toBe("kniffel");
    s().endGame();
    expect(s().state).toBeNull();
    expect(s().setupDraft).toMatchObject({ gameId: "kniffel", rulesetId: "kniffel.standard" });
  });

  it("upgrades a running match persisted by app version 1", async () => {
    const v1 = {
      state: {
        setup: { players: [{ id: "a", name: "Anna", userId: null }, { id: "b", name: "Ben", userId: null }], deckSize: 32, maxCards: 2 },
        rounds: [],
        current: { bids: {}, correct: {} },
        currentGiverId: "a",
      },
      setupDraft: { players: [], deckSize: 52, maxCards: null },
      matchId: null, localId: "x", code: null, writeToken: null, version: 1, startedAt: null, dirty: false,
      sortMode: "seat", view: null, tableRotation: 0, keepAwake: true, __v: 1,
    };
    window.localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify(v1));
    await act(async () => {
      await useGameStore.persist.rehydrate();
    });
    expect(s().state).toMatchObject({ kind: "trick-bidding", gameId: "scheisse", ruleset: { id: "scheisse.standard" } });
    expect(deriveMatch(trick()).totalRounds).toBe(3);
    expect(s().setupDraft).toMatchObject({ gameId: "scheisse", rulesetId: "scheisse.standard", deckSize: 52 });
  });
});

describe("setup: game chosen on the start page", () => {
  it("Kniffel: allows a single player and shows the number of fields", () => {
    useSelectedGameStore.getState().select("kniffel");
    wrap(<SetupPage />);
    expect(s().setupDraft.gameId).toBe("kniffel");
    expect(screen.queryByRole("group", { name: "Deckgröße" })).not.toBeInTheDocument();
    expect(screen.getByText("Felder pro Spieler")).toBeInTheDocument();
    act(() => void s().addDraftPlayer({ name: "Solo", userId: null }));
    expect(screen.getByRole("button", { name: "Spiel starten" })).toBeEnabled();
  });

  it("Wizard: only one deck, needs 3 players", () => {
    useSelectedGameStore.getState().select("wizard");
    wrap(<SetupPage />);
    expect(screen.queryByRole("group", { name: "Deckgröße" })).not.toBeInTheDocument();
    act(() => {
      s().addDraftPlayer({ name: "A", userId: null });
      s().addDraftPlayer({ name: "B", userId: null });
    });
    expect(screen.getByRole("button", { name: "Spiel starten" })).toBeDisabled();
    expect(screen.getByText("Mindestens 3 Spieler nötig.")).toBeInTheDocument();
  });

  it("Scheisse variants: peak twice and first bid after the giver go into the match rules", () => {
    wrap(<SetupPage />);
    act(() => {
      s().addDraftPlayer({ name: "A", userId: null });
      s().addDraftPlayer({ name: "B", userId: null });
      s().addDraftPlayer({ name: "C", userId: null });
      s().addDraftPlayer({ name: "D", userId: null });
    });
    expect(screen.getByText("15")).toBeInTheDocument(); // 1..8..1 rounds
    fireEvent.click(screen.getByRole("button", { name: "2×" }));
    fireEvent.click(screen.getByRole("button", { name: "Nach Geber" }));
    expect(screen.getByText("16")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Spiel starten" }));
    const m = deriveMatch(trick());
    expect(trick().rules.rounds.repeatPeak).toBe(true);
    expect(m.totalRounds).toBe(16);
    expect(m.bidderId).toBe(trick().setup.players[1]!.id);
  });
});

describe("play pages of other games", () => {
  it("Kniffel roll entry lists the open fields from the start and moves reached patterns up", () => {
    s().setDraftGame("kniffel");
    addPlayers(["Anna", "Ben"]);
    s().startMatch();
    wrap(<SheetPlayPage />);
    fireEvent.click(screen.getByRole("button", { name: "Wurf von Anna" }));
    const open = () => within(screen.getByRole("list", { name: "Offene Felder" })).getAllByRole("button");
    expect(open()).toHaveLength(sheetCategories(KNIFFEL_RULES).length);
    expect(open().every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "6 hinzufügen" }));
    expect(open()[0]).toHaveTextContent(/Dreierpasch.*erreicht/);
    expect(screen.getAllByText("✓ erreicht")).toHaveLength(1);
  });

  it("Wizard compact view offers tricks steppers instead of ✓/✗", () => {
    s().setDraftGame("wizard");
    addPlayers(["Anna", "Ben", "Cleo"]);
    s().startMatch();
    s().setView("compact");
    wrap(<PlayPage />);
    expect(screen.queryByRole("button", { name: "Anna: richtig" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Anna: Stiche wie angesagt/ }));
    expect(trick().current.tricks?.[trick().setup.players[0]!.id]).toBe(0);
    expect(screen.getByRole("button", { name: "Alle wie angesagt" })).toBeInTheDocument();
  });

  it("Kniffel: roll entry suggests categories and fills the sheet", () => {
    s().setDraftGame("kniffel");
    addPlayers(["Anna", "Ben"]);
    s().startMatch();
    wrap(<SheetPlayPage />);
    expect(screen.getByText("Anna", { selector: "strong" })).toBeInTheDocument(); // Am Zug
    fireEvent.click(screen.getByRole("button", { name: "Wurf von Anna" }));
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole("button", { name: "6 hinzufügen" }));
    const options = screen.getByRole("list", { name: "Feld wählen" });
    expect(within(options).getAllByRole("button")).toHaveLength(sheetCategories(KNIFFEL_RULES).length);
    fireEvent.click(within(options).getByRole("button", { name: /Kniffel\s*50/ }));
    expect(screen.getByTestId("total-" + sheet().setup.players[0]!.id)).toHaveTextContent("50");
    // next turn: Ben; a cell can be struck directly
    fireEvent.click(screen.getByTestId(`cell-${sheet().setup.players[1]!.id}-0-chance`));
    fireEvent.click(screen.getByRole("button", { name: "Streichen" }));
    expect(sheet().entries).toHaveLength(2);
    expect(deriveMatch(sheet()).roundNumber).toBe(2);
  });
});
