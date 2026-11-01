/**
 * Rules of the "trick-bidding" kind (Stichansage): every round each player bids how many tricks they
 * will take, after the round the result is entered. Covers Scheisse, Wizard, Oh Hell & co.
 * The app is a pure score keeper – cards/tricks are never simulated.
 */
import { z } from "zod";
import { baseRulesShape } from "../../core";

export const ROUND_SCHEDULES = ["pyramid", "ascending", "descending", "fixed"] as const;
export type RoundSchedule = (typeof ROUND_SCHEDULES)[number];

export const FIRST_BIDDERS = ["giver", "afterGiver"] as const;
export type FirstBidder = (typeof FIRST_BIDDERS)[number];

export const trickScoringSchema = z.object({
  /** Points for a correct bid … */
  hitBase: z.number().int().min(-1000).max(1000),
  /** … plus this per bid trick. */
  hitPerTrick: z.number().int().min(-1000).max(1000),
  /** Points for a wrong bid … */
  missBase: z.number().int().min(-1000).max(1000),
  /** … plus this per trick of difference |bid − tricks| (usually ≤ 0). Needs entry "tricks". */
  missPerTrickDiff: z.number().int().min(-1000).max(1000),
});
export type TrickScoring = z.infer<typeof trickScoringSchema>;

export const trickRulesSchema = z
  .object({
    ...baseRulesShape,
    deck: z.object({
      /** Selectable deck sizes (cards incl. special cards). */
      sizes: z.array(z.number().int().min(1).max(120)).min(1).max(10),
      defaultSize: z.number().int().min(1).max(120),
    }),
    rounds: z.object({
      /**
       * Cards per player per round, with peak = cap ?? floor(deck / players):
       *   pyramid    1, 2, …, peak, …, 2, 1   (2·peak − 1 rounds)
       *   ascending  1, 2, …, peak            (peak rounds)
       *   descending peak, …, 2, 1            (peak rounds)
       *   fixed      fixedCards × fixedRounds
       */
      schedule: z.enum(ROUND_SCHEDULES),
      fixedCards: z.number().int().min(1).max(60).nullable(),
      fixedRounds: z.number().int().min(1).max(100).nullable(),
      /** Whether the setup may cap the peak hand size ("Max. Karten"). */
      allowMaxCards: z.boolean(),
      /** Variant: the peak hand size is played twice in a row (not for "fixed"). */
      repeatPeak: z.boolean().default(false),
    }),
    bidding: z.object({
      /**
       * free           any sum of bids (sum is only shown as a hint)
       * notEqualCards  the sum of bids must not equal the cards of the round ("es darf nicht aufgehen")
       */
      sumRule: z.enum(["free", "notEqualCards"]),
      /**
       * Variant: who bids first ("Ansager") in a round.
       *   giver       the giver
       *   afterGiver  the seat after the giver
       */
      firstBidder: z.enum(FIRST_BIDDERS).default("giver"),
    }),
    /**
     * What is entered after a round:
     *   hit     right/wrong per player (✓ / ✗)
     *   tricks  the tricks actually taken (right = tricks === bid)
     */
    entry: z.enum(["hit", "tricks"]),
    /** entry "tricks": the tricks of a round must add up to the cards dealt (off for special cards that void tricks). */
    tricksMustSumToCards: z.boolean(),
    scoring: trickScoringSchema,
  })
  .superRefine((r, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
    if (r.players.min < 2) issue(["players", "min"], "Stichspiele brauchen mindestens 2 Spieler");
    if (r.players.min > r.players.max) issue(["players"], "min > max");
    if (!r.deck.sizes.includes(r.deck.defaultSize)) issue(["deck", "defaultSize"], "defaultSize muss in sizes enthalten sein");
    if (new Set(r.deck.sizes).size !== r.deck.sizes.length) issue(["deck", "sizes"], "doppelte Deckgröße");
    if (r.rounds.schedule === "fixed") {
      if (r.rounds.fixedCards === null) issue(["rounds", "fixedCards"], "für schedule 'fixed' erforderlich");
      if (r.rounds.fixedRounds === null) issue(["rounds", "fixedRounds"], "für schedule 'fixed' erforderlich");
      if (r.rounds.fixedCards !== null && r.rounds.fixedCards * r.players.max > Math.max(...r.deck.sizes)) {
        issue(["rounds", "fixedCards"], "zu viele Karten für die maximale Spielerzahl");
      }
    }
    if (r.entry === "hit" && r.scoring.missPerTrickDiff !== 0) {
      issue(["scoring", "missPerTrickDiff"], "Abzug je Differenz braucht entry 'tricks'");
    }
    if (r.entry === "hit" && r.tricksMustSumToCards) issue(["tricksMustSumToCards"], "nur mit entry 'tricks'");
    if (Math.floor(Math.min(...r.deck.sizes) / r.players.max) < 1) issue(["deck", "sizes"], "Deck zu klein für die maximale Spielerzahl");
  });
export type TrickRules = z.infer<typeof trickRulesSchema>;
