import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createMatch as newMatch,
  defaultRuleset,
  scoreEntry,
  matchStateSchema,
  upgradeMatchState,
  sheetCategories,
  KNIFFEL_RULES,
  WIZARD_RULES,
  type GameCatalogDto,
  type LeaderboardResponse,
  type MatchSummaryDto,
  type RulesetDto,
  type SheetMatchState,
} from "@gamenight/shared";
import { createMatch, playRounds, registerUser, setupTestApp, stateFor } from "./helpers";

const t = setupTestApp();
beforeEach(() => t.reset());
afterAll(() => t.close());

const players = [
  { id: "a", name: "Ann", userId: null },
  { id: "b", name: "Ben", userId: null },
  { id: "c", name: "Cleo", userId: null },
];

const put = (id: string, token: string, state: unknown, version: number) =>
  request(t.app).put(`/api/matches/${id}`).set("X-Write-Token", token).send({ state, version });

describe("game catalog & rulesets", () => {
  it("lists built-in games and rulesets anonymously", async () => {
    const r = await request(t.app).get("/api/games");
    expect(r.status).toBe(200);
    const body = r.body as GameCatalogDto;
    expect(body.games.map((g) => g.id)).toEqual(["scheisse", "wizard", "kniffel"]);
    expect(body.rulesets.filter((x) => x.builtin).map((x) => x.id)).toContain("kniffel.standard");
  });

  it("CRUD of own rulesets, validated against the game kind", async () => {
    const { agent } = await registerUser(t.app, "Alice");
    const body = { kind: "trick-bidding", gameId: "wizard", name: "Hausregel", description: "ohne Abzug", rules: { ...WIZARD_RULES, scoring: { ...WIZARD_RULES.scoring, missPerTrickDiff: 0 } } };

    expect((await request(t.app).post("/api/rulesets").send(body)).status).toBe(401);
    expect((await agent.post("/api/rulesets").send({ ...body, gameId: "kniffel" })).status).toBe(400);
    expect((await agent.post("/api/rulesets").send({ ...body, rules: { ...WIZARD_RULES, players: { min: 4, max: 3 } } })).status).toBe(400);

    const created = await agent.post("/api/rulesets").send(body);
    expect(created.status).toBe(201);
    const rs = created.body as RulesetDto;
    expect(rs).toMatchObject({ builtin: false, gameId: "wizard", name: "Hausregel" });

    const catalog = (await agent.get("/api/games")).body as GameCatalogDto;
    expect(catalog.rulesets.find((x) => x.id === rs.id)?.name).toBe("Hausregel");
    expect(((await request(t.app).get("/api/games")).body as GameCatalogDto).rulesets.some((x) => x.id === rs.id)).toBe(false);

    const bob = await registerUser(t.app, "Bob");
    expect((await bob.agent.put(`/api/rulesets/${rs.id}`).send(body)).status).toBe(403);
    expect((await agent.put(`/api/rulesets/${rs.id}`).send({ ...body, kind: "score-sheet", gameId: "kniffel", rules: KNIFFEL_RULES })).status).toBe(400);
    const updated = await agent.put(`/api/rulesets/${rs.id}`).send({ ...body, name: "Neu" });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe("Neu");

    expect((await bob.agent.delete(`/api/rulesets/${rs.id}`)).status).toBe(403);
    expect((await agent.delete(`/api/rulesets/${rs.id}`)).status).toBe(204);
    expect((await agent.delete(`/api/rulesets/${rs.id}`)).status).toBe(404);
  });
});

describe("matches of other games", () => {
  it("kniffel match: create, play to the end, results and per-game leaderboard", async () => {
    const start = newMatch(defaultRuleset("kniffel"), players.slice(0, 2)) as SheetMatchState;
    const { match, writeToken } = await createMatch(t.app, start);
    expect(match.state.kind).toBe("score-sheet");

    let s = start;
    for (const c of sheetCategories(KNIFFEL_RULES)) {
      s = scoreEntry(s, { playerId: "a", categoryId: c.id, points: 0 });
      s = scoreEntry(s, { playerId: "b", categoryId: c.id, dice: [6, 6, 6, 6, 6] });
    }
    const r = await put(match.id, writeToken, s, 1);
    expect(r.status).toBe(200);
    expect(r.body.finished).toBe(true);

    const list = (await request(t.app).get("/api/matches").query({ game: "kniffel" })).body as MatchSummaryDto[];
    expect(list.map((m) => [m.gameId, m.roundNumber, m.totalRounds])).toEqual([["kniffel", 13, 13]]);
    expect(((await request(t.app).get("/api/matches").query({ game: "wizard" })).body as MatchSummaryDto[]).length).toBe(0);

    const kb = (await request(t.app).get("/api/stats/leaderboard").query({ game: "kniffel" })).body as LeaderboardResponse;
    expect(kb.game).toBe("kniffel");
    expect(kb.entries.map((e) => [e.name, e.wins])).toEqual([
      ["Ben", 1],
      ["Ann", 0],
    ]);
    // Scheisse leaderboard (default) is unaffected
    expect(((await request(t.app).get("/api/stats/leaderboard")).body as LeaderboardResponse).entries).toHaveLength(0);
    const profile = await request(t.app).get(`/api/stats/guests/Ben`).query({ game: "kniffel" });
    expect(profile.status).toBe(200);
    expect(profile.body.game).toBe("kniffel");
    expect((await request(t.app).get(`/api/stats/guests/Ben`)).status).toBe(404);
  });

  it("rejects invalid entries, rule violations and game changes", async () => {
    const start = newMatch(defaultRuleset("kniffel"), players.slice(0, 2)) as SheetMatchState;
    const { match, writeToken } = await createMatch(t.app, start);
    const bad = { ...start, entries: [{ playerId: "a", column: 0, categoryId: "einser", points: 7 }] };
    expect((await put(match.id, writeToken, bad, 1)).body.code).toBe("invalid_state");
    expect((await put(match.id, writeToken, stateFor(players), 1)).body.code).toBe("invalid_state");

    const wizard = newMatch(defaultRuleset("wizard"), players);
    const twoPlayers = { ...wizard, setup: { ...wizard.setup, players: players.slice(0, 2) }, currentGiverId: "a" };
    expect((await request(t.app).post("/api/matches").send({ state: twoPlayers })).body.code).toBe("invalid_state"); // Wizard: min 3
    const unknown = { ...newMatch(defaultRuleset("wizard"), players), gameId: "chess" };
    expect((await request(t.app).post("/api/matches").send({ state: unknown })).body.code).toBe("invalid_state");
  });

  it("legacy v1 states (old clients) are accepted and stored upgraded", async () => {
    const { kind: _k, gameId: _g, ruleset: _r, rules: _rules, ...v1 } = stateFor(players);
    const r = await request(t.app).post("/api/matches").send({ state: v1 });
    expect(r.status).toBe(201);
    expect(r.body.match.state).toMatchObject({ kind: "trick-bidding", gameId: "scheisse", ruleset: { id: "scheisse.standard" } });
    const fin = playRounds(r.body.match.state, 1000);
    expect((await put(r.body.match.id, r.body.writeToken, fin, 1)).body.finished).toBe(true);
  });
});

describe("migration 0003", () => {
  it("upgrades stored v1 states exactly like upgradeMatchState()", async () => {
    const { match } = await createMatch(t.app, stateFor(players));
    const { kind: _k, gameId: _g, ruleset: _r, rules: _rules, ...v1 } = match.state as ReturnType<typeof stateFor>;
    await t.db.execute(sql`update matches set state = ${JSON.stringify(v1)}::jsonb where id = ${match.id}`);

    const file = readFileSync(path.resolve(__dirname, "../drizzle/0003_generic_games.sql"), "utf8");
    const update = file
      .split("--> statement-breakpoint")
      .map((x) => x.replace(/^\s*--.*$/gm, "").trim())
      .find((x) => x.startsWith("UPDATE"))!;
    await t.db.execute(sql.raw(update));

    const [row] = (await t.db.execute(sql`select state from matches where id = ${match.id}`)).rows as { state: unknown }[];
    // compared after parsing: the migration writes the rules of its time, the schema fills in newer fields with their defaults
    const parsed = matchStateSchema.parse(row!.state);
    expect(parsed).toEqual(matchStateSchema.parse(upgradeMatchState(v1)));
    expect(parsed).toEqual(matchStateSchema.parse(match.state));
  });
});
