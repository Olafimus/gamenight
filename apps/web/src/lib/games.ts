import { useQuery } from "@tanstack/react-query";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { BUILTIN_RULESETS, GAMES, getGame, type GameCatalogDto, type GameDefinition, type RulesetDto } from "@gamenight/shared";
import { apiGet } from "./api";
import { useAuth } from "./auth";

/** Built-in games and rulesets: always available, also offline. */
export const BUILTIN_CATALOG: GameCatalogDto = {
  games: GAMES,
  rulesets: BUILTIN_RULESETS.map((r) => ({ ...r, builtin: true, ownerUserId: null, createdAt: null, updatedAt: null })),
};

export const catalogKey = (userId: string | null | undefined) => ["games", userId ?? null] as const;

/** Games + rulesets (built-in and the logged-in user's own). Falls back to the built-ins while loading/offline. */
export function useGameCatalog() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: catalogKey(user?.id),
    queryFn: ({ signal }) => apiGet<GameCatalogDto>("/games", { signal }),
    staleTime: 60_000,
  });
  const data = q.data ?? BUILTIN_CATALOG;
  return {
    games: data.games,
    rulesets: data.rulesets,
    loading: q.isPending,
    offline: q.isError,
    rulesetsOf: (gameId: string): RulesetDto[] => data.rulesets.filter((r) => r.gameId === gameId),
    game: (gameId: string): GameDefinition | undefined => data.games.find((g) => g.id === gameId),
    ruleset: (id: string): RulesetDto | undefined => data.rulesets.find((r) => r.id === id),
  };
}

export const SELECTED_GAME_STORAGE_KEY = "scheisse.selectedGame.v1";
const DEFAULT_GAME = "scheisse";

interface SelectedGameState {
  gameId: string;
  select: (gameId: string) => void;
}

/** The game chosen on the start page; setup, statistics and rulesets work with it. */
export const useSelectedGameStore = create<SelectedGameState>()(
  persist(
    (set) => ({
      gameId: DEFAULT_GAME,
      select: (gameId) => set(getGame(gameId) ? { gameId } : {}),
    }),
    { name: SELECTED_GAME_STORAGE_KEY, partialize: (s) => ({ gameId: s.gameId }) },
  ),
);

/** Selected game id (always a known built-in game). */
export function useSelectedGame(): string {
  const id = useSelectedGameStore((s) => s.gameId);
  return getGame(id) ? id : DEFAULT_GAME;
}

export const MATERIAL_ICON: Record<GameDefinition["material"], string> = { cards: "🃏", dice: "🎲", other: "🎯" };
