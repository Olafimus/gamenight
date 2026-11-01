import type { SheetRules } from "../kinds/sheet/rules";
import type { GameDefinition, SheetRuleset } from "../ruleset";

/**
 * Kniffel: 5 dice, 13 categories. Upper section bonus 35 from 63 points.
 * Standard: no extra points for further Kniffel (configurable via repeatBonus).
 */
export const KNIFFEL_RULES: SheetRules = {
  players: { min: 1, max: 10 },
  winner: "highest",
  dice: { count: 5, faces: 6 },
  sections: [
    {
      id: "oben",
      label: "Oberer Teil",
      categories: [
        { id: "einser", label: "Einser", short: "1er", scoring: { type: "faceSum", face: 1 } },
        { id: "zweier", label: "Zweier", short: "2er", scoring: { type: "faceSum", face: 2 } },
        { id: "dreier", label: "Dreier", short: "3er", scoring: { type: "faceSum", face: 3 } },
        { id: "vierer", label: "Vierer", short: "4er", scoring: { type: "faceSum", face: 4 } },
        { id: "fuenfer", label: "Fünfer", short: "5er", scoring: { type: "faceSum", face: 5 } },
        { id: "sechser", label: "Sechser", short: "6er", scoring: { type: "faceSum", face: 6 } },
      ],
      bonuses: [{ id: "bonus", label: "Bonus (ab 63)", threshold: 63, points: 35 }],
    },
    {
      id: "unten",
      label: "Unterer Teil",
      categories: [
        { id: "dreierpasch", label: "Dreierpasch", short: "3er-P.", scoring: { type: "ofAKind", count: 3, points: "sum" } },
        { id: "viererpasch", label: "Viererpasch", short: "4er-P.", scoring: { type: "ofAKind", count: 4, points: "sum" } },
        { id: "fullhouse", label: "Full House", short: "FH", scoring: { type: "groups", groups: [3, 2], points: 25 } },
        { id: "kleine-strasse", label: "Kleine Straße", short: "kl. Str.", scoring: { type: "straight", length: 4, points: 30 } },
        { id: "grosse-strasse", label: "Große Straße", short: "gr. Str.", scoring: { type: "straight", length: 5, points: 40 } },
        { id: "kniffel", label: "Kniffel", short: "Kniffel", scoring: { type: "ofAKind", count: 5, points: 50 } },
        { id: "chance", label: "Chance", short: "Chance", scoring: { type: "chance" } },
      ],
      bonuses: [],
    },
  ],
  columns: [{ label: "Spiel", multiplier: 1 }],
  fillOrder: "any",
  repeatBonus: null,
};

export const KNIFFEL_RULESETS: SheetRuleset[] = [
  {
    kind: "score-sheet",
    id: "kniffel.standard",
    name: "Standard",
    gameId: "kniffel",
    description: "13 Felder, Bonus 35 ab 63 Punkten im oberen Teil.",
    rules: KNIFFEL_RULES,
  },
  {
    kind: "score-sheet",
    id: "kniffel.joker",
    name: "Kniffel-Bonus & Joker",
    gameId: "kniffel",
    description: "Jeder weitere Kniffel bringt 100 Bonuspunkte und gilt als Joker (passendes oberes Feld zuerst).",
    rules: { ...KNIFFEL_RULES, repeatBonus: { categoryId: "kniffel", points: 100, joker: "forced" } },
  },
];

export const KNIFFEL_GAME: GameDefinition = {
  id: "kniffel",
  name: "Kniffel",
  kind: "score-sheet",
  tagline: "Fünf Würfel, drei Würfe, dreizehn Felder",
  material: "dice",
  defaultRulesetId: "kniffel.standard",
};
