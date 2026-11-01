import { boolean, doublePrecision, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { MatchState } from "@scheisse/shared";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull(),
  usernameLower: text("username_lower").notNull().unique(),
  displayName: text("display_name"),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const matches = pgTable("matches", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  writeTokenHash: text("write_token_hash").notNull(),
  state: jsonb("state").$type<MatchState>().notNull(),
  finished: boolean("finished").notNull().default(false),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(1),
});

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
    finalScore: integer("final_score").notNull(),
    placement: integer("placement").notNull(),
    playerCount: integer("player_count").notNull(),
    rounds: integer("rounds").notNull(),
    avgScore: doublePrecision("avg_score").notNull(),
    rating: doublePrecision("rating").notNull(),
    correctRounds: integer("correct_rounds").notNull().default(0),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.playerId] })],
);
