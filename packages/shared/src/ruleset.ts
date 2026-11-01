/**
 * Games and rulesets. A ruleset configures a kind for one game; built-in rulesets live in code
 * (games/*), user-defined ones in the database (same shape).
 */
import { z } from "zod";
import type { GameKind } from "./core";
import { sheetRulesSchema } from "./kinds/sheet/rules";
import { trickRulesSchema } from "./kinds/trick/rules";

const rulesetMeta = {
  /** built-in: "<gameId>.<variant>", custom: uuid */
  id: z.string().min(1).max(64),
  gameId: z.string().min(1).max(32),
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(500),
};

export const trickRulesetSchema = z.object({ kind: z.literal("trick-bidding"), ...rulesetMeta, rules: trickRulesSchema });
export const sheetRulesetSchema = z.object({ kind: z.literal("score-sheet"), ...rulesetMeta, rules: sheetRulesSchema });
export const rulesetSchema = z.discriminatedUnion("kind", [trickRulesetSchema, sheetRulesetSchema]);

export type TrickRuleset = z.infer<typeof trickRulesetSchema>;
export type SheetRuleset = z.infer<typeof sheetRulesetSchema>;
export type Ruleset = z.infer<typeof rulesetSchema>;
export type RulesOf<K extends GameKind> = Extract<Ruleset, { kind: K }>["rules"];

export interface GameDefinition {
  id: string;
  name: string;
  kind: GameKind;
  /** one line for tiles */
  tagline: string;
  /** "card" | "dice" | … – for icons/grouping */
  material: "cards" | "dice" | "other";
  defaultRulesetId: string;
}
