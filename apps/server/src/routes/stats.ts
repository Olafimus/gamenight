import { eq } from "drizzle-orm";
import { Router } from "express";
import {
  ELO_START,
  leaderboardQuerySchema,
  profileQuerySchema,
  type LeaderboardResponse,
  type PlayerMatchDto,
  type PlayerProfileDto,
  userLabel,
} from "@gamenight/shared";
import type { Ctx } from "../app";
import { users } from "../db/schema";
import { asyncH, HttpError } from "../lib/http";
import { guestKey, type Computed, type Subject } from "../stats/cache";

export function statsRouter({ db, stats }: Ctx): Router {
  const r = Router();

  r.get(
    "/leaderboard",
    asyncH(async (req, res) => {
      const q = leaderboardQuerySchema.parse(req.query);
      const c = await stats.get(q.game);
      const { categories, entries } = stats.leaderboard(c, q.category, q.period);
      const term = q.search?.toLowerCase();
      const out: LeaderboardResponse = {
        game: q.game,
        category: q.category,
        period: q.period,
        categories,
        entries: term ? entries.filter((e) => e.name.toLowerCase().includes(term)) : entries,
      };
      res.json(out);
    }),
  );

  function buildProfile(c: Computed, subject: Subject | undefined, fallback: PlayerProfileDto["subject"]): PlayerProfileDto {
    const s: Subject = subject ?? { key: fallback.userId ?? guestKey(fallback.name), kind: fallback.kind, userId: fallback.userId, name: fallback.name, rows: [] };
    const base = stats.entryOf(c, s, "gesamt", "all");
    const all = stats.leaderboard(c, "gesamt", "all");
    base.rank = all.entries.find((e) => e.key === s.key)?.rank ?? 0;
    const metrics = stats.subjectScope(c, s, "gesamt", "all");

    // versus: co-players grouped by userId (guests by name)
    const versus = new Map<string, { userId: string | null; name: string; matches: number; wins: number }>();
    for (const mine of s.rows) {
      for (const other of c.byMatch.get(mine.matchId) ?? []) {
        if (other.playerId === mine.playerId) continue;
        let v = versus.get(other.key);
        if (!v) versus.set(other.key, (v = { userId: other.userId, name: other.name, matches: 0, wins: 0 }));
        v.matches += 1;
        if (mine.placement === 1) v.wins += 1;
      }
    }

    const matchesDto: PlayerMatchDto[] = [...s.rows].reverse().map((row) => ({
      matchId: row.matchId,
      code: row.code,
      startedAt: row.startedAt,
      finishedAt: row.at,
      playerNames: (c.byMatch.get(row.matchId) ?? []).map((x) => x.name),
      playerCount: row.playerCount,
      placement: row.placement,
      finalScore: row.finalScore,
      rounds: row.rounds,
      eloDelta: c.elo.deltas.get(row.matchId)?.get(s.key) ?? 0,
    }));

    return {
      game: c.gameId,
      subject: { kind: s.kind, userId: s.userId, name: s.name },
      overall: { ...base, placements: metrics.placements },
      elo: s.rows.length ? stats.eloOf(c, s.key) : ELO_START,
      eloHistory: c.elo.history.get(s.key) ?? [],
      categories: stats.breakdown(c, s),
      versus: [...versus.values()].sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name)),
      matches: matchesDto,
    };
  }

  r.get(
    "/players/:userId",
    asyncH(async (req, res) => {
      const userId = req.params.userId!;
      if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new HttpError(404, "not_found", "Spieler nicht gefunden");
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) throw new HttpError(404, "not_found", "Spieler nicht gefunden");
      const c = await stats.get(profileQuerySchema.parse(req.query).game);
      res.json(buildProfile(c, c.subjects.get(userId), { kind: "user", userId, name: userLabel(user) }));
    }),
  );

  r.get(
    "/guests/:name",
    asyncH(async (req, res) => {
      const raw = req.params.name!.trim();
      if (!raw) throw new HttpError(404, "not_found", "Spieler nicht gefunden");
      const c = await stats.get(profileQuerySchema.parse(req.query).game);
      const s = c.subjects.get(guestKey(raw));
      if (!s || s.kind !== "guest") throw new HttpError(404, "not_found", "Gast nicht gefunden");
      res.json(buildProfile(c, s, { kind: "guest", userId: null, name: raw }));
    }),
  );

  return r;
}
