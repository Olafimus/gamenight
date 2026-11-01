import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { deriveMatch, type LeaderboardEntryDto, type LeaderboardResponse, type MatchState, type PlayerProfileDto } from "@scheisse/shared";
import { createMatch, playRound, playRounds, registerUser, setupTestApp, stateFor } from "./helpers";

const t = setupTestApp();
beforeEach(() => t.reset());
afterAll(() => t.close());

async function boardFull(query: Record<string, string> = {}): Promise<LeaderboardResponse> {
  const r = await request(t.app).get("/api/stats/leaderboard").query(query);
  expect(r.status).toBe(200);
  return r.body as LeaderboardResponse;
}
const board = async (query: Record<string, string> = {}): Promise<LeaderboardEntryDto[]> => (await boardFull(query)).entries;

const names = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `G${i}` }));

/** Creates a finished match. First player wins (bids 1, everybody right). */
async function finishedMatch(players: { id: string; name: string; userId?: string | null }[]) {
  const start = stateFor(players);
  const created = await createMatch(t.app, start);
  const fin = playRounds(start, 1000);
  const r = await request(t.app).put(`/api/matches/${created.match.id}`).set("X-Write-Token", created.writeToken).send({ state: fin, version: 1 });
  expect(r.status).toBe(200);
  return { ...created, fin };
}

describe("stats", () => {
  it("leaderboard and profile reflect finished matches, guests grouped by name, undo removes", async () => {
    const alice = await registerUser(t.app, "Alice");
    const bob = await registerUser(t.app, "Bob");
    const start = stateFor([
      { id: "a", name: "Alice", userId: alice.user.id },
      { id: "b", name: "Bob", userId: bob.user.id },
      { id: "g", name: "Guest", userId: null },
    ]);
    const { match, writeToken } = await createMatch(t.app, start, alice.agent);
    const total = deriveMatch(start).totalRounds;
    const almost = playRounds(start, total - 1);
    const fin = playRound(almost);
    const put = (state: typeof start, version: number) =>
      request(t.app).put(`/api/matches/${match.id}`).set("X-Write-Token", writeToken).send({ state, version });

    // not finished yet -> empty leaderboard
    expect((await put(almost, 1)).status).toBe(200);
    expect(await boardFull()).toMatchObject({ entries: [], categories: [] });

    expect((await put(fin, 2)).status).toBe(200);
    const full = await boardFull();
    const entries = full.entries;
    expect(entries.map((e) => e.name).sort()).toEqual(["Alice", "Bob", "Guest"]);
    expect(full.categories).toEqual([
      { id: "gesamt", label: "Gesamt", matchCount: 1 },
      { id: "klein", label: "Kleine Runden (2–3)", matchCount: 1 },
      { id: "3", label: "Dreierrunde", matchCount: 1 },
    ]);
    const guest = entries.find((e) => e.kind === "guest")!;
    expect(guest).toMatchObject({ key: "g:guest", userId: null, matchCount: 1, provisional: true });
    const winner = entries.find((e) => e.name === "Alice")!;
    expect(winner).toMatchObject({ wins: 1, winRate: 1, rank: 1, placementScore: 1, hitRate: 1 });
    expect(winner.expectedWinRate).toBeCloseTo(1 / 3);
    expect(winner.elo).toBeGreaterThan(1000);
    expect(entries.reduce((a, e) => a + e.elo, 0)).toBeCloseTo(3000, 6); // zero-sum
    expect(entries[0]!.userId).toBe(alice.user.id);
    expect(entries.map((e) => e.rank)).toEqual([1, 2, 3]);

    expect((await board({ category: "3", search: "bo" })).map((e) => e.name)).toEqual(["Bob"]);
    expect(await board({ category: "4" })).toEqual([]);
    expect((await request(t.app).get("/api/stats/leaderboard").query({ category: "nope" })).status).toBe(400);

    const prof = await request(t.app).get(`/api/stats/players/${alice.user.id}`);
    expect(prof.status).toBe(200);
    const p = prof.body as PlayerProfileDto;
    expect(p.subject).toMatchObject({ kind: "user", name: "Alice", userId: alice.user.id });
    expect(p.overall.matchCount).toBe(1);
    expect(p.overall.placements[1]).toBe(1);
    expect(p.elo).toBeCloseTo(winner.elo);
    expect(p.eloHistory).toHaveLength(1);
    expect(p.eloHistory[0]).toMatchObject({ matchId: match.id });
    expect(p.categories.map((c) => c.label)).toEqual(["Gesamt", "Kleine Runden (2–3)", "Dreierrunde"]);
    expect(p.categories[2]).toMatchObject({ matchCount: 1, wins: 1, hitRate: 1 });
    expect(p.matches).toHaveLength(1);
    expect(p.matches[0]).toMatchObject({ matchId: match.id, code: match.code, playerCount: 3, placement: 1 });
    expect(p.matches[0]!.eloDelta).toBeCloseTo(winner.eloDelta);
    expect(p.matches[0]!.playerNames).toEqual(["Alice", "Bob", "Guest"]);
    expect(p.versus.map((v) => v.name).sort()).toEqual(["Bob", "Guest"]);

    // undo -> results gone
    expect((await put(almost, 3)).status).toBe(200);
    expect(await board()).toEqual([]);
    const after = await request(t.app).get(`/api/stats/players/${alice.user.id}`);
    expect(after.status).toBe(200);
    expect(after.body.overall.matchCount).toBe(0);
    expect(after.body.elo).toBe(1000);
    expect(after.body.matches).toEqual([]);
  });

  it("categories, periods and provisional ordering", async () => {
    await finishedMatch([{ id: "a", name: "Ann" }, { id: "b", name: "Ben" }]); // duel: Ann wins
    await finishedMatch([{ id: "a", name: "Ann" }, { id: "b", name: "Ben" }, { id: "c", name: "Cy" }]);
    await finishedMatch([{ id: "a", name: "Ann" }, { id: "b", name: "Ben" }, { id: "c", name: "Cy" }, { id: "d", name: "Di" }, { id: "e", name: "Ed" }]);
    await finishedMatch([{ id: "a", name: "Zoe" }, { id: "b", name: "Ann" }]); // Zoe wins vs Ann

    const full = await boardFull();
    expect(full.categories.map((c) => [c.id, c.matchCount])).toEqual([
      ["gesamt", 4],
      ["klein", 3],
      ["mittel", 1],
      ["2", 2],
      ["3", 1],
      ["5", 1],
    ]);
    // Ann (4) and Ben (3) are ranked; everybody else has < 3 matches -> provisional, listed after
    expect(full.entries.slice(0, 2).map((e) => e.name).sort()).toEqual(["Ann", "Ben"]);
    expect(full.entries.slice(0, 2).every((e) => !e.provisional)).toBe(true);
    const prov = full.entries.slice(2);
    expect(prov).toHaveLength(4);
    expect(prov.every((e) => e.provisional)).toBe(true);
    expect(prov.map((e) => e.elo)).toEqual([...prov.map((e) => e.elo)].sort((x, y) => y - x));

    const duels = await boardFull({ category: "2" });
    expect(duels.entries.map((e) => e.name).sort()).toEqual(["Ann", "Ben", "Zoe"]);
    expect(duels.entries.find((e) => e.name === "Ann")!.matchCount).toBe(2);
    // eloDelta counts only matches in scope, elo stays general
    const annAll = full.entries.find((e) => e.name === "Ann")!;
    const annDuel = duels.entries.find((e) => e.name === "Ann")!;
    expect(annDuel.elo).toBeCloseTo(annAll.elo);
    expect(annDuel.eloDelta).not.toBeCloseTo(annAll.eloDelta);
    expect((await board({ category: "mittel" })).map((e) => e.name).sort()).toEqual(["Ann", "Ben", "Cy", "Di", "Ed"]);

    // period: age the first match (duel) beyond 30 days; Elo is order-independent of "now"
    const [first] = (await t.db.execute(sql`select id from matches order by started_at asc limit 1`)).rows as { id: string }[];
    await t.db.execute(sql`update match_results set finished_at = now() - interval '100 days' where match_id = ${first!.id}`);
    t.stats.invalidate();
    const p30 = await boardFull({ period: "30d" });
    expect(p30.categories.find((c) => c.id === "gesamt")!.matchCount).toBe(3);
    expect(p30.entries.find((e) => e.name === "Ann")!.matchCount).toBe(3);
    const p365 = await boardFull({ period: "365d" });
    expect(p365.entries.find((e) => e.name === "Ann")!.matchCount).toBe(4);
    // aged duel: Ann/Ben only had that one in 2-category within 30d? Ben is absent from duels of 30d
    expect((await board({ period: "30d", category: "2" })).map((e) => e.name).sort()).toEqual(["Ann", "Zoe"]);
  });

  it("caches Elo: no recompute on repeated reads, recompute after a new finished match and after claim", async () => {
    const alice = await registerUser(t.app, "Alice");
    await finishedMatch([{ id: "a", name: "Zed" }, { id: "b", name: "Yan" }]);
    await board();
    const loads = t.stats.loads;
    await board();
    await board({ category: "2" });
    await request(t.app).get("/api/stats/guests/zed");
    expect(t.stats.loads).toBe(loads);

    await finishedMatch([{ id: "a", name: "Zed" }, { id: "b", name: "Yan" }]);
    const lb = await board();
    expect(t.stats.loads).toBe(loads + 1);
    expect(lb.find((e) => e.name === "Zed")!.matchCount).toBe(2);

    // claim
    expect((await alice.agent.post("/api/auth/claim-guest").send({ name: "zed" })).status).toBe(200);
    const lb2 = await board();
    expect(t.stats.loads).toBe(loads + 2);
    expect(lb2.find((e) => e.key === "g:zed")).toBeUndefined();
    const claimed = lb2.find((e) => e.userId === alice.user.id)!;
    expect(claimed.matchCount).toBe(2);
    expect(claimed.elo).toBeCloseTo(lb.find((e) => e.name === "Zed")!.elo);
  });

  it("stores correct_rounds and finished_at; migration backfill reproduces them", async () => {
    const start = stateFor([{ id: "a", name: "Ann" }, { id: "b", name: "Ben" }]);
    const created = await createMatch(t.app, start);
    // Ben is always wrong
    let s: MatchState = start;
    while (!deriveMatch(s).finished) {
      s = playRound(s);
    }
    // rebuild with Ben wrong in every round
    const { setBid, setCorrect, commitRound } = await import("@scheisse/shared");
    let w: MatchState = start;
    while (!deriveMatch(w).finished) {
      w = setBid(setBid(w, "a", 1), "b", 0);
      w = setCorrect(setCorrect(w, "a", true), "b", false);
      w = commitRound(w);
    }
    const total = deriveMatch(w).totalRounds;
    const put = await request(t.app).put(`/api/matches/${created.match.id}`).set("X-Write-Token", created.writeToken).send({ state: w, version: 1 });
    expect(put.status).toBe(200);

    const read = async () =>
      (await t.db.execute(sql`select player_id, correct_rounds, finished_at from match_results order by player_id`)).rows as {
        player_id: string;
        correct_rounds: number;
        finished_at: Date;
      }[];
    const rows = await read();
    expect(rows.map((r) => r.correct_rounds)).toEqual([total, 0]);
    const [m] = (await t.db.execute(sql`select finished_at from matches`)).rows as { finished_at: Date }[];
    expect(new Date(rows[0]!.finished_at).getTime()).toBe(new Date(m!.finished_at).getTime());

    // wipe, then run the backfill statement from the migration file
    await t.db.execute(sql`update match_results set correct_rounds = 0, finished_at = now() - interval '5 years'`);
    const file = readFileSync(path.resolve(__dirname, "../drizzle/0001_stats_elo.sql"), "utf8");
    const update = file.split("--> statement-breakpoint").map((x) => x.trim()).find((x) => x.startsWith("UPDATE"))!;
    await t.db.execute(sql.raw(update));
    const again = await read();
    expect(again.map((r) => r.correct_rounds)).toEqual([total, 0]);
    expect(new Date(again[0]!.finished_at).getTime()).toBe(new Date(m!.finished_at).getTime());
    expect(await board()).toHaveLength(2);
  });

  it("guest profile, claim flow, conflicts and errors", async () => {
    const alice = await registerUser(t.app, "Alice");
    const bob = await registerUser(t.app, "Bob");
    const total = deriveMatch(stateFor([{ id: "a", name: "A" }, { id: "b", name: "B" }])).totalRounds;
    // match 1: Alice (guest "Ali" is someone else)
    const s1 = stateFor([
      { id: "a", name: "Bob", userId: bob.user.id },
      { id: "g", name: " ali ", userId: null },
    ]);
    const m1 = await createMatch(t.app, s1);
    // match 2: Bob plays AND an "Ali" guest -> conflict for bob
    const s2 = stateFor([
      { id: "a", name: "Bob", userId: bob.user.id },
      { id: "g", name: "ALI", userId: null },
    ]);
    const m2 = await createMatch(t.app, s2);
    // match 3: only guest Ali
    const s3 = stateFor([
      { id: "x", name: "Ali", userId: null },
      { id: "y", name: "Zed", userId: null },
    ]);
    const m3 = await createMatch(t.app, s3);
    for (const [m, s] of [[m1, s1], [m2, s2], [m3, s3]] as const) {
      const fin = playRounds(s, total + 100);
      const r = await request(t.app).put(`/api/matches/${m.match.id}`).set("X-Write-Token", m.writeToken).send({ state: fin, version: 1 });
      expect(r.status).toBe(200);
    }

    const lb = await board();
    const ali = lb.find((e) => e.key === "g:ali")!;
    expect(ali).toMatchObject({ kind: "guest", matchCount: 3 });
    expect((await board({ search: "AL" })).map((e: LeaderboardEntryDto) => e.key)).toContain("g:ali");

    const gp = await request(t.app).get("/api/stats/guests/" + encodeURIComponent("ALI"));
    expect(gp.status).toBe(200);
    const gprof = gp.body as PlayerProfileDto;
    expect(gprof.subject).toMatchObject({ kind: "guest", userId: null });
    expect(gprof.overall.matchCount).toBe(3);
    expect(gprof.matches).toHaveLength(3);
    expect(gprof.versus.map((v) => v.name)).toContain("Zed");
    expect((await request(t.app).get("/api/stats/guests/nobody")).status).toBe(404);

    // auth errors
    expect((await request(t.app).post("/api/auth/claim-guest").send({ name: "Ali" })).status).toBe(401);
    expect((await alice.agent.post("/api/auth/claim-guest").send({ name: "nobody" })).status).toBe(404);

    // Bob claims "ali": match 1 and 3 conflict-free? Bob plays in 1 and 2 -> only match 3 claimable
    const bobClaim = await bob.agent.post("/api/auth/claim-guest").send({ name: "ali" });
    expect(bobClaim.status).toBe(200);
    expect(bobClaim.body).toEqual({ claimedMatches: 1, skippedMatches: 2 });

    // Alice claims the rest (matches 1 and 2)
    const claim = await alice.agent.post("/api/auth/claim-guest").send({ name: "Ali" });
    expect(claim.status).toBe(200);
    expect(claim.body).toEqual({ claimedMatches: 2, skippedMatches: 0 });

    const stored = await request(t.app).get(`/api/matches/${m1.match.id}`);
    expect(stored.body.state.setup.players.find((p: { id: string }) => p.id === "g").userId).toBe(alice.user.id);

    const lb2 = await board();
    expect(lb2.find((e) => e.key === "g:ali")).toBeUndefined();
    expect(lb2.find((e) => e.userId === alice.user.id)).toMatchObject({ kind: "user", matchCount: 2 });
    expect((await request(t.app).get("/api/stats/guests/ali")).status).toBe(404);
    expect((await alice.agent.post("/api/auth/claim-guest").send({ name: "ali" })).status).toBe(404);
  });

  it("profile 404 for unknown user", async () => {
    const r = await request(t.app).get("/api/stats/players/11111111-1111-4111-8111-111111111111");
    expect(r.status).toBe(404);
  });
});
