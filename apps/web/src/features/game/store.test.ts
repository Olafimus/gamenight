import { beforeEach, describe, expect, it } from "vitest";
import { deriveMatch } from "@scheisse/shared";
import { GAME_STORAGE_KEY, hasRunningMatch } from "../home/useRunningMatch";
import { useGameStore } from "./store";

const reset = () => {
  window.localStorage.clear();
  useGameStore.setState({
    state: null,
    matchId: null,
    localId: null,
    code: null,
    writeToken: null,
    version: 1,
    startedAt: null,
    dirty: false,
    setupDraft: { players: [], deckSize: 32, maxCards: null },
    sortMode: "seat",
    syncStatus: "idle",
  });
};

const s = () => useGameStore.getState();

function startWith(names: string[]) {
  for (const n of names) expect(s().addDraftPlayer({ name: n, userId: null })).toBeNull();
  expect(s().startMatch()).toBeNull();
}

describe("game store: setup", () => {
  beforeEach(reset);

  it("capitalises names and rejects duplicates case-insensitively", () => {
    expect(s().addDraftPlayer({ name: "  anna ", userId: null })).toBeNull();
    expect(s().setupDraft.players[0]?.name).toBe("Anna");
    expect(s().addDraftPlayer({ name: "ANNA", userId: null })).toBe("Spieler bereits hinzugefügt!");
    expect(s().addDraftPlayer({ name: "x", userId: "u1" })).toBeNull();
    expect(s().addDraftPlayer({ name: "Y", userId: "u1" })).toBe("Spieler bereits hinzugefügt!");
    expect(s().setupDraft.players).toHaveLength(2);
  });

  it("limits to 10 players and resets an oversized maxCards", () => {
    for (let i = 0; i < 10; i++) s().addDraftPlayer({ name: `P${i}`, userId: null });
    expect(s().addDraftPlayer({ name: "Extra", userId: null })).toMatch(/Maximal/);
    s().removeDraftPlayer(s().setupDraft.players[0]!.id);
    s().removeDraftPlayer(s().setupDraft.players[0]!.id);
    s().removeDraftPlayer(s().setupDraft.players[0]!.id);
    s().removeDraftPlayer(s().setupDraft.players[0]!.id);
    s().removeDraftPlayer(s().setupDraft.players[0]!.id); // 5 left
    s().setDraftMaxCards(6);
    expect(s().setupDraft.maxCards).toBe(6);
    s().addDraftPlayer({ name: "A", userId: null });
    s().addDraftPlayer({ name: "B", userId: null });
    s().addDraftPlayer({ name: "C", userId: null }); // 8 players -> max 4
    expect(s().setupDraft.maxCards).toBeNull();
  });

  it("reorders the draft", () => {
    s().addDraftPlayer({ name: "A", userId: null });
    s().addDraftPlayer({ name: "B", userId: null });
    const [a, b] = s().setupDraft.players;
    s().reorderDraft([b!.id, a!.id]);
    expect(s().setupDraft.players.map((p) => p.name)).toEqual(["B", "A"]);
  });

  it("refuses to start with fewer than 2 players", () => {
    s().addDraftPlayer({ name: "A", userId: null });
    expect(s().startMatch()).not.toBeNull();
    expect(s().state).toBeNull();
  });
});

describe("game store: running match", () => {
  beforeEach(reset);

  it("starts, persists in the shape hasRunningMatch() expects", () => {
    expect(hasRunningMatch()).toBe(false);
    startWith(["A", "B"]);
    expect(s().dirty).toBe(true);
    expect(hasRunningMatch()).toBe(true);
    const persisted = JSON.parse(window.localStorage.getItem(GAME_STORAGE_KEY)!);
    expect(persisted.state.setup.players).toHaveLength(2);
    expect(persisted).toHaveProperty("setupDraft");
    expect(persisted).toHaveProperty("writeToken");
    expect(persisted).not.toHaveProperty("syncStatus");
  });

  it("commits only when all are marked, and undo restores the round", () => {
    startWith(["A", "B"]);
    const [a, b] = s().state!.setup.players;
    s().setBid(a!.id, 1);
    s().commit(); // no-op: not all marked
    expect(s().state!.rounds).toHaveLength(0);
    s().setCorrect(a!.id, true);
    s().setCorrect(b!.id, false);
    s().commit();
    const d = deriveMatch(s().state!);
    expect(d.roundsPlayed).toBe(1);
    expect(d.players.find((p) => p.id === a!.id)?.total).toBe(11);
    expect(d.players.find((p) => p.id === b!.id)?.total).toBe(-10);
    expect(d.giverName).toBe("B");
    s().undo();
    expect(s().state!.rounds).toHaveLength(0);
    expect(s().state!.current.bids[a!.id]).toBe(1);
    expect(s().state!.currentGiverId).toBe(a!.id);
  });

  it("returns an error message when the engine rejects a deck change", () => {
    startWith(["A", "B", "C", "D"]);
    // 4 players, deck 32 -> 8 cards, 15 rounds; deck 52 -> 13 cards
    s().setAllCorrect(true);
    s().commit();
    expect(s().setDeck(52)).toBeNull();
    expect(s().state!.setup.deckSize).toBe(52);
  });

  it("rejects an invalid bid without changing state", () => {
    startWith(["A", "B"]);
    const before = s().state;
    expect(s().setBid("nope", 1)).toMatch(/Unbekannter Spieler/);
    expect(s().state).toBe(before);
  });

  it("rematch clears server metadata; endGame returns to setup keeping players", () => {
    startWith(["A", "B"]);
    s().patchSync({ matchId: "m1", code: "ABCDE", writeToken: "t", version: 4, dirty: false });
    s().rematch();
    expect(s().matchId).toBeNull();
    expect(s().dirty).toBe(true);
    s().endGame();
    expect(s().state).toBeNull();
    expect(hasRunningMatch()).toBe(false);
    expect(s().setupDraft.players.map((p) => p.name)).toEqual(["A", "B"]);
  });

  it("hasRunningMatch is false for a finished match; archiveMatch clears it but keeps the draft players", () => {
    s().addDraftPlayer({ name: "A", userId: null });
    s().addDraftPlayer({ name: "B", userId: null });
    s().setDraftMaxCards(1);
    s().startMatch();
    expect(hasRunningMatch()).toBe(true);
    const [a, b] = s().state!.setup.players;
    s().setCorrect(a!.id, true);
    s().setCorrect(b!.id, false);
    s().commit();
    expect(deriveMatch(s().state!).finished).toBe(true);
    expect(hasRunningMatch()).toBe(false);
    s().undo(); // still possible while on the game pages
    expect(hasRunningMatch()).toBe(true);
    s().commit();
    s().archiveMatch();
    expect(s().state).toBeNull();
    expect(hasRunningMatch()).toBe(false);
    expect(s().setupDraft.players.map((p) => p.name)).toEqual(["A", "B"]);
  });

  it("links and unlinks seats (draft and running match) and prevents duplicates", () => {
    s().addDraftPlayer({ name: "oliver", userId: null });
    s().addDraftPlayer({ name: "Bea", userId: "u-bea" });
    s().addDraftPlayer({ name: "Cleo", userId: null });
    const [g, , c] = s().setupDraft.players;
    // account already seated
    expect(s().linkDraftPlayer(g!.id, { id: "u-bea", username: "bea" })).toMatch(/bereits/);
    // name clash (case-insensitive) with another seat
    expect(s().linkDraftPlayer(c!.id, { id: "u-x", username: "BEA" })).toBe("Spieler bereits hinzugefügt!");
    expect(s().linkDraftPlayer(g!.id, { id: "u-oli", username: "oliver" })).toBeNull();
    expect(s().setupDraft.players[0]).toMatchObject({ name: "Oliver", userId: "u-oli" });
    // unlink needs a free guest name
    expect(s().linkDraftPlayer(g!.id, null, "cleo")).toBe("Spieler bereits hinzugefügt!");
    expect(s().linkDraftPlayer(g!.id, null, "olli")).toBeNull();
    expect(s().setupDraft.players[0]).toMatchObject({ name: "Olli", userId: null });
    s().linkDraftPlayer(g!.id, { id: "u-oli", username: "oliver" });

    s().startMatch();
    const id = s().state!.setup.players[2]!.id;
    expect(s().linkSeat(id, { id: "u-oli", username: "Zed" })).toMatch(/bereits/);
    expect(s().linkSeat(id, { id: "u-zed", username: "Zed" })).toBeNull();
    expect(s().state!.setup.players[2]).toMatchObject({ name: "Zed", userId: "u-zed" });
    expect(s().dirty).toBe(true);
    expect(s().linkSeat("nope", null)).toMatch(/Unbekannt/);
    expect(s().linkSeat(id, null, "Zeddy")).toBeNull();
    expect(s().state!.setup.players[2]).toMatchObject({ name: "Zeddy", userId: null });
  });

  it("hasRunningMatch survives corrupt storage", () => {
    window.localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify({ state: { nonsense: true } }));
    expect(hasRunningMatch()).toBe(false);
    window.localStorage.setItem(GAME_STORAGE_KEY, "{not json");
    expect(hasRunningMatch()).toBe(false);
  });
});
