import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../../lib/api";
import { useLocalHistory } from "../../lib/localHistory";
import { useGameStore } from "./store";
import { push, syncLocalHistory } from "./sync";

const api = vi.hoisted(() => ({ apiPost: vi.fn(), apiPut: vi.fn() }));
vi.mock("../../lib/api", async (orig) => ({ ...(await orig<typeof import("../../lib/api")>()), ...api }));

const s = () => useGameStore.getState();

function start() {
  s().addDraftPlayer({ name: "A", userId: null });
  s().addDraftPlayer({ name: "B", userId: null });
  s().startMatch();
}

beforeEach(() => {
  api.apiPost.mockReset();
  api.apiPut.mockReset();
  useLocalHistory.setState({ knownPlayers: [], playedMatches: [] });
  useGameStore.setState({
    state: null, matchId: null, localId: null, code: null, writeToken: null, version: 1, startedAt: null,
    dirty: false, setupDraft: { players: [], gameId: "scheisse", rulesetId: "scheisse.standard", deckSize: 32, maxCards: null, repeatPeak: false, firstBidder: "giver" }, syncStatus: "idle",
  });
});
afterEach(() => vi.useRealTimers());

describe("sync", () => {
  it("creates the match on first push and stores id/code/token/version", async () => {
    start();
    api.apiPost.mockResolvedValue({ match: { id: "m1", code: "ABCDE", version: 1 }, writeToken: "tok" });
    await push();
    expect(api.apiPost).toHaveBeenCalledWith("/matches", { state: s().state });
    expect(s()).toMatchObject({ matchId: "m1", code: "ABCDE", writeToken: "tok", version: 1, dirty: false, syncStatus: "synced" });
  });

  it("sends PUT with token and version", async () => {
    start();
    s().patchSync({ matchId: "m1", code: "ABCDE", writeToken: "tok", version: 3 });
    api.apiPut.mockResolvedValue({ id: "m1", version: 4 });
    await push();
    expect(api.apiPut).toHaveBeenCalledWith("/matches/m1", { state: s().state, version: 3 }, { headers: { "X-Write-Token": "tok" } });
    expect(s().version).toBe(4);
  });

  it("ignores a POST response when another match was started meanwhile", async () => {
    start();
    let resolve!: (v: unknown) => void;
    api.apiPost.mockReturnValue(new Promise((r) => (resolve = r)));
    const p = push();
    s().endGame();
    s().addDraftPlayer({ name: "A", userId: null });
    s().addDraftPlayer({ name: "B", userId: null });
    s().startMatch();
    const newLocal = s().localId;
    resolve({ match: { id: "old", code: "OLDOL", version: 1 }, writeToken: "oldtok" });
    await p;
    expect(s().localId).toBe(newLocal);
    expect(s().matchId).toBeNull();
    expect(s().writeToken).toBeNull();
    expect(s().dirty).toBe(true);
  });

  it("goes offline on network errors and keeps dirty", async () => {
    vi.useFakeTimers();
    start();
    api.apiPost.mockRejectedValue(new ApiRequestError(0, "network", "x"));
    await push();
    expect(s().syncStatus).toBe("offline");
    expect(s().dirty).toBe(true);
    vi.useRealTimers();
  });

  it("adopts the server version on 409 and resends", async () => {
    vi.useFakeTimers();
    start();
    s().patchSync({ matchId: "m1", writeToken: "tok", version: 1 });
    api.apiPut.mockRejectedValueOnce(new ApiRequestError(409, "version_conflict", "x", { match: { version: 7 } }));
    api.apiPut.mockResolvedValueOnce({ id: "m1", version: 8 });
    await push();
    expect(s().version).toBe(7);
    await vi.advanceTimersByTimeAsync(10);
    expect(api.apiPut).toHaveBeenLastCalledWith("/matches/m1", { state: s().state, version: 7 }, expect.anything());
    expect(s().version).toBe(8);
  });
});

describe("local history", () => {
  it("records a finished match and removes it again after undo", () => {
    start();
    s().setDraftMaxCards(1);
    s().endGame();
    s().setDraftMaxCards(1);
    s().startMatch(); // 1 round only
    s().setAllCorrect(true);
    s().commit();
    syncLocalHistory();
    expect(useLocalHistory.getState().playedMatches).toHaveLength(1);
    expect(useLocalHistory.getState().knownPlayers.map((p) => p.name).sort()).toEqual(["A", "B"]);
    s().undo();
    syncLocalHistory();
    expect(useLocalHistory.getState().playedMatches).toHaveLength(0);
  });
});
