/**
 * Game-independent building blocks shared by every game kind.
 *
 * Terminology:
 *   kind     – the scoring mechanic / engine (e.g. "trick-bidding", "score-sheet"). Decides the shape of
 *              the match state and how it is derived. New kinds need code.
 *   game     – a concrete game (Scheisse, Wizard, Kniffel) = a kind + metadata + a default ruleset.
 *   ruleset  – a configuration of a kind for one game (built-in or user-defined). Matches store a
 *              snapshot of the rules they were started with, so later edits never change history.
 */
import { z } from "zod";

export const GAME_KINDS = ["trick-bidding", "score-sheet"] as const;
export type GameKind = (typeof GAME_KINDS)[number];

/** A participant of a match. `id` is a client-generated stable id (nanoid). */
export const matchPlayerSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(30),
  /** Registered account id, or null for an anonymous guest. */
  userId: z.string().uuid().nullable(),
});
export type MatchPlayer = z.infer<typeof matchPlayerSchema>;

/** Hard limits across all games (rulesets may narrow them). */
export const MAX_PLAYERS = 10;

export const rulesetRefSchema = z.object({
  /** built-in: "<gameId>.<variant>", custom: uuid */
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(60),
});
export type RulesetRef = z.infer<typeof rulesetRefSchema>;

/** Fields every kind's rules share. */
export const baseRulesShape = {
  players: z.object({
    min: z.number().int().min(1).max(MAX_PLAYERS),
    max: z.number().int().min(1).max(MAX_PLAYERS),
  }),
  /** Whether the highest or the lowest total wins. */
  winner: z.enum(["highest", "lowest"]),
};

/** Common fields of every match state (the kind-specific part is added by each kind). */
export const baseMatchStateShape = {
  gameId: z.string().min(1).max(32),
  ruleset: rulesetRefSchema,
};

/**
 * Competition ranking: ties share the best rank.
 * highest: rank[i] = 1 + count(totals[j] > totals[i]); lowest: the other way round.
 */
export function rankTotals(totals: number[], winner: "highest" | "lowest" = "highest"): number[] {
  return totals.map((t) => 1 + totals.filter((o) => (winner === "highest" ? o > t : o < t)).length);
}

/** Id of the player seated after `playerId` (wraps). Falls back to the first player if unknown. */
export function nextSeatId(players: MatchPlayer[], playerId: string): string {
  if (players.length === 0) return "";
  const idx = players.findIndex((p) => p.id === playerId);
  if (idx < 0) return (players[0] as MatchPlayer).id;
  return (players[(idx + 1) % players.length] as MatchPlayer).id;
}

export function assertPlayerIn(players: MatchPlayer[], playerId: string): void {
  if (!players.some((p) => p.id === playerId)) throw new Error(`Unknown player id: ${playerId}`);
}

/** Throws on fewer/more players than allowed or duplicate ids. */
export function assertPlayers(players: MatchPlayer[], limits: { min: number; max: number }): void {
  if (players.length < limits.min) throw new Error(`A match needs at least ${limits.min} player(s)`);
  if (players.length > limits.max) throw new Error(`A match allows at most ${limits.max} players`);
  const ids = new Set(players.map((p) => p.id));
  if (ids.size !== players.length) throw new Error("Duplicate player ids");
}

/** New seat order (array of all player ids). */
export function reorderPlayers(players: MatchPlayer[], orderedIds: string[]): MatchPlayer[] {
  const unique = new Set(orderedIds);
  if (orderedIds.length !== players.length || unique.size !== orderedIds.length || !players.every((p) => unique.has(p.id))) {
    throw new Error("Seat order must contain exactly the ids of all players");
  }
  const byId = new Map(players.map((p) => [p.id, p]));
  return orderedIds.map((pid) => ({ ...(byId.get(pid) as MatchPlayer) }));
}

/** Keys of `rec` must all be player ids. */
export function onlyKnownKeys(rec: Record<string, unknown> | undefined, ids: Set<string>): boolean {
  return rec === undefined || Object.keys(rec).every((k) => ids.has(k));
}
