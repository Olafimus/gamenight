import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { deriveMatch, setBid, type MatchDto } from "@scheisse/shared";
import { users } from "../src/db/schema";
import { cleanupStaleMatches } from "../src/jobs/cleanup";
import { createMatch, playRound, playRounds, registerUser, setupTestApp, stateFor } from "./helpers";

const t = setupTestApp();
beforeEach(() => t.reset());
afterAll(() => t.close());

const guests = () => [
  { id: "a", name: "Anna" },
  { id: "b", name: "Ben" },
  { id: "c", name: "Cleo" },
];

describe("matches", () => {
  it("creates as guest", async () => {
    const { match, writeToken } = await createMatch(t.app, stateFor(guests()));
    expect(match.ownerUserId).toBeNull();
    expect(match.version).toBe(1);
    expect(match.finished).toBe(false);
    expect(match.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);
    expect(writeToken.length).toBeGreaterThanOrEqual(40);
  });

  it("creates as logged-in owner", async () => {
    const { agent, user } = await registerUser(t.app, "owner");
    const { match } = await createMatch(t.app, stateFor(guests()), agent);
    expect(match.ownerUserId).toBe(user.id);
  });

  it("rejects invalid bodies and unknown userIds", async () => {
    const r = await request(t.app).post("/api/matches").send({ state: { nope: true } });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("validation");
    const s = stateFor([
      { id: "a", name: "Anna", userId: "11111111-1111-4111-8111-111111111111" },
      { id: "b", name: "Ben" },
    ]);
    const r2 = await request(t.app).post("/api/matches").send({ state: s });
    expect(r2.status).toBe(400);
    expect(r2.body.code).toBe("invalid_state");
  });

  it("rejects state that the engine cannot derive (400 invalid_state)", async () => {
    const s = stateFor(guests());
    const bad = { ...s, currentGiverId: "does-not-exist" };
    const r = await request(t.app).post("/api/matches").send({ state: bad });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("invalid_state");
  });

  it("PUT requires the right write token", async () => {
    const { match, writeToken } = await createMatch(t.app, stateFor(guests()));
    const next = setBid(match.state, "a", 1);
    const none = await request(t.app).put(`/api/matches/${match.id}`).send({ state: next, version: 1 });
    expect(none.status).toBe(403);
    expect(none.body.code).toBe("forbidden");
    const wrong = await request(t.app).put(`/api/matches/${match.id}`).set("X-Write-Token", "nope").send({ state: next, version: 1 });
    expect(wrong.status).toBe(403);
    const ok = await request(t.app).put(`/api/matches/${match.id}`).set("X-Write-Token", writeToken).send({ state: next, version: 1 });
    expect(ok.status).toBe(200);
    expect(ok.body.version).toBe(2);
    expect(ok.body.state.current.bids.a).toBe(1);
  });

  it("stale version gives 409 with current match", async () => {
    const { match, writeToken } = await createMatch(t.app, stateFor(guests()));
    const put = (state: typeof match.state, version: number) =>
      request(t.app).put(`/api/matches/${match.id}`).set("X-Write-Token", writeToken).send({ state, version });
    expect((await put(setBid(match.state, "a", 1), 1)).status).toBe(200);
    const stale = await put(setBid(match.state, "b", 1), 1);
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("version_conflict");
    expect(stale.body.match.version).toBe(2);
    expect(stale.body.match.state.current.bids.a).toBe(1);
  });

  it("PUT with invalid state is 400", async () => {
    const { match, writeToken } = await createMatch(t.app, stateFor(guests()));
    const bad = { ...match.state, currentGiverId: "ghost" };
    const r = await request(t.app).put(`/api/matches/${match.id}`).set("X-Write-Token", writeToken).send({ state: bad, version: 1 });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("invalid_state");
  });

  it("PUT on unknown match is 404", async () => {
    const { match, writeToken } = await createMatch(t.app, stateFor(guests()));
    const r = await request(t.app)
      .put("/api/matches/11111111-1111-4111-8111-111111111111")
      .set("X-Write-Token", writeToken)
      .send({ state: match.state, version: 1 });
    expect(r.status).toBe(404);
  });

  it("get by id and by code (case-insensitive), 404 otherwise", async () => {
    const { match } = await createMatch(t.app, stateFor(guests()));
    const byId = await request(t.app).get(`/api/matches/${match.id}`);
    expect(byId.status).toBe(200);
    expect(byId.body.code).toBe(match.code);
    const byCode = await request(t.app).get(`/api/matches/${match.code.toLowerCase()}`);
    expect(byCode.status).toBe(200);
    expect(byCode.body.id).toBe(match.id);
    expect((await request(t.app).get("/api/matches/ZZZZZ")).status).toBe(404);
  });

  it("finishing writes results; undo removes them", async () => {
    const { match, writeToken } = await createMatch(t.app, stateFor(guests()));
    const total = deriveMatch(match.state).totalRounds;
    const almost = playRounds(match.state, total - 1);
    expect(deriveMatch(almost).finished).toBe(false);
    let version = 1;
    const put = async (state: typeof match.state) => {
      const r = await request(t.app).put(`/api/matches/${match.id}`).set("X-Write-Token", writeToken).send({ state, version });
      expect(r.status).toBe(200);
      version = r.body.version;
      return r.body as MatchDto;
    };
    const mid = await put(almost);
    expect(mid.finished).toBe(false);
    const countResults = async () => (await t.db.execute(sql`select count(*)::int as n from match_results`)).rows[0]!.n;
    expect(await countResults()).toBe(0);

    const fin = playRound(almost);
    expect(deriveMatch(fin).finished).toBe(true);
    const done = await put(fin);
    expect(done.finished).toBe(true);
    expect(done.finishedAt).not.toBeNull();
    expect(await countResults()).toBe(3);

    // re-saving a finished match keeps finishedAt and rewrites results
    const again = await put(fin);
    expect(again.finishedAt).toBe(done.finishedAt);
    expect(await countResults()).toBe(3);

    // undo
    const back = await put(almost);
    expect(back.finished).toBe(false);
    expect(back.finishedAt).toBeNull();
    expect(await countResults()).toBe(0);
  });

  it("list filters by status/search/limit, includes round info", async () => {
    const a = await createMatch(t.app, stateFor(guests()));
    const fin = playRounds(
      stateFor([
        { id: "x", name: "Zora" },
        { id: "y", name: "Yan" },
      ]),
    );
    const b = await createMatch(t.app, fin);
    expect(b.match.finished).toBe(true);

    const all = await request(t.app).get("/api/matches");
    expect(all.body).toHaveLength(2);
    expect(all.body[0].id).toBe(b.match.id); // startedAt desc
    expect(all.body[1]).toMatchObject({ id: a.match.id, playerCount: 3, playerNames: ["Anna", "Ben", "Cleo"], roundNumber: 1, finished: false });
    expect(all.body[1].totalRounds).toBeGreaterThan(0);

    const ids = (r: { body: { id: string }[] }) => r.body.map((m) => m.id);
    expect(ids(await request(t.app).get("/api/matches").query({ status: "active" }))).toEqual([a.match.id]);
    expect(ids(await request(t.app).get("/api/matches").query({ status: "finished" }))).toEqual([b.match.id]);
    expect(ids(await request(t.app).get("/api/matches").query({ search: "zor" }))).toEqual([b.match.id]);
    expect(ids(await request(t.app).get("/api/matches").query({ search: a.match.code.toLowerCase() }))).toEqual([a.match.id]);
    expect(await request(t.app).get("/api/matches").query({ limit: 1 })).toHaveProperty("body.length", 1);
    expect((await request(t.app).get("/api/matches").query({ limit: 0 })).status).toBe(400);
  });

  it("delete requires token and removes the match", async () => {
    const { match, writeToken } = await createMatch(t.app, stateFor(guests()));
    expect((await request(t.app).delete(`/api/matches/${match.id}`)).status).toBe(403);
    expect((await request(t.app).delete(`/api/matches/${match.id}`).set("X-Write-Token", writeToken)).status).toBe(204);
    expect((await request(t.app).get(`/api/matches/${match.id}`)).status).toBe(404);
  });
});

describe("cleanup", () => {
  it("removes only stale unfinished matches", async () => {
    const stale = await createMatch(t.app, stateFor(guests()));
    const fresh = await createMatch(t.app, stateFor(guests()));
    const staleFinished = await createMatch(
      t.app,
      playRounds(
        stateFor([
          { id: "x", name: "X" },
          { id: "y", name: "Y" },
        ]),
      ),
    );
    const old = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    await t.db.execute(sql`update matches set updated_at = ${old} where id in (${stale.match.id}, ${staleFinished.match.id})`);

    const removed = await cleanupStaleMatches(t.db);
    expect(removed).toEqual([stale.match.id]);
    expect((await request(t.app).get(`/api/matches/${stale.match.id}`)).status).toBe(404);
    expect((await request(t.app).get(`/api/matches/${fresh.match.id}`)).status).toBe(200);
    expect((await request(t.app).get(`/api/matches/${staleFinished.match.id}`)).status).toBe(200);
  });
});

describe("guest names vs account usernames", () => {
  it("rejects new guest seats named like an account (case/trim-insensitive), allows legacy seats", async () => {
    await registerUser(t.app, "Alice");
    const bad = await request(t.app).post("/api/matches").send({ state: stateFor([{ id: "a", name: "  aLiCe ", userId: null }, { id: "b", name: "Bob" }]) });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("guest_name_taken");
    expect(JSON.stringify(bad.body)).toContain("aLiCe");

    // legacy: stored guest seat "Carl", then an account Carl registers; updating the match keeps working
    const legacy = await createMatch(t.app, stateFor([{ id: "a", name: "Carl" }, { id: "b", name: "Dora" }]));
    // (accounts created before guest names blocked registration; the API now rejects this with username_guest_taken)
    const [carl] = await t.db.insert(users).values({ username: "carl", usernameLower: "carl", passwordHash: "x" }).returning();
    expect(carl!.username).toBe("carl");
    const upd = await request(t.app)
      .put(`/api/matches/${legacy.match.id}`)
      .set("X-Write-Token", legacy.writeToken)
      .send({ state: playRound(legacy.match.state), version: 1 });
    expect(upd.status).toBe(200);

    // but introducing a NEW guest seat named like an account is rejected on PUT
    const st = { ...upd.body.state, setup: { ...upd.body.state.setup, players: [...upd.body.state.setup.players, { id: "z", name: "ALICE", userId: null }] } };
    const bad2 = await request(t.app).put(`/api/matches/${legacy.match.id}`).set("X-Write-Token", legacy.writeToken).send({ state: st, version: 2 });
    expect(bad2.status).toBe(400);
  });
});
