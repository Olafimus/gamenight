import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface KnownPlayer {
  name: string;
  userId: string | null;
}

export interface LocalMatchRecord {
  matchId: string;
  code: string;
  startedAt: string;
  finishedAt: string;
  players: { name: string; userId: string | null; finalScore: number; placement: number }[];
}

export interface LocalHistoryState {
  /** Most recently used first. */
  knownPlayers: KnownPlayer[];
  /** Most recently finished first. */
  playedMatches: LocalMatchRecord[];
  addKnownPlayer: (player: KnownPlayer) => void;
  /** Dedupes by matchId (an existing record is replaced, e.g. after a correction). */
  addPlayedMatch: (record: LocalMatchRecord) => void;
  clear: () => void;
}

export const HISTORY_STORAGE_KEY = "scheisse.history.v1";
const MAX_KNOWN = 50;
const MAX_MATCHES = 200;

const sameKnown = (a: KnownPlayer, b: KnownPlayer) =>
  a.userId !== null || b.userId !== null ? a.userId === b.userId : a.name.toLowerCase() === b.name.toLowerCase();

export const useLocalHistory = create<LocalHistoryState>()(
  persist(
    (set) => ({
      knownPlayers: [],
      playedMatches: [],
      addKnownPlayer: (player) =>
        set((s) => ({
          knownPlayers: [player, ...s.knownPlayers.filter((p) => !sameKnown(p, player))].slice(0, MAX_KNOWN),
        })),
      addPlayedMatch: (record) =>
        set((s) => {
          const idx = s.playedMatches.findIndex((m) => m.matchId === record.matchId);
          if (idx >= 0) {
            const next = s.playedMatches.slice();
            next[idx] = record;
            return { playedMatches: next };
          }
          return { playedMatches: [record, ...s.playedMatches].slice(0, MAX_MATCHES) };
        }),
      clear: () => set({ knownPlayers: [], playedMatches: [] }),
    }),
    {
      name: HISTORY_STORAGE_KEY,
      version: 1,
      partialize: (s) => ({ knownPlayers: s.knownPlayers, playedMatches: s.playedMatches }),
    },
  ),
);
