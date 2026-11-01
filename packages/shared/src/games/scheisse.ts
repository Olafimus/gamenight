import type { RulesetRef } from "../core";
import type { TrickRules } from "../kinds/trick/rules";
import type { GameDefinition, TrickRuleset } from "../ruleset";

/** Original Scheisse rules (see docs/spec-game.md). */
export const SCHEISSE_RULES: TrickRules = {
  players: { min: 2, max: 10 },
  winner: "highest",
  deck: { sizes: [32, 52, 64], defaultSize: 32 },
  rounds: { schedule: "pyramid", fixedCards: null, fixedRounds: null, allowMaxCards: true, repeatPeak: false },
  bidding: { sumRule: "free", firstBidder: "giver" },
  entry: "hit",
  tricksMustSumToCards: false,
  scoring: { hitBase: 10, hitPerTrick: 1, missBase: -10, missPerTrickDiff: 0 },
};

export const SCHEISSE_RULESET_REF: RulesetRef = { id: "scheisse.standard", name: "Standard" };

export const SCHEISSE_RULESETS: TrickRuleset[] = [
  {
    kind: "trick-bidding",
    ...SCHEISSE_RULESET_REF,
    gameId: "scheisse",
    description: "1 bis zur Höchstzahl und zurück. Richtig: 10 + Ansage, falsch: −10.",
    rules: SCHEISSE_RULES,
  },
];

export const SCHEISSE_GAME: GameDefinition = {
  id: "scheisse",
  name: "Scheisse",
  kind: "trick-bidding",
  tagline: "Stiche ansagen – rauf und wieder runter",
  material: "cards",
  defaultRulesetId: SCHEISSE_RULESET_REF.id,
};
