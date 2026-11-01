import type { TrickRules } from "../kinds/trick/rules";
import type { GameDefinition, TrickRuleset } from "../ruleset";

/**
 * Wizard (Amigo): 60 cards (52 + 4 Zauberer + 4 Narren), 3–6 players, round r = r cards
 * (60 / players rounds). Right: 20 + 10 per trick; wrong: −10 per trick of difference.
 */
export const WIZARD_RULES: TrickRules = {
  players: { min: 3, max: 6 },
  winner: "highest",
  deck: { sizes: [60], defaultSize: 60 },
  rounds: { schedule: "ascending", fixedCards: null, fixedRounds: null, allowMaxCards: true, repeatPeak: false },
  bidding: { sumRule: "free", firstBidder: "giver" },
  entry: "tricks",
  tricksMustSumToCards: true,
  scoring: { hitBase: 20, hitPerTrick: 10, missBase: 0, missPerTrickDiff: -10 },
};

export const WIZARD_RULESETS: TrickRuleset[] = [
  {
    kind: "trick-bidding",
    id: "wizard.standard",
    name: "Standard",
    gameId: "wizard",
    description: "Offizielle Regeln: Runde r = r Karten. Richtig: 20 + 10 je Stich, falsch: −10 je Stich Abweichung.",
    rules: WIZARD_RULES,
  },
  {
    kind: "trick-bidding",
    id: "wizard.not-even",
    name: "Nicht aufgehen",
    gameId: "wizard",
    description: "Variante: Die Summe der Ansagen darf nicht der Kartenzahl der Runde entsprechen.",
    rules: { ...WIZARD_RULES, bidding: { ...WIZARD_RULES.bidding, sumRule: "notEqualCards" } },
  },
];

export const WIZARD_GAME: GameDefinition = {
  id: "wizard",
  name: "Wizard",
  kind: "trick-bidding",
  tagline: "Zauberer, Narren und exakte Ansagen",
  material: "cards",
  defaultRulesetId: "wizard.standard",
};
