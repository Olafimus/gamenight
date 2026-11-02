import type { TrickMatchState } from "@gamenight/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { deriveMatch } from "@gamenight/shared";
import { ToastProvider } from "../../ui";
import { PlayPage } from "./PlayPage";
import { useGameStore, type GameView } from "./store";
import { useWakeLock } from "./useWakeLock";
import { biddingOrder } from "./views/WizardView";
import { defaultView, resolveView } from "./views/useView";

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
/** Running state as trick-bidding match (these tests play Scheisse). */
const t = () => s().state as TrickMatchState;

function begin(names = ["Anna", "Ben", "Cleo"]) {
  for (const n of names) s().addDraftPlayer({ name: n, userId: null });
  s().startMatch();
}

beforeEach(() => {
  window.localStorage.clear();
  s().endGame();
  useGameStore.setState({ setupDraft: { players: [], gameId: "scheisse", rulesetId: "scheisse.standard", deckSize: 32, maxCards: null, repeatPeak: false, firstBidder: "giver" }, view: null });
});

describe("view switching", () => {
  const cases: Array<[GameView, () => void]> = [
    ["cards", () => expect(screen.getByLabelText("Ansage von Anna")).toBeInTheDocument()],
    ["compact", () => expect(screen.getByRole("list", { name: "Spieler" })).toBeInTheDocument()],
    ["wizard", () => expect(screen.getByRole("heading", { name: /Ansage von/ })).toBeInTheDocument()],
    ["table", () => expect(screen.getByLabelText("Spieltisch")).toBeInTheDocument()],
    ["split", () => expect(screen.getByLabelText("Zwischenstand")).toBeInTheDocument()],
  ];
  for (const [view, check] of cases) {
    it(`renders the ${view} view`, () => {
      begin();
      s().setView(view);
      wrap(<PlayPage />);
      check();
      // the wizard has its own flow controls, all others keep the action bar
      expect(!!screen.queryByRole("navigation", { name: "Aktionen" })).toBe(view !== "wizard");
    });
  }

  it("switches the view through the header menu and persists the choice", () => {
    begin();
    s().setView("compact");
    wrap(<PlayPage />);
    fireEvent.click(screen.getByRole("button", { name: "Ansicht: Kompakt" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Ansicht: Tisch/ }));
    expect(s().view).toBe("table");
    expect(screen.getByLabelText("Spieltisch")).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("scheisse.game.v1")!).view).toBe("table");
  });

  it("picks sensible defaults by screen and never splits on narrow screens", () => {
    expect(defaultView({ width: 390, height: 844 })).toBe("compact");
    expect(defaultView({ width: 768, height: 1024 })).toBe("table");
    expect(defaultView({ width: 1180, height: 820 })).toBe("split");
    expect(resolveView("split", { width: 600, height: 800 })).toBe("compact");
    expect(resolveView("cards", { width: 1180, height: 820 })).toBe("cards");
  });

  it("marks right in the compact view and vibrates", () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    begin(["Anna", "Ben"]);
    s().setView("compact");
    wrap(<PlayPage />);
    fireEvent.click(screen.getByRole("button", { name: "Anna: richtig" }));
    expect(vibrate).toHaveBeenCalledWith(10);
    expect(t().current.correct[t().setup.players[0]!.id]).toBe(true);
    Reflect.deleteProperty(navigator, "vibrate");
  });
});

describe("wizard", () => {
  it("bids start with the giver and wrap", () => {
    begin(["Anna", "Ben", "Cleo", "Dora"]);
    const m = deriveMatch(t());
    expect(biddingOrder(m.players, m.giverId).map((p) => p.name)).toEqual(["Anna", "Ben", "Cleo", "Dora"]);
    s().setGiver(m.players[2]!.id);
    const m2 = deriveMatch(t());
    expect(biddingOrder(m2.players, m2.giverId).map((p) => p.name)).toEqual(["Cleo", "Dora", "Anna", "Ben"]);
  });

  it("runs bids, then result with deltas and commits on 'Runde speichern'", async () => {
    begin(["Anna", "Ben", "Cleo"]);
    s().setView("wizard");
    wrap(<PlayPage />);
    // the giver (Anna) bids first
    const heading = screen.getByRole("heading", { name: /Ansage von\s*Anna/ });
    expect(heading).toHaveTextContent("Geber");
    fireEvent.click(screen.getByRole("button", { name: "1 ansagen" })); // Anna bids 1, next Ben
    expect(screen.getByRole("heading", { name: /Ansage von\s*Ben/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "0 ansagen" })); // Ben 0 -> Cleo (last)
    expect(screen.getByRole("heading", { name: /Ansage von\s*Cleo/ })).toBeInTheDocument();
    // last bidder: 0 would make the sum (1) equal the cards (1) -> hint
    expect(screen.getByRole("note")).toHaveTextContent("Mit 0");
    fireEvent.click(screen.getByRole("button", { name: "1 ansagen" }));
    // result phase
    fireEvent.click(screen.getByRole("button", { name: "alle ✓" }));
    fireEvent.click(screen.getByRole("button", { name: "Anna: falsch" }));
    expect(t().rounds).toHaveLength(0);
    // per-player deltas are shown in the result phase, nothing committed yet
    const list = screen.getByRole("list", { name: "Ergebnis" });
    const deltas = (await within(list).findAllByText(/^[+−]\d+$/)).map((e) => e.textContent);
    expect(deltas).toEqual(["−10", "+10", "+11"]); // Anna, Ben, Cleo
    expect(t().rounds).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Runde speichern" }));
    expect(t().rounds).toHaveLength(1);
    // back to phase 1 of the next round, first bidder = the new giver (Ben)
    expect(screen.getByRole("heading", { name: /Ansage von\s*Ben/ })).toBeInTheDocument();
    // undo stays available
    expect(screen.getByRole("button", { name: "Letzte Runde" })).toBeEnabled();
  });
});

describe("useWakeLock", () => {
  const original = Object.getOwnPropertyDescriptor(navigator, "wakeLock");
  afterEach(() => {
    if (original) Object.defineProperty(navigator, "wakeLock", original);
    else Reflect.deleteProperty(navigator, "wakeLock");
  });

  const mockLock = () => {
    const sentinels: Array<{ released: boolean; release: ReturnType<typeof vi.fn> }> = [];
    const request = vi.fn(async () => {
      const sent = { released: false, release: vi.fn(async () => void (sent.released = true)), addEventListener: vi.fn() };
      sentinels.push(sent);
      return sent;
    });
    Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
    return { request, sentinels };
  };

  it("requests a screen lock, re-acquires after visibility change and releases on unmount", async () => {
    const { request, sentinels } = mockLock();
    const { unmount } = renderHook(() => useWakeLock(true));
    await waitFor(() => expect(request).toHaveBeenCalledWith("screen"));
    // the browser releases the lock when the page is hidden
    sentinels[0]!.released = true;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    unmount();
    await waitFor(() => expect(sentinels[1]!.release).toHaveBeenCalled());
  });

  it("does nothing when inactive or unsupported", () => {
    const { request } = mockLock();
    renderHook(() => useWakeLock(false));
    expect(request).not.toHaveBeenCalled();
    Reflect.deleteProperty(navigator, "wakeLock");
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
  });
});
