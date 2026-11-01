/**
 * Kind-independent match API: the MatchState union, validation, derivation and creation.
 * Server and generic UI code use these; kind-specific UI uses the kind engines directly.
 */
import { z } from "zod";
import type { MatchPlayer } from "./core";
import { SCHEISSE_RULES, SCHEISSE_RULESET_REF } from "./games/scheisse";
import { assertSheetConsistent, createSheetMatch, deriveSheetMatch, rematchSheet } from "./kinds/sheet/engine";
import { sheetMatchStateSchema, type SheetDerivedMatch, type SheetDerivedPlayer, type SheetMatchState } from "./kinds/sheet/types";
import { assertTrickConsistent, createMatchState, deriveTrickMatch, rematch as rematchTrick } from "./kinds/trick/engine";
import { trickMatchStateSchema, type TrickDerivedMatch, type TrickDerivedPlayer, type TrickMatchState } from "./kinds/trick/types";
import type { Ruleset } from "./ruleset";

export type MatchState = TrickMatchState | SheetMatchState;
export type DerivedMatch = TrickDerivedMatch | SheetDerivedMatch;
export type DerivedPlayer = TrickDerivedPlayer | SheetDerivedPlayer;

/**
 * Upgrades stored/sent states of older app versions:
 *   v1 (Scheisse only, no `kind`) -> trick-bidding with the Scheisse standard rules.
 * Unknown input is returned unchanged (the schema rejects it).
 */
export function upgradeMatchState(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || "kind" in raw) return raw;
  const v1 = raw as { setup?: unknown; rounds?: unknown };
  if (!v1.setup || !Array.isArray(v1.rounds)) return raw;
  return { kind: "trick-bidding", gameId: "scheisse", ruleset: { ...SCHEISSE_RULESET_REF }, rules: SCHEISSE_RULES, ...raw };
}

/** Accepts current and legacy (v1) states; output is always the current format. */
export const matchStateSchema = z.preprocess(upgradeMatchState, z.discriminatedUnion("kind", [trickMatchStateSchema, sheetMatchStateSchema]));

export function isTrickMatch(state: MatchState): state is TrickMatchState {
  return state.kind === "trick-bidding";
}

export function isSheetMatch(state: MatchState): state is SheetMatchState {
  return state.kind === "score-sheet";
}

/** Derives everything shown in the UI from a match state. */
export function deriveMatch(state: TrickMatchState): TrickDerivedMatch;
export function deriveMatch(state: SheetMatchState): SheetDerivedMatch;
export function deriveMatch(state: MatchState): DerivedMatch;
export function deriveMatch(state: MatchState): DerivedMatch {
  return isTrickMatch(state) ? deriveTrickMatch(state) : deriveSheetMatch(state);
}

/** Structural + rule checks beyond the schema. Throws with a readable message. */
export function assertMatchConsistent(state: MatchState): void {
  if (isTrickMatch(state)) assertTrickConsistent(state);
  else assertSheetConsistent(state);
}

export function matchPlayers(state: MatchState): MatchPlayer[] {
  return state.setup.players;
}

/** Same state with every player mapped (e.g. linking a guest seat to an account). */
export function mapPlayers<S extends MatchState>(state: S, fn: (p: MatchPlayer) => MatchPlayer): S {
  return { ...state, setup: { ...state.setup, players: state.setup.players.map(fn) } };
}

export interface CreateMatchOptions {
  /** trick-bidding: one of rules.deck.sizes (default rules.deck.defaultSize) */
  deckSize?: number;
  /** trick-bidding: peak cap (only if rules.rounds.allowMaxCards) */
  maxCards?: number | null;
  /** trick-bidding: giver of round 1 (default first seat) */
  firstGiverId?: string;
}

/** New match of any game from a ruleset (built-in or custom). */
export function createMatch(ruleset: Ruleset, players: MatchPlayer[], options: CreateMatchOptions = {}): MatchState {
  const ref = { id: ruleset.id, name: ruleset.name };
  if (ruleset.kind === "trick-bidding") {
    return createMatchState(
      { players, deckSize: options.deckSize ?? ruleset.rules.deck.defaultSize, maxCards: options.maxCards ?? null },
      options.firstGiverId,
      { gameId: ruleset.gameId, ruleset: ref, rules: ruleset.rules },
    );
  }
  return createSheetMatch({ players }, { gameId: ruleset.gameId, ruleset: ref, rules: ruleset.rules });
}

/** "Noch ein Match": same players, seat order and rules. */
export function rematchMatch(state: MatchState): MatchState {
  return isTrickMatch(state) ? rematchTrick(state) : rematchSheet(state);
}
