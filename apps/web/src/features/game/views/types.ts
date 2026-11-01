import type { DerivedMatch, DerivedPlayer, MatchState } from "@scheisse/shared";
import type { RoundActions } from "./controls";

export interface ViewProps {
  state: MatchState;
  match: DerivedMatch;
  /** Players in display order (sorted by the chosen sort mode). */
  players: DerivedPlayer[];
  actions: RoundActions;
}
