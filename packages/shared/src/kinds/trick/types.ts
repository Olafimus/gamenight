/**
 * Match state of the "trick-bidding" kind. Event-sourced: the state stores only inputs (setup +
 * committed rounds + the round in progress). Scores, placements, giver rotation, cards per round and
 * streaks are derived by `deriveTrickMatch()`.
 */
import { z } from "zod";
import { baseMatchStateShape, MAX_PLAYERS, matchPlayerSchema, type MatchPlayer } from "../../core";
import { trickRulesSchema } from "./rules";

const idRecord = <T extends z.ZodTypeAny>(v: T) => z.record(z.string(), v);
const bidSchema = z.number().int().min(0).max(60);

export const trickSetupSchema = z.object({
  /** Seat order == giver rotation order. */
  players: z.array(matchPlayerSchema).min(2).max(MAX_PLAYERS),
  /** One of rules.deck.sizes. */
  deckSize: z.number().int().min(1).max(120),
  /** Optional cap for the peak hand size (1..floor(deckSize / players)); null = no cap. Needs rules.rounds.allowMaxCards. */
  maxCards: z.number().int().min(1).nullable(),
});
export type TrickSetup = z.infer<typeof trickSetupSchema>;

/** A committed (scored) round. Keyed by MatchPlayer.id so seat reorders don't break history. */
export const trickRoundEntrySchema = z.object({
  giverId: z.string(),
  bids: idRecord(bidSchema),
  /** Right/wrong per player. Always written on commit (derived from tricks for entry "tricks"). */
  correct: idRecord(z.boolean()),
  /** Tricks taken (entry "tricks" only). */
  tricks: idRecord(bidSchema).optional(),
});
export type TrickRoundEntry = z.infer<typeof trickRoundEntrySchema>;

/** The round currently being entered (not yet scored). Missing keys = not yet entered. */
export const trickCurrentRoundSchema = z.object({
  bids: idRecord(bidSchema),
  /** entry "hit" */
  correct: idRecord(z.boolean()),
  /** entry "tricks" */
  tricks: idRecord(bidSchema).optional(),
});
export type TrickCurrentRound = z.infer<typeof trickCurrentRoundSchema>;

export const trickMatchStateSchema = z.object({
  kind: z.literal("trick-bidding"),
  ...baseMatchStateShape,
  rules: trickRulesSchema,
  setup: trickSetupSchema,
  rounds: z.array(trickRoundEntrySchema).max(200),
  current: trickCurrentRoundSchema,
  currentGiverId: z.string(),
});
export type TrickMatchState = z.infer<typeof trickMatchStateSchema>;

/** Per-player in-match statistics (derived; recomputed from scratch, so undo/correction is exact). */
export interface InMatchStats {
  onWinStreak: boolean;
  winStreak: number;
  maxWinStreak: number;
  loseStreak: number;
  maxLoseStreak: number;
  /** Number of rounds after which the player was ranked 1 (ties count). */
  firstPlaces: number;
  /** Number of rounds after which the player was ranked last (rank === player count). */
  lastPlaces: number;
  maxCalledStiche: number;
  /** Max bid among rounds the player got right. */
  maxWonStiche: number;
}

export interface TrickDerivedPlayer extends MatchPlayer {
  seat: number;
  /** Bid per committed round (index 0 = round 1). */
  bids: number[];
  /** Right/wrong per committed round. */
  correct: boolean[];
  /** Tricks taken per committed round (null for entry "hit"). */
  tricks: (number | null)[];
  /** Points gained per committed round. */
  roundPoints: number[];
  /** Cumulative score after each committed round. */
  scores: number[];
  total: number;
  /** Rank after each committed round (competition ranking, ties share best rank). */
  placements: number[];
  /** Current rank, null before the first round is committed. */
  placement: number | null;
  stats: InMatchStats;
}

export interface TrickDerivedMatch {
  kind: "trick-bidding";
  gameId: string;
  players: TrickDerivedPlayer[];
  /** Cards per player in every round of the match (index 0 = round 1). */
  roundCards: number[];
  /** Largest hand size of the match. */
  peak: number;
  totalRounds: number;
  /** Committed rounds. */
  roundsPlayed: number;
  /** 1-based number of the round being played (== totalRounds when finished). */
  roundNumber: number;
  /** Cards per player in the current round. */
  cardsThisRound: number;
  giverId: string;
  giverName: string;
  /** Who bids first this round ("Ansager"): the giver or the seat after (rules.bidding.firstBidder). */
  bidderId: string;
  bidderName: string;
  /** Sum of bids entered in the current round. */
  calledSum: number;
  /** calledSum === cardsThisRound. */
  sumMatchesCards: boolean;
  /** false if rules.bidding.sumRule forbids the current sum of bids. */
  bidSumAllowed: boolean;
  /** entry "tricks": sum of tricks entered in the current round (0 for "hit"). */
  tricksSum: number;
  /** false if rules.tricksMustSumToCards and all tricks are entered but don't add up. */
  tricksSumValid: boolean;
  /** Every player has a result (✓/✗ or tricks) in the current round. */
  allMarked: boolean;
  finished: boolean;
}
