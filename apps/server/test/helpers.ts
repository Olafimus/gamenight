import type { Express } from "express";
import request from "supertest";
import { sql } from "drizzle-orm";
import {
  commitRound,
  createMatchState,
  deriveMatch,
  setAllCorrect,
  setBid,
  type CreateMatchResponse,
  type MatchState,
} from "@scheisse/shared";
import { createApp } from "../src/app";
import { createDb } from "../src/db/client";
import type { Hub } from "../src/sse/hub";

export const TEST_URL = process.env.TEST_DATABASE_URL ?? "postgres://scheisse:scheisse@localhost:5433/scheisse_test";

export function setupTestApp() {
  const { db, pool } = createDb(TEST_URL);
  const { app, hub, stats } = createApp({ db, env: { jwtSecret: "test-secret", production: false } });
  return {
    db,
    app: app as Express,
    hub: hub as Hub,
    stats,
    async reset() {
      await db.execute(sql`truncate table match_results, match_players, matches, users restart identity cascade`);
    },
    async close() {
      hub.close();
      await pool.end();
    },
  };
}

export function stateFor(players: { id: string; name: string; userId?: string | null }[], deckSize: 32 | 52 | 64 = 52): MatchState {
  return createMatchState({
    players: players.map((p) => ({ id: p.id, name: p.name, userId: p.userId ?? null })),
    deckSize,
    maxCards: 3,
  });
}

/** Commits one round: first player bids 1, others 0, everybody right. */
export function playRound(state: MatchState): MatchState {
  let s = state;
  s.setup.players.forEach((p, i) => {
    s = setBid(s, p.id, i === 0 ? 1 : 0);
  });
  return commitRound(setAllCorrect(s, true));
}

/** Commits n rounds (or until finished). First player bids 1 (scores more), others 0. */
export function playRounds(state: MatchState, n = 1000): MatchState {
  let s = state;
  for (let i = 0; i < n && !deriveMatch(s).finished; i++) s = playRound(s);
  return s;
}

export async function createMatch(app: Express, state: MatchState, agent?: ReturnType<typeof request.agent>): Promise<CreateMatchResponse> {
  const r = await (agent ?? request(app)).post("/api/matches").send({ state });
  if (r.status !== 201) throw new Error(`create failed ${r.status} ${JSON.stringify(r.body)}`);
  return r.body as CreateMatchResponse;
}

export async function registerUser(app: Express, username: string) {
  const agent = request.agent(app);
  const r = await agent.post("/api/auth/register").send({ username, password: "secret123" });
  if (r.status !== 201) throw new Error(`register failed ${r.status}`);
  return { agent, user: r.body as { id: string; username: string; createdAt: string } };
}
