/**
 * Match state of the "score-sheet" kind. Event-sourced: the state is the ordered list of entries
 * (one per filled cell). Sheets, sums, bonuses, turn order and placements are derived by
 * `deriveSheetMatch()`. Undo = drop the last entry.
 */
import { z } from "zod";
import { baseMatchStateShape, MAX_PLAYERS, matchPlayerSchema, type MatchPlayer } from "../../core";
import { sheetRulesSchema } from "./rules";

export const sheetEntrySchema = z.object({
  playerId: z.string().min(1).max(64),
  /** 0-based index into rules.columns */
  column: z.number().int().min(0).max(5),
  categoryId: z.string().min(1).max(32),
  /** Points of the cell (computed from `dice` if present). */
  points: z.number().int().min(-10_000).max(10_000),
  /** The final roll, if it was entered. */
  dice: z.array(z.number().int().min(1).max(20)).max(10).optional(),
  /** Without dice: the roll was a repeated all-same combination (rules.repeatBonus). Ignored when dice are given. */
  repeat: z.boolean().optional(),
});
export type SheetEntry = z.infer<typeof sheetEntrySchema>;

export const sheetSetupSchema = z.object({
  /** Seat order == turn order. */
  players: z.array(matchPlayerSchema).min(1).max(MAX_PLAYERS),
});
export type SheetSetup = z.infer<typeof sheetSetupSchema>;

export const sheetMatchStateSchema = z.object({
  kind: z.literal("score-sheet"),
  ...baseMatchStateShape,
  rules: sheetRulesSchema,
  setup: sheetSetupSchema,
  entries: z.array(sheetEntrySchema).max(MAX_PLAYERS * 6 * 40),
});
export type SheetMatchState = z.infer<typeof sheetMatchStateSchema>;

export interface SheetCell {
  points: number;
  /** index into state.entries */
  entryIndex: number;
  /** repeat bonus earned with this entry */
  repeatBonus: number;
}

export interface SheetSectionTotal {
  id: string;
  /** sum of the section's filled cells */
  sum: number;
  /** ids of reached bonuses */
  bonuses: string[];
  bonusPoints: number;
  /** sum + bonusPoints */
  total: number;
  /** all cells of the section are filled (a missed bonus is final) */
  filled: boolean;
}

export interface SheetDerivedColumn {
  /** categoryId -> cell (null = open) */
  cells: Record<string, SheetCell | null>;
  sections: SheetSectionTotal[];
  repeatBonusPoints: number;
  /** sections + repeat bonus, before the multiplier */
  raw: number;
  multiplier: number;
  /** raw × multiplier */
  total: number;
}

export interface SheetDerivedPlayer extends MatchPlayer {
  seat: number;
  columns: SheetDerivedColumn[];
  /** filled cells over all columns */
  filled: number;
  total: number;
  /** Current rank (by total, rules.winner); null before anything is entered. */
  placement: number | null;
}

export interface SheetDerivedMatch {
  kind: "score-sheet";
  gameId: string;
  players: SheetDerivedPlayer[];
  /** Cells per player (categories × columns) == number of turns per player. */
  totalRounds: number;
  /** Turns every player has completed (min filled). */
  roundsPlayed: number;
  /** 1-based number of the turn cycle in progress (== totalRounds when finished). */
  roundNumber: number;
  /** Player whose turn it is (fewest filled cells, seat order); "" when finished. */
  activePlayerId: string;
  finished: boolean;
}
