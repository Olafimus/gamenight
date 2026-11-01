/**
 * Rules of the "score-sheet" kind (Punkteblock): every player has a sheet of categories, each filled
 * exactly once (per column). Covers Kniffel/Yahtzee and its variants; with "manual" categories any
 * fill-in score sheet works without dice.
 */
import { z } from "zod";
import { baseRulesShape } from "../../core";

const slug = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, "nur a-z, 0-9, _ und -");
const points = z.number().int().min(-10_000).max(10_000);

/** How a category is scored from the dice (or, for "manual", entered freely). */
export const sheetScoringSchema = z.discriminatedUnion("type", [
  /** Sum of all dice showing `face` (Einser … Sechser). */
  z.object({ type: z.literal("faceSum"), face: z.number().int().min(1).max(20) }),
  /** At least `count` dice of one face (Dreierpasch, Viererpasch, Kniffel). "sum" = sum of all dice. */
  z.object({ type: z.literal("ofAKind"), count: z.number().int().min(2).max(10), points: z.union([z.literal("sum"), points]) }),
  /** Groups of equal dice with distinct faces, e.g. [3, 2] = Full House, [2, 2] = Zwei Paare. */
  z.object({ type: z.literal("groups"), groups: z.array(z.number().int().min(1).max(10)).min(2).max(5), points: z.union([z.literal("sum"), points]) }),
  /** At least `length` consecutive faces (Kleine Straße 4, Große Straße 5). */
  z.object({ type: z.literal("straight"), length: z.number().int().min(2).max(20), points: z.union([z.literal("sum"), points]) }),
  /** Sum of all dice. */
  z.object({ type: z.literal("chance") }),
  /** Free entry (no dice): min..max in steps of `step` (counted from min). */
  z.object({ type: z.literal("manual"), min: points, max: points, step: z.number().int().min(1).max(1000) }),
]);
export type SheetScoring = z.infer<typeof sheetScoringSchema>;

export const sheetCategorySchema = z.object({
  id: slug,
  label: z.string().trim().min(1).max(40),
  /** compact label for narrow columns */
  short: z.string().trim().min(1).max(12).optional(),
  scoring: sheetScoringSchema,
});
export type SheetCategory = z.infer<typeof sheetCategorySchema>;

/** Bonus for a section: granted when the section's sum (per column) reaches `threshold`. Several = tiers (all reached ones count). */
export const sheetBonusSchema = z.object({
  id: slug,
  label: z.string().trim().min(1).max(40),
  threshold: points,
  points,
});
export type SheetBonus = z.infer<typeof sheetBonusSchema>;

export const sheetSectionSchema = z.object({
  id: slug,
  label: z.string().trim().min(1).max(40),
  categories: z.array(sheetCategorySchema).min(1).max(30),
  bonuses: z.array(sheetBonusSchema).max(5),
});
export type SheetSection = z.infer<typeof sheetSectionSchema>;

export const sheetColumnSchema = z.object({
  label: z.string().trim().min(1).max(20),
  /** Column total is multiplied by this (e.g. "Dreifach-Kniffel": 1, 2, 3). */
  multiplier: z.number().int().min(1).max(10),
});
export type SheetColumn = z.infer<typeof sheetColumnSchema>;

export const sheetRulesSchema = z
  .object({
    ...baseRulesShape,
    /** Dice used for computing/validating scores. null = no dice (only "manual" categories). */
    dice: z.object({ count: z.number().int().min(1).max(10), faces: z.number().int().min(2).max(20) }).nullable(),
    sections: z.array(sheetSectionSchema).min(1).max(5),
    columns: z.array(sheetColumnSchema).min(1).max(6),
    /**
     * any      categories may be filled in any order
     * topDown  each column must be filled from top to bottom ("Kniffel von oben nach unten")
     */
    fillOrder: z.enum(["any", "topDown"]),
    /**
     * Extra points when the `categoryId` combination (all dice equal, e.g. Kniffel) is rolled again after it
     * was already scored with > 0 points. Joker:
     *   none    no joker, the roll scores normally
     *   free    the roll counts as Full House / Straßen (full points) in any open category
     *   forced  like free, but the matching upper category (faceSum) must be used if it is still open
     * null = no extra bonus, no joker.
     */
    repeatBonus: z
      .object({
        categoryId: slug,
        points,
        joker: z.enum(["none", "free", "forced"]),
      })
      .nullable(),
  })
  .superRefine((r, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
    if (r.players.min > r.players.max) issue(["players"], "min > max");
    const seen = new Set<string>();
    const cats = r.sections.flatMap((s) => s.categories);
    for (const c of cats) {
      if (seen.has(c.id)) issue(["sections"], `doppelte Kategorie-ID „${c.id}“`);
      seen.add(c.id);
    }
    if (new Set(r.sections.map((s) => s.id)).size !== r.sections.length) issue(["sections"], "doppelte Abschnitts-ID");
    r.sections.forEach((sec, si) =>
      sec.categories.forEach((c, ci) => {
        const path = ["sections", si, "categories", ci, "scoring"];
        const sc = c.scoring;
        if (sc.type === "manual") {
          if (sc.min > sc.max) issue(path, "min > max");
          return;
        }
        if (!r.dice) return issue(path, "ohne Würfel sind nur manuelle Kategorien möglich");
        const { count, faces } = r.dice;
        if (sc.type === "faceSum" && sc.face > faces) issue(path, `Augenzahl ${sc.face} > ${faces}`);
        if (sc.type === "ofAKind" && sc.count > count) issue(path, `${sc.count} gleiche bei ${count} Würfeln unmöglich`);
        if (sc.type === "groups" && sc.groups.reduce((a, b) => a + b, 0) > count) issue(path, "Gruppen brauchen mehr Würfel als vorhanden");
        if (sc.type === "groups" && sc.groups.length > faces) issue(path, "mehr Gruppen als Augenzahlen");
        if (sc.type === "straight" && sc.length > Math.min(count, faces)) issue(path, "Straße länger als möglich");
      }),
    );
    if (r.repeatBonus) {
      const target = cats.find((c) => c.id === r.repeatBonus!.categoryId);
      if (!target) issue(["repeatBonus", "categoryId"], "unbekannte Kategorie");
      else if (target.scoring.type !== "ofAKind" || !r.dice || target.scoring.count !== r.dice.count) {
        issue(["repeatBonus", "categoryId"], "muss eine „alle Würfel gleich“-Kategorie sein");
      }
    }
  });
export type SheetRules = z.infer<typeof sheetRulesSchema>;

/** All categories in sheet order. */
export function sheetCategories(rules: SheetRules): SheetCategory[] {
  return rules.sections.flatMap((s) => s.categories);
}
