import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import { nanoid } from "nanoid";
import {
  canCommitRound,
  canUndoEntry,
  canUndoRound,
  clearEntry,
  commitRound,
  correctEntry,
  correctRound,
  createMatch,
  defaultRuleset,
  deriveMatch,
  getBuiltinRuleset,
  getGame,
  isTrickMatch,
  mapPlayers,
  maxAllowedCards,
  rematchMatch,
  reorderSeats as engineReorderSeats,
  reorderSheetSeats,
  resetCurrentRound,
  scoreEntry,
  setAllCorrect,
  setBid,
  setCorrect,
  setDeckSize,
  setGiver,
  setTricks,
  undoEntry,
  undoRound,
  upgradeMatchState,
  MAX_PLAYERS as ENGINE_MAX_PLAYERS,
  type FirstBidder,
  type MatchPlayer,
  type MatchState,
  type Ruleset,
  type SheetEntryInput,
  type SheetMatchState,
  type TrickMatchState,
  userLabel,
} from "@gamenight/shared";
import { GAME_STORAGE_KEY } from "../home/useRunningMatch";
import { translateEngineError } from "./errors";
import { apiDelete } from "../../lib/api";
import { useLocalHistory } from "../../lib/localHistory";

export type SortMode = "seat" | "rank" | "giver";
export type SyncStatus = "idle" | "synced" | "syncing" | "offline";
export type GameView = "cards" | "compact" | "wizard" | "table" | "split";
export const GAME_VIEWS: GameView[] = ["compact", "wizard", "table", "split", "cards"];

export const MAX_PLAYERS = ENGINE_MAX_PLAYERS;
export const MAX_NAME_LENGTH = 30;

export interface SetupDraft {
  players: MatchPlayer[];
  gameId: string;
  /** Built-in or custom ruleset id of the chosen game. */
  rulesetId: string;
  /** trick-bidding only */
  deckSize: number;
  /** trick-bidding only */
  maxCards: number | null;
  /** trick-bidding variants: initialised from the ruleset, applied to the match rules on start */
  repeatPeak: boolean;
  firstBidder: FirstBidder;
}

export interface AccountRef {
  id: string;
  username: string;
  /** Shown instead of the username when set. */
  displayName?: string | null;
}

/** Links a guest seat to an account (or unlinks with null). Returns the new players or a German error message. */
export function relinkPlayers(
  players: MatchPlayer[],
  playerId: string,
  account: AccountRef | null,
  guestName?: string,
): MatchPlayer[] | string {
  const target = players.find((p) => p.id === playerId);
  if (!target) return "Unbekannter Spieler.";
  if (!account) {
    // Back to guest: the (case-insensitive) name must stay unique in the match. Account-name clashes are checked by the caller.
    const name = firstUpper(guestName ?? target.name).slice(0, MAX_NAME_LENGTH);
    if (!name) return "Bitte einen Namen eingeben.";
    if (players.some((p) => p.id !== playerId && p.name.trim().toLowerCase() === name.toLowerCase())) return "Spieler bereits hinzugefügt!";
    return players.map((p) => (p.id === playerId ? { ...p, name, userId: null } : p));
  }
  if (players.some((p) => p.id !== playerId && p.userId === account.id)) return "Dieses Konto sitzt bereits mit am Tisch.";
  const name = firstUpper(userLabel(account)).slice(0, MAX_NAME_LENGTH);
  if (players.some((p) => p.id !== playerId && p.name.trim().toLowerCase() === name.toLowerCase())) return "Spieler bereits hinzugefügt!";
  return players.map((p) => (p.id === playerId ? { ...p, name, userId: account.id } : p));
}

export const firstUpper = (name: string): string => {
  const t = name.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};


const DEFAULT_GAME = "scheisse";

/** Variant defaults of a ruleset (trick-bidding; other kinds have none). */
const variantsOf = (rs: Ruleset): Pick<SetupDraft, "repeatPeak" | "firstBidder"> =>
  rs.kind === "trick-bidding"
    ? { repeatPeak: rs.rules.rounds.repeatPeak ?? false, firstBidder: rs.rules.bidding.firstBidder ?? "giver" }
    : { repeatPeak: false, firstBidder: "giver" };

function draftFor(gameId: string, players: MatchPlayer[] = []): SetupDraft {
  const rs = defaultRuleset(gameId);
  return {
    players,
    gameId,
    rulesetId: rs.id,
    deckSize: rs.kind === "trick-bidding" ? rs.rules.deck.defaultSize : 0,
    maxCards: null,
    ...variantsOf(rs),
  };
}

/** The ruleset with the draft's chosen variants applied (what the match is started with). */
export function withVariants(rs: Ruleset, d: Pick<SetupDraft, "repeatPeak" | "firstBidder">): Ruleset {
  if (rs.kind !== "trick-bidding") return rs;
  return {
    ...rs,
    rules: {
      ...rs.rules,
      rounds: { ...rs.rules.rounds, repeatPeak: rs.rules.rounds.schedule !== "fixed" && d.repeatPeak },
      bidding: { ...rs.rules.bidding, firstBidder: d.firstBidder },
    },
  };
}

const emptyDraft = (): SetupDraft => draftFor(DEFAULT_GAME);

/** Built-in ruleset of the draft (custom rulesets are passed to startMatch by the setup page). */
export function builtinRulesetOf(d: SetupDraft): Ruleset {
  const rs = getBuiltinRuleset(d.rulesetId);
  return rs && rs.gameId === d.gameId ? rs : defaultRuleset(d.gameId);
}

interface PersistedPart {
  state: MatchState | null;
  matchId: string | null;
  /** Stable id for the local history while the match is not (yet) known to the server. */
  localId: string | null;
  code: string | null;
  writeToken: string | null;
  version: number;
  startedAt: string | null;
  /** True while the local state has changes not yet confirmed by the server. */
  dirty: boolean;
  setupDraft: SetupDraft;
  sortMode: SortMode;
  /** Chosen view of the running trick game; null = automatic by screen size. */
  view: GameView | null;
  /** Table view: how many seats the table is turned, so the viewer's own seat can sit at the bottom. */
  tableRotation: number;
  /** Keep the screen awake (Wake Lock) while a match is running. */
  keepAwake: boolean;
}

export interface GameStore extends PersistedPart {
  syncStatus: SyncStatus;
  /** German message when the server permanently rejects the match (not persisted). */
  syncError: string | null;

  // setup
  /** Returns an error message or null. */
  addDraftPlayer: (player: { name: string; userId: string | null }) => string | null;
  removeDraftPlayer: (id: string) => void;
  reorderDraft: (orderedIds: string[]) => void;
  /** Switches the game (keeps the players, resets ruleset and options to the game's defaults). */
  setDraftGame: (gameId: string) => void;
  /** Ruleset of the current game (built-in or custom); adopts its deck default if needed. */
  setDraftRuleset: (ruleset: Ruleset) => void;
  setDraftDeck: (deck: number) => void;
  setDraftMaxCards: (maxCards: number | null) => void;
  setDraftVariants: (patch: Partial<Pick<SetupDraft, "repeatPeak" | "firstBidder">>) => void;
  /** Starts with `ruleset` (default: the draft's built-in ruleset). */
  startMatch: (ruleset?: Ruleset) => string | null;
  /** Link a setup seat to an account (null = back to guest). Returns an error message or null. */
  linkDraftPlayer: (playerId: string, account: AccountRef | null, guestName?: string) => string | null;
  /** Same for the running match. */
  linkSeat: (playerId: string, account: AccountRef | null, guestName?: string) => string | null;

  // running trick-bidding game (each returns an error message or null)
  setBid: (playerId: string, bid: number) => string | null;
  setCorrect: (playerId: string, correct: boolean) => string | null;
  setTricks: (playerId: string, tricks: number) => string | null;
  setAllCorrect: (correct: boolean) => string | null;
  resetRound: () => string | null;
  commit: () => string | null;
  undo: () => string | null;
  correct: (roundIndex: number, playerId: string, patch: { bid?: number; correct?: boolean; tricks?: number }) => string | null;
  setGiver: (playerId: string) => string | null;
  setDeck: (deck: number) => string | null;

  // running score-sheet game
  scoreEntry: (input: SheetEntryInput) => string | null;
  undoEntry: () => string | null;
  correctEntry: (entryIndex: number, patch: Pick<SheetEntryInput, "dice" | "points" | "repeat">) => string | null;
  clearEntry: (entryIndex: number) => string | null;

  // any game
  reorderSeats: (orderedIds: string[]) => string | null;
  rematch: () => string | null;
  endGame: () => void;
  /** Leaves a (finished) match: clears the running state but keeps the setup draft players. */
  archiveMatch: () => void;

  setSortMode: (mode: SortMode) => void;
  setView: (view: GameView | null) => void;
  setTableRotation: (rotation: number) => void;
  setKeepAwake: (on: boolean) => void;
  /** Used by the sync layer. */
  patchSync: (
    patch: Partial<Pick<GameStore, "matchId" | "code" | "writeToken" | "version" | "dirty" | "syncStatus" | "syncError">>,
  ) => void;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function normalizeDraft(d: SetupDraft): SetupDraft {
  if (d.deckSize <= 0) return d;
  const allowed = maxAllowedCards(d.deckSize, Math.max(d.players.length, 2));
  return d.maxCards !== null && d.maxCards > allowed ? { ...d, maxCards: null } : d;
}

/** Drafts persisted by older versions have no game. */
function upgradeDraft(d: Partial<SetupDraft> | undefined): SetupDraft {
  if (!d || !d.gameId || !getGame(d.gameId)) {
    const base = draftFor(DEFAULT_GAME, d?.players ?? []);
    return { ...base, deckSize: d?.deckSize ?? base.deckSize, maxCards: d?.maxCards ?? null };
  }
  return { ...draftFor(d.gameId, d.players ?? []), ...d } as SetupDraft;
}

const noMatch = {
  state: null,
  matchId: null,
  localId: null,
  code: null,
  writeToken: null,
  version: 1,
  startedAt: null,
  dirty: false,
} satisfies Partial<PersistedPart>;

const newMatchMeta = {
  matchId: null,
  code: null,
  writeToken: null,
  version: 1,
  dirty: true,
};

/**
 * Flat storage format: the persisted JSON is `{ state: MatchState | null, matchId, code, writeToken, version, ..., __v }`
 * (not zustand's default `{ state: {...}, version }` wrapper) so hasRunningMatch() sees the match at top-level `state`.
 * States and drafts of older app versions are upgraded on load.
 */
const flatStorage: PersistStorage<PersistedPart> = {
  getItem: (name) => {
    try {
      const raw = window.localStorage.getItem(name);
      if (!raw) return null;
      const { __v, ...rest } = JSON.parse(raw) as PersistedPart & { __v?: number };
      const part: PersistedPart = {
        ...rest,
        state: rest.state ? (upgradeMatchState(rest.state) as MatchState) : null,
        setupDraft: upgradeDraft(rest.setupDraft),
      };
      return { state: part, version: __v ?? 1 };
    } catch {
      return null;
    }
  },
  setItem: (name, value: StorageValue<PersistedPart>) => {
    try {
      window.localStorage.setItem(name, JSON.stringify({ ...value.state, __v: value.version }));
    } catch {
      /* storage full / unavailable: keep playing in memory */
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => {
      /** Applies an engine transition; engine errors become messages. */
      const apply = (fn: (s: MatchState) => MatchState): string | null => {
        const cur = get().state;
        if (!cur) return "Kein laufendes Spiel";
        try {
          const next = fn(cur);
          if (next !== cur) set({ state: next, dirty: true });
          return null;
        } catch (e) {
          return translateEngineError(e);
        }
      };
      const applyTrick = (fn: (s: TrickMatchState) => TrickMatchState) =>
        apply((s) => {
          if (!isTrickMatch(s)) throw new Error("Not a trick-bidding match");
          return fn(s);
        });
      const applySheet = (fn: (s: SheetMatchState) => SheetMatchState) =>
        apply((s) => {
          if (s.kind !== "score-sheet") throw new Error("Not a score-sheet match");
          return fn(s);
        });

      return {
        ...noMatch,
        setupDraft: emptyDraft(),
        sortMode: "seat",
        view: null,
        tableRotation: 0,
        keepAwake: true,
        syncStatus: "idle",
        syncError: null,

        addDraftPlayer: ({ name, userId }) => {
          const clean = firstUpper(name).slice(0, MAX_NAME_LENGTH);
          if (!clean) return "Bitte einen Namen eingeben.";
          const d = get().setupDraft;
          if (d.players.length >= MAX_PLAYERS) return `Maximal ${MAX_PLAYERS} Spieler.`;
          if (d.players.some((p) => sameName(p.name, clean) || (userId !== null && p.userId === userId))) {
            return "Spieler bereits hinzugefügt!";
          }
          const player: MatchPlayer = { id: nanoid(10), name: clean, userId };
          set({ setupDraft: normalizeDraft({ ...d, players: [...d.players, player] }) });
          return null;
        },
        removeDraftPlayer: (id) =>
          set((s) => ({
            setupDraft: normalizeDraft({ ...s.setupDraft, players: s.setupDraft.players.filter((p) => p.id !== id) }),
          })),
        reorderDraft: (orderedIds) =>
          set((s) => {
            const byId = new Map(s.setupDraft.players.map((p) => [p.id, p]));
            const players = orderedIds.map((id) => byId.get(id)).filter((p): p is MatchPlayer => !!p);
            if (players.length !== s.setupDraft.players.length) return s;
            return { setupDraft: { ...s.setupDraft, players } };
          }),
        setDraftGame: (gameId) => set((s) => (getGame(gameId) ? { setupDraft: draftFor(gameId, s.setupDraft.players) } : s)),
        setDraftRuleset: (ruleset) =>
          set((s) => {
            if (ruleset.gameId !== s.setupDraft.gameId) return s;
            const deck = ruleset.kind === "trick-bidding" ? ruleset.rules.deck : null;
            const deckSize = deck ? (deck.sizes.includes(s.setupDraft.deckSize) ? s.setupDraft.deckSize : deck.defaultSize) : 0;
            const maxCards = ruleset.kind === "trick-bidding" && ruleset.rules.rounds.allowMaxCards ? s.setupDraft.maxCards : null;
            return { setupDraft: normalizeDraft({ ...s.setupDraft, rulesetId: ruleset.id, deckSize, maxCards, ...variantsOf(ruleset) }) };
          }),
        setDraftDeck: (deckSize) => set((s) => ({ setupDraft: normalizeDraft({ ...s.setupDraft, deckSize }) })),
        setDraftMaxCards: (maxCards) => set((s) => ({ setupDraft: normalizeDraft({ ...s.setupDraft, maxCards }) })),
        setDraftVariants: (patch) => set((s) => ({ setupDraft: { ...s.setupDraft, ...patch } })),
        linkDraftPlayer: (playerId, account, guestName) => {
          const d = get().setupDraft;
          const res = relinkPlayers(d.players, playerId, account, guestName);
          if (typeof res === "string") return res;
          set({ setupDraft: { ...d, players: res } });
          if (account) useLocalHistory.getState().addKnownPlayer({ name: firstUpper(userLabel(account)), userId: account.id });
          return null;
        },
        linkSeat: (playerId, account, guestName) => {
          let err: string | null = null;
          const res = apply((m) => {
            const r = relinkPlayers(m.setup.players, playerId, account, guestName);
            if (typeof r === "string") {
              err = r;
              return m;
            }
            const byId = new Map(r.map((p) => [p.id, p]));
            return mapPlayers(m, (p) => byId.get(p.id) ?? p);
          });
          if (res || err) return res ?? err;
          if (account) useLocalHistory.getState().addKnownPlayer({ name: firstUpper(userLabel(account)), userId: account.id });
          return null;
        },
        startMatch: (ruleset) => {
          const d = get().setupDraft;
          const rs = ruleset ?? builtinRulesetOf(d);
          try {
            const state = createMatch(withVariants(rs, d), d.players, { deckSize: d.deckSize || undefined, maxCards: d.maxCards });
            set({ ...newMatchMeta, state, localId: nanoid(12), startedAt: new Date().toISOString(), syncStatus: "idle" });
            return null;
          } catch (e) {
            return translateEngineError(e, "Spiel konnte nicht gestartet werden");
          }
        },

        setBid: (id, bid) => applyTrick((s) => setBid(s, id, bid)),
        setCorrect: (id, c) => applyTrick((s) => setCorrect(s, id, c)),
        setTricks: (id, t) => applyTrick((s) => setTricks(s, id, t)),
        setAllCorrect: (c) => applyTrick((s) => setAllCorrect(s, c)),
        resetRound: () => applyTrick(resetCurrentRound),
        commit: () => applyTrick((s) => (canCommitRound(s) ? commitRound(s) : s)),
        undo: () => applyTrick((s) => (canUndoRound(s) ? undoRound(s) : s)),
        correct: (r, id, patch) => applyTrick((s) => correctRound(s, r, id, patch)),
        setGiver: (id) => applyTrick((s) => setGiver(s, id)),
        setDeck: (deck) => applyTrick((s) => setDeckSize(s, deck)),

        scoreEntry: (input) => applySheet((s) => scoreEntry(s, input)),
        undoEntry: () => applySheet((s) => (canUndoEntry(s) ? undoEntry(s) : s)),
        correctEntry: (i, patch) => applySheet((s) => correctEntry(s, i, patch)),
        clearEntry: (i) => applySheet((s) => clearEntry(s, i)),

        reorderSeats: (ids) => apply((s) => (isTrickMatch(s) ? engineReorderSeats(s, ids) : reorderSheetSeats(s, ids))),
        rematch: () => {
          const cur = get().state;
          if (!cur) return "Kein laufendes Spiel";
          try {
            set({
              ...newMatchMeta,
              state: rematchMatch(cur),
              localId: nanoid(12),
              startedAt: new Date().toISOString(),
              syncStatus: "idle",
            });
            return null;
          } catch (e) {
            return translateEngineError(e);
          }
        },
        endGame: () => {
          const cur = get().state;
          const { matchId, writeToken } = get();
          if (cur && matchId && writeToken && !deriveMatch(cur).finished) {
            // Unfinished but synced: remove the server copy so spectators don't see a dead match (best effort).
            apiDelete(`/matches/${matchId}`, { headers: { "X-Write-Token": writeToken } }).catch(() => undefined);
          }
          // keep players, game and ruleset for the next setup
          const setupDraft: SetupDraft = cur
            ? {
                ...draftFor(getGame(cur.gameId) ? cur.gameId : DEFAULT_GAME, cur.setup.players),
                rulesetId: cur.ruleset.id,
                ...(isTrickMatch(cur)
                  ? {
                      deckSize: cur.setup.deckSize,
                      maxCards: cur.setup.maxCards,
                      repeatPeak: cur.rules.rounds.repeatPeak ?? false,
                      firstBidder: cur.rules.bidding.firstBidder ?? "giver",
                    }
                  : {}),
              }
            : get().setupDraft;
          set({ ...noMatch, setupDraft, syncStatus: "idle" });
        },

        archiveMatch: () => get().endGame(),
        setSortMode: (sortMode) => set({ sortMode }),
        setView: (view) => set({ view }),
        setTableRotation: (tableRotation) => set({ tableRotation }),
        setKeepAwake: (keepAwake) => set({ keepAwake }),
        patchSync: (patch) => set(patch),
      };
    },
    {
      name: GAME_STORAGE_KEY,
      version: 1,
      storage: flatStorage,
      partialize: (s): PersistedPart => ({
        state: s.state,
        matchId: s.matchId,
        localId: s.localId,
        code: s.code,
        writeToken: s.writeToken,
        version: s.version,
        startedAt: s.startedAt,
        dirty: s.dirty,
        setupDraft: s.setupDraft,
        sortMode: s.sortMode,
        view: s.view,
        tableRotation: s.tableRotation,
        keepAwake: s.keepAwake,
      }),
    },
  ),
);
