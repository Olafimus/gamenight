/** Pure dice scoring for the "score-sheet" kind. */
import type { SheetRules, SheetScoring } from "./rules";

type DiceSpec = NonNullable<SheetRules["dice"]>;

const sum = (dice: number[]) => dice.reduce((a, b) => a + b, 0);

/** Count per face, sorted descending (e.g. [3, 2] for a full house). */
function groupSizes(dice: number[]): number[] {
  const counts = new Map<number, number>();
  for (const d of dice) counts.set(d, (counts.get(d) ?? 0) + 1);
  return [...counts.values()].sort((a, b) => b - a);
}

function longestRun(dice: number[]): number {
  const faces = [...new Set(dice)].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  faces.forEach((f, i) => {
    run = i > 0 && f === (faces[i - 1] as number) + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

export function assertDice(dice: number[], spec: DiceSpec): void {
  if (dice.length !== spec.count) throw new Error(`Expected ${spec.count} dice, got ${dice.length}`);
  for (const d of dice) {
    if (!Number.isInteger(d) || d < 1 || d > spec.faces) throw new Error(`Invalid die: ${d}`);
  }
}

/** All dice show the same face. */
export function isAllSame(dice: number[]): boolean {
  return dice.length > 0 && dice.every((d) => d === dice[0]);
}

/**
 * Points of `dice` in a category. `joker` = the roll is a repeated all-same combination that may be used
 * as a joker: fixed-point "groups" and "straight" categories then score full points.
 */
export function scoreDice(scoring: SheetScoring, dice: number[], joker = false): number {
  const fixedOrSum = (p: number | "sum") => (p === "sum" ? sum(dice) : p);
  switch (scoring.type) {
    case "faceSum":
      return dice.filter((d) => d === scoring.face).length * scoring.face;
    case "ofAKind":
      return (groupSizes(dice)[0] ?? 0) >= scoring.count ? fixedOrSum(scoring.points) : 0;
    case "groups": {
      if (joker) return fixedOrSum(scoring.points);
      const have = groupSizes(dice);
      const need = [...scoring.groups].sort((a, b) => b - a);
      return need.every((g, i) => (have[i] ?? 0) >= g) ? fixedOrSum(scoring.points) : 0;
    }
    case "straight":
      return joker || longestRun(dice) >= scoring.length ? fixedOrSum(scoring.points) : 0;
    case "chance":
      return sum(dice);
    case "manual":
      throw new Error("Manual categories are not scored from dice");
  }
}

/**
 * Whether `points` can be the score of a category (used when points are entered without dice).
 * 0 is always possible for dice categories (striking a field).
 */
export function isPossibleScore(scoring: SheetScoring, dice: DiceSpec | null, points: number): boolean {
  if (!Number.isInteger(points)) return false;
  if (scoring.type === "manual") {
    return points >= scoring.min && points <= scoring.max && (points - scoring.min) % scoring.step === 0;
  }
  if (!dice) return false;
  if (points === 0) return true;
  const minSum = dice.count;
  const maxSum = dice.count * dice.faces;
  const inSumRange = points >= minSum && points <= maxSum;
  const fixedOrSum = (p: number | "sum") => points === 0 || (p === "sum" ? inSumRange : points === p);
  switch (scoring.type) {
    case "faceSum":
      return points >= 0 && points <= dice.count * scoring.face && points % scoring.face === 0;
    case "ofAKind":
    case "groups":
    case "straight":
      return fixedOrSum(scoring.points);
    case "chance":
      return inSumRange;
  }
}
