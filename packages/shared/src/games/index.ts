/** Catalog of built-in games and rulesets. New games: add a file here and register it below. */
import type { GameDefinition, Ruleset } from "../ruleset";
import { KNIFFEL_GAME, KNIFFEL_RULESETS } from "./kniffel";
import { SCHEISSE_GAME, SCHEISSE_RULESETS } from "./scheisse";
import { WIZARD_GAME, WIZARD_RULESETS } from "./wizard";

export * from "./kniffel";
export * from "./scheisse";
export * from "./wizard";

export const GAMES: GameDefinition[] = [SCHEISSE_GAME, WIZARD_GAME, KNIFFEL_GAME];
export const GAME_IDS: string[] = GAMES.map((g) => g.id);

export const BUILTIN_RULESETS: Ruleset[] = [...SCHEISSE_RULESETS, ...WIZARD_RULESETS, ...KNIFFEL_RULESETS];

export function getGame(gameId: string): GameDefinition | undefined {
  return GAMES.find((g) => g.id === gameId);
}

export function getBuiltinRuleset(rulesetId: string): Ruleset | undefined {
  return BUILTIN_RULESETS.find((r) => r.id === rulesetId);
}

/** The game's default ruleset. Throws for unknown games. */
export function defaultRuleset(gameId: string): Ruleset {
  const game = getGame(gameId);
  const rs = game && getBuiltinRuleset(game.defaultRulesetId);
  if (!rs) throw new Error(`Unknown game: ${gameId}`);
  return rs;
}

export function isBuiltinRulesetId(id: string): boolean {
  return BUILTIN_RULESETS.some((r) => r.id === id);
}
