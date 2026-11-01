import { deriveMatch, upgradeMatchState, type MatchState } from "@gamenight/shared";

/** Key used by the game store (zustand persist) in localStorage. */
export const GAME_STORAGE_KEY = "scheisse.game.v1";

/** True if the game store holds a running (not yet finished) match. */
export function hasRunningMatch(): boolean {
  try {
    const raw = window.localStorage.getItem(GAME_STORAGE_KEY);
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return false;
    const state = (parsed as { state?: unknown }).state;
    if (state == null) return false;
    return !deriveMatch(upgradeMatchState(state) as MatchState).finished;
  } catch {
    return false;
  }
}
