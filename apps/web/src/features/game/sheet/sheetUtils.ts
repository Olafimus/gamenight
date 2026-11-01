import { sheetCategories, type SheetCategory, type SheetMatchState, type SheetRules, type SheetScoring } from "@gamenight/shared";

/** A cell of the sheet: player × column × category. */
export interface CellRef {
  playerId: string;
  column: number;
  categoryId: string;
}

/**
 * Points that can be picked directly (without dice) for a category, or null when the range is too
 * large for buttons (then a number input is shown). 0 = strike.
 */
export function quickOptions(scoring: SheetScoring, dice: SheetRules["dice"]): number[] | null {
  switch (scoring.type) {
    case "faceSum": {
      const count = dice?.count ?? 0;
      return Array.from({ length: count + 1 }, (_, i) => i * scoring.face);
    }
    case "ofAKind":
    case "groups":
    case "straight":
      return scoring.points === "sum" ? null : [0, scoring.points];
    case "chance":
      return null;
    case "manual": {
      const n = Math.floor((scoring.max - scoring.min) / scoring.step) + 1;
      return n <= 12 ? Array.from({ length: n }, (_, i) => scoring.min + i * scoring.step) : null;
    }
  }
}

/** Range for the number input of categories without quick options. */
export function pointRange(scoring: SheetScoring, dice: SheetRules["dice"]): { min: number; max: number } {
  if (scoring.type === "manual") return { min: scoring.min, max: scoring.max };
  const count = dice?.count ?? 1;
  return { min: 0, max: count * (dice?.faces ?? 6) };
}

/** Short explanation of a category for tooltips/dialogs. */
export function describeScoring(scoring: SheetScoring): string {
  const pts = (p: number | "sum") => (p === "sum" ? "Augensumme" : `${p} Punkte`);
  switch (scoring.type) {
    case "faceSum":
      return `Summe aller ${scoring.face}er`;
    case "ofAKind":
      return `Mindestens ${scoring.count} gleiche: ${pts(scoring.points)}`;
    case "groups":
      return `${scoring.groups.join(" + ")} gleiche: ${pts(scoring.points)}`;
    case "straight":
      return `${scoring.length} in Folge: ${pts(scoring.points)}`;
    case "chance":
      return "Augensumme";
    case "manual":
      return `Freie Eingabe ${scoring.min} bis ${scoring.max}`;
  }
}

export function categoryById(rules: SheetRules, id: string): SheetCategory | undefined {
  return sheetCategories(rules).find((c) => c.id === id);
}

/** Index of the entry that filled a cell, or -1. */
export function entryIndexOf(state: SheetMatchState, ref: CellRef): number {
  return state.entries.findIndex((e) => e.playerId === ref.playerId && e.column === ref.column && e.categoryId === ref.categoryId);
}

/** Count of strikes (0-point cells) of a player. */
export function strikesOf(state: SheetMatchState, playerId: string): number {
  return state.entries.filter((e) => e.playerId === playerId && e.points === 0).length;
}
