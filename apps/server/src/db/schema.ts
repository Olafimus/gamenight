import { boolean, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { GameKind, MatchState, Ruleset } from "@gamenight/shared";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull(),
  usernameLower: text("username_lower").notNull().unique(),
  displayName: text("display_name"),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    writeTokenHash: text("write_token_hash").notNull(),
    /** = state.gameId (denormalized for filtering) */
    gameId: text("game_id").notNull().default("scheisse"),
    /** = state.ruleset.id; built-in id or a rulesets.id (no FK: matches keep their rules snapshot in state) */
    rulesetId: text("ruleset_id").notNull().default("scheisse.standard"),
    state: jsonb("state").$type<MatchState>().notNull(),
    finished: boolean("finished").notNull().default(false),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    version: integer("version").notNull().default(1),
  },
  (t) => [index("matches_game_id_idx").on(t.gameId)],
);

export const matchPlayers = pgTable(
  "match_players",
  {
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    playerId: text("player_id").notNull(),
    seat: integer("seat").notNull(),
    name: text("name").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.playerId] })],
);

export const matchResults = pgTable(
  "match_results",
  {
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    playerId: text("player_id").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    gameId: text("game_id").notNull().default("scheisse"),
    finalScore: integer("final_score").notNull(),
    placement: integer("placement").notNull(),
    playerCount: integer("player_count").notNull(),
    rounds: integer("rounds").notNull(),
    avgScore: doublePrecision("avg_score").notNull(),
    rating: doublePrecision("rating").notNull(),
    /** trick-bidding only (0 for other kinds) */
    correctRounds: integer("correct_rounds").notNull().default(0),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.playerId] })],
);

/** User-defined rulesets. Built-in rulesets live in code (@gamenight/shared games/*). */
export const rulesets = pgTable(
  "rulesets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gameId: text("game_id").notNull(),
    kind: text("kind").$type<GameKind>().notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    rules: jsonb("rules").$type<Ruleset["rules"]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rulesets_owner_idx").on(t.ownerUserId)],
);
