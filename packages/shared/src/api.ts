/**
 * HTTP API contract (zod schemas + DTO types). CONTRACT — server validates
 * requests with these schemas, web uses the inferred types.
 *
 * Base path: /api. JSON everywhere. Errors: `ApiError` with HTTP status.
 * Auth: httpOnly cookie `session` (JWT, 30 days), set by register/login.
 * Match write access: header `X-Write-Token: <token>` (returned once on create).
 */
import { z } from "zod";
import { DECK_SIZES } from "./types";
import { STATS_CATEGORY_IDS, STATS_PERIODS, type StatsPeriod } from "./elo";

// ---------------------------------------------------------------- primitives

export const deckSizeSchema = z.union([z.literal(DECK_SIZES[0]), z.literal(DECK_SIZES[1]), z.literal(DECK_SIZES[2])]);

export const matchPlayerSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(30),
  userId: z.string().uuid().nullable(),
});

export const matchSetupSchema = z.object({
  players: z.array(matchPlayerSchema).min(2).max(10),
  deckSize: deckSizeSchema,
  maxCards: z.number().int().min(1).nullable(),
});

const idRecord = <T extends z.ZodTypeAny>(v: T) => z.record(z.string(), v);

export const roundEntrySchema = z.object({
  giverId: z.string(),
  bids: idRecord(z.number().int().min(0).max(32)),
  correct: idRecord(z.boolean()),
});

export const matchStateSchema = z.object({
  setup: matchSetupSchema,
  rounds: z.array(roundEntrySchema).max(63),
  current: z.object({
    bids: idRecord(z.number().int().min(0).max(32)),
    correct: idRecord(z.boolean()),
  }),
  currentGiverId: z.string(),
});

// ---------------------------------------------------------------- errors

export interface ApiError {
  error: string;
  /** e.g. "username_taken", "username_guest_taken", "invalid_credentials", "version_conflict", "invalid_state", "forbidden", "not_found", "validation", "guest_name_taken" */
  code: string;
}

// ---------------------------------------------------------------- auth

export const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(30)
    .regex(/^[\p{L}\p{N}_.-]+$/u, "Nur Buchstaben, Zahlen, _ . -"),
  password: z.string().min(6).max(200),
});
export type Credentials = z.infer<typeof credentialsSchema>;

/** Register body: `claimGuest` takes the guest of the same name (its finished matches) over into the new account. */
export const registerSchema = credentialsSchema.extend({ claimGuest: z.boolean().optional() });
export type RegisterRequest = z.infer<typeof registerSchema>;

export interface UserDto {
  id: string;
  username: string;
  /** Optional name shown instead of the username (seats, statistics). */
  displayName: string | null;
  createdAt: string; // ISO
}

/** Name to show for an account: display name if set, else username. */
export const userLabel = (u: { username: string; displayName?: string | null }): string => u.displayName || u.username;

export const updateProfileSchema = z.object({
  /** "" or null removes the display name. */
  displayName: z
    .string()
    .trim()
    .max(30)
    .nullable()
    .transform((v) => (v ? v : null)),
});
export type UpdateProfileRequest = z.input<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: credentialsSchema.shape.password,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordSchema>;

// POST  /api/auth/register  body RegisterRequest -> 201 UserDto (+cookie) | 409 username_taken | 409 username_guest_taken
//       (username equals a guest name already used in a match, case-insensitive; body carries `guestName`).
//       With claimGuest: true the account is created and the guest's finished matches are claimed (as claim-guest).
// POST  /api/auth/login     body Credentials -> 200 UserDto (+cookie) | 401 invalid_credentials
// POST  /api/auth/logout    -> 204 (clears cookie)
// GET   /api/auth/me        -> 200 UserDto | 401
// PATCH /api/auth/me        body UpdateProfileRequest -> 200 UserDto | 401
// POST  /api/auth/password  body ChangePasswordRequest -> 204 | 401 | 400 invalid_credentials (wrong current password)
// GET   /api/users?search=  -> 200 UserDto[] (max 20, case-insensitive substring of username or display name, sorted by username)

export interface PlayerSearchResultDto {
  kind: "user" | "guest";
  /** null for guests */
  userId: string | null;
  /** label (display name or username) for users, most recent spelling for guests */
  name: string;
  /** users only */
  username: string | null;
}
// GET /api/players?search= -> 200 PlayerSearchResultDto[] (users first, then guests; max 20 each)
//     guests = distinct (case-insensitive) names of seats without account, excluding names equal to a username

// ---------------------------------------------------------------- matches

export interface MatchDto {
  id: string; // uuid
  code: string; // 5 chars, uppercase A-Z0-9 without ambiguous chars, unique
  ownerUserId: string | null;
  state: z.infer<typeof matchStateSchema>;
  finished: boolean;
  startedAt: string; // ISO
  finishedAt: string | null;
  updatedAt: string;
  version: number; // increments on every successful PUT, starts at 1
}

export const createMatchSchema = z.object({ state: matchStateSchema });
export type CreateMatchRequest = z.infer<typeof createMatchSchema>;
export interface CreateMatchResponse {
  match: MatchDto;
  writeToken: string;
}

export const updateMatchSchema = z.object({
  state: matchStateSchema,
  /** version the client based its change on; 409 version_conflict if stale */
  version: z.number().int().min(1),
});
export type UpdateMatchRequest = z.infer<typeof updateMatchSchema>;

export interface MatchSummaryDto {
  id: string;
  code: string;
  playerNames: string[];
  playerCount: number;
  roundNumber: number;
  totalRounds: number;
  finished: boolean;
  startedAt: string;
  updatedAt: string;
}

export const listMatchesQuerySchema = z.object({
  status: z.enum(["active", "finished", "all"]).default("all"),
  search: z.string().trim().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// POST   /api/matches                  body CreateMatchRequest -> 201 CreateMatchResponse
//        (owner = logged-in user or null; server validates state with engine: deriveMatch must not throw)
// PUT    /api/matches/:id  X-Write-Token  body UpdateMatchRequest -> 200 MatchDto | 403 | 409 version_conflict (body: { error, code, match: MatchDto })
//        When derived state becomes finished the first time: finishedAt set, match_results written.
//        If a finished match is changed again (undo/correction) results are rewritten; if it becomes unfinished, results deleted, finishedAt null.
// GET    /api/matches/:idOrCode         -> 200 MatchDto (code lookup case-insensitive)
// GET    /api/matches?status&search&limit -> 200 MatchSummaryDto[] sorted startedAt desc; search = substring of code or any player name
// DELETE /api/matches/:id  X-Write-Token -> 204
// GET    /api/matches/:id/stream (SSE)  events: `match` (data: MatchDto) on connect + on every change; `deleted`; comment ping every 15s
// GET    /api/matches/stream?status=active (SSE) events: `upsert` (MatchSummaryDto), `removed` ({id})

// ---------------------------------------------------------------- statistics (users + guests)

export const leaderboardQuerySchema = z.object({
  category: z
    .string()
    .refine((v) => STATS_CATEGORY_IDS.includes(v), "unknown category")
    .default("gesamt"),
  period: z.enum(STATS_PERIODS).default("all"),
  search: z.string().trim().max(50).optional(),
});
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;

export type StatsSubjectKind = "user" | "guest";

export interface LeaderboardEntryDto {
  kind: StatsSubjectKind;
  /** userId for users, `g:<lowercased trimmed name>` for guests */
  key: string;
  /** null for guests */
  userId: string | null;
  /** username (users) or the most recently used spelling of the guest name */
  name: string;
  /** fewer than 3 matches in the selected scope */
  provisional: boolean;
  /** 1-based position in the returned list (provisional entries come after ranked ones) */
  rank: number;
  /** current general Elo (all matches, start 1000) */
  elo: number;
  /** Elo change accumulated by matches inside the selected scope */
  eloDelta: number;
  matchCount: number;
  wins: number;
  winRate: number;
  expectedWinRate: number;
  /** mean (n - placement)/(n - 1), 0..1 */
  placementScore: number;
  /** points per round */
  avgPoints: number;
  /** correct rounds / rounds played, 0..1 */
  hitRate: number;
  /** normalized placement (0..1) of the last 5 matches, oldest first */
  form: number[];
}

export interface StatsCategoryDto {
  id: string;
  label: string;
  matchCount: number;
}

export interface LeaderboardResponse {
  category: string;
  period: StatsPeriod;
  /** only categories with data ("gesamt" first) */
  categories: StatsCategoryDto[];
  entries: LeaderboardEntryDto[];
}
// GET /api/stats/leaderboard?category=<id>&period=all|365d|90d|30d&search= -> 200 LeaderboardResponse
//     users AND guests (grouped by lower(trim(name))) with >= 1 finished match in scope;
//     sorted: ranked (>= 3 matches) by elo desc, then provisional by elo desc.

export interface PlayerMatchDto {
  matchId: string;
  code: string;
  startedAt: string;
  finishedAt: string;
  playerNames: string[];
  playerCount: number;
  placement: number;
  finalScore: number;
  rounds: number;
  /** Elo change of this match for the subject */
  eloDelta: number;
}

export interface StatsSubjectDto {
  kind: StatsSubjectKind;
  userId: string | null;
  name: string;
}

export interface CategoryBreakdownDto {
  id: string;
  label: string;
  matchCount: number;
  wins: number;
  winRate: number;
  expectedWinRate: number;
  placementScore: number;
  avgPoints: number;
  hitRate: number;
  eloDelta: number;
}

export interface PlayerProfileDto {
  subject: StatsSubjectDto;
  overall: LeaderboardEntryDto & { placements: Record<number, number> };
  elo: number;
  eloHistory: { matchId: string; at: string; elo: number }[];
  /** only categories with data, "gesamt" first */
  categories: CategoryBreakdownDto[];
  versus: { userId: string | null; name: string; matches: number; wins: number }[];
  matches: PlayerMatchDto[]; // finishedAt desc
}
// GET /api/stats/players/:userId -> 200 PlayerProfileDto | 404
// GET /api/stats/guests/:name (URL-encoded, case-insensitive) -> 200 PlayerProfileDto (subject.kind "guest") | 404 if no results

export const claimGuestSchema = z.object({ name: z.string().trim().min(1).max(30) });
export type ClaimGuestRequest = z.infer<typeof claimGuestSchema>;
export interface ClaimGuestResponse {
  claimedMatches: number;
  /** matches skipped because the user already plays in them under their account */
  skippedMatches: number;
}
// POST /api/auth/claim-guest (logged in) body ClaimGuestRequest -> 200 ClaimGuestResponse | 401 | 404 (no such guest results)
//     Reassigns finished-match results of that guest name (case-insensitive) to the user
//     (match_results, match_players, matches.state players[].userId) in one transaction.

// GET /api/health -> 200 { ok: true }
