import { and, eq } from "drizzle-orm";
import {
  categoriesOf,
  compareByElo,
  computeElo,
  ELO_START,
  periodCutoff,
  scopeMetrics,
  STATS_CATEGORIES,
  statsCategory,
  type CategoryBreakdownDto,
  type EloResult,
  type LeaderboardEntryDto,
  type StatsCategoryDto,
  type StatsPeriod,
  type StatsSubjectKind,
  type SubjectMatchRow,
} from "@gamenight/shared";
import type { Db } from "../db/client";
import { matchPlayers, matches, matchResults, users } from "../db/schema";

export const guestKey = (name: string) => `g:${name.trim().toLowerCase()}`;

export interface StatRow extends SubjectMatchRow {
  gameId: string;
  key: string;
  kind: StatsSubjectKind;
  userId: string | null;
  name: string;
  playerId: string;
  seat: number;
  code: string;
  startedAt: string;
  finalScore: number;
}

export interface Subject {
  key: string;
  kind: StatsSubjectKind;
  userId: string | null;
  /** most recent spelling */
  name: string;
  rows: StatRow[];
}

export interface Computed {
  version: number;
  gameId: string;
  rows: StatRow[];
  subjects: Map<string, Subject>;
  byMatch: Map<string, StatRow[]>;
  elo: EloResult;
  memo: Map<string, LeaderboardResult>;
}

export interface LeaderboardResult {
  categories: StatsCategoryDto[];
  /** ranked list for the scope (before text search) */
  entries: LeaderboardEntryDto[];
}

interface Loaded {
  version: number;
  games: Map<string, Computed>;
}

/** Subjects, per-match rows and Elo of one game. `rows` must be chronological. */
function computeGame(version: number, gameId: string, rows: StatRow[]): Computed {
  const subjects = new Map<string, Subject>();
  const byMatch = new Map<string, StatRow[]>();
  for (const row of rows) {
    let s = subjects.get(row.key);
    if (!s) subjects.set(row.key, (s = { key: row.key, kind: row.kind, userId: row.userId, name: row.name, rows: [] }));
    s.name = row.name; // rows are chronological: last spelling wins
    s.rows.push(row);
    let m = byMatch.get(row.matchId);
    if (!m) byMatch.set(row.matchId, (m = []));
    m.push(row);
  }
  for (const m of byMatch.values()) m.sort((a, b) => a.seat - b.seat);

  const elo = computeElo(
    [...byMatch.entries()].map(([matchId, rs]) => ({
      matchId,
      at: rs[0]!.at,
      players: rs.map((x) => ({ key: x.key, placement: x.placement })),
    })),
  );
  return { version, gameId, rows, subjects, byMatch, elo, memo: new Map() };
}

/**
 * In-memory cache of everything derived from finished matches (rows, Elo). Computed separately per game
 * (Elo and rankings never mix games). Invalidated by a
 * simple version counter whenever a match is created/updated/deleted or a guest is claimed.
 */
export class StatsCache {
  private version = 0;
  private current: Loaded | null = null;
  private loading: Promise<Loaded> | null = null;
  /** number of full recomputations (for tests) */
  loads = 0;

  constructor(private readonly db: Db) {}

  invalidate(): void {
    this.version += 1;
  }

  async get(gameId: string): Promise<Computed> {
    const loaded = await this.loadAll();
    let c = loaded.games.get(gameId);
    if (!c) loaded.games.set(gameId, (c = computeGame(loaded.version, gameId, [])));
    return c;
  }

  private async loadAll(): Promise<Loaded> {
    for (;;) {
      if (this.current && this.current.version === this.version) return this.current;
      let p = this.loading;
      if (!p) {
        p = this.load(this.version).finally(() => {
          this.loading = null;
        });
        this.loading = p;
      }
      const c = await p;
      if (c.version === this.version) {
        this.current = c;
        return c;
      }
    }
  }

  private async load(version: number): Promise<Loaded> {
    this.loads += 1;
    const data = await this.db
      .select({
        r: matchResults,
        username: users.username,
        displayName: users.displayName,
        seat: matchPlayers.seat,
        code: matches.code,
        startedAt: matches.startedAt,
      })
      .from(matchResults)
      .innerJoin(matches, and(eq(matches.id, matchResults.matchId), eq(matches.finished, true)))
      .leftJoin(users, eq(users.id, matchResults.userId))
      .leftJoin(matchPlayers, and(eq(matchPlayers.matchId, matchResults.matchId), eq(matchPlayers.playerId, matchResults.playerId)));

    const rows: StatRow[] = data.map(({ r, username, displayName, seat, code, startedAt }) => {
      const userId = r.userId;
      return {
        matchId: r.matchId,
        gameId: r.gameId,
        at: r.finishedAt.toISOString(),
        placement: r.placement,
        playerCount: r.playerCount,
        rounds: r.rounds,
        correctRounds: r.correctRounds,
        avgScore: r.avgScore,
        key: userId ?? guestKey(r.name),
        kind: userId ? "user" : "guest",
        userId,
        name: userId ? (displayName || username || r.name) : r.name.trim(),
        playerId: r.playerId,
        seat: seat ?? 0,
        code,
        startedAt: startedAt.toISOString(),
        finalScore: r.finalScore,
      };
    });
    rows.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || (a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0));


    const byGame = new Map<string, StatRow[]>();
    for (const row of rows) {
      let g = byGame.get(row.gameId);
      if (!g) byGame.set(row.gameId, (g = []));
      g.push(row);
    }
    return { version, games: new Map([...byGame].map(([gameId, rs]) => [gameId, computeGame(version, gameId, rs)])) };
  }

  eloOf(c: Computed, key: string): number {
    return c.elo.ratings.get(key) ?? ELO_START;
  }

  /** Metrics of one subject within a category/period scope. */
  subjectScope(c: Computed, s: Subject, category: string, period: StatsPeriod, now = Date.now()) {
    const cat = statsCategory(category)!;
    const cutoff = periodCutoff(period, now);
    const rows = s.rows.filter((r) => cat.includes(r.playerCount) && (cutoff === null || Date.parse(r.at) >= cutoff));
    return scopeMetrics(rows, (id) => c.elo.deltas.get(id)?.get(s.key) ?? 0);
  }

  entryOf(c: Computed, s: Subject, category: string, period: StatsPeriod, now = Date.now()): LeaderboardEntryDto {
    const m = this.subjectScope(c, s, category, period, now);
    return {
      kind: s.kind,
      key: s.key,
      userId: s.userId,
      name: s.name,
      provisional: m.provisional,
      rank: 0,
      elo: this.eloOf(c, s.key),
      eloDelta: m.eloDelta,
      matchCount: m.matchCount,
      wins: m.wins,
      winRate: m.winRate,
      expectedWinRate: m.expectedWinRate,
      placementScore: m.placementScore,
      avgPoints: m.avgPoints,
      hitRate: m.hitRate,
      form: m.form,
    };
  }

  leaderboard(c: Computed, category: string, period: StatsPeriod, now = Date.now()): LeaderboardResult {
    const bucket = period === "all" ? 0 : Math.floor(now / 60_000);
    const memoKey = `${category}|${period}|${bucket}`;
    const hit = c.memo.get(memoKey);
    if (hit) return hit;

    const cutoff = periodCutoff(period, now);
    const counts = new Map<string, Set<string>>();
    for (const [matchId, rs] of c.byMatch) {
      if (cutoff !== null && Date.parse(rs[0]!.at) < cutoff) continue;
      for (const id of categoriesOf(rs[0]!.playerCount)) {
        let set = counts.get(id);
        if (!set) counts.set(id, (set = new Set()));
        set.add(matchId);
      }
    }
    const categories: StatsCategoryDto[] = STATS_CATEGORIES.filter((x) => counts.has(x.id)).map((x) => ({
      id: x.id,
      label: x.label,
      matchCount: counts.get(x.id)!.size,
    }));

    const entries: LeaderboardEntryDto[] = [];
    for (const s of c.subjects.values()) {
      const e = this.entryOf(c, s, category, period, now);
      if (e.matchCount > 0) entries.push(e);
    }
    entries.sort(compareByElo);
    entries.forEach((e, i) => (e.rank = i + 1));

    if (c.memo.size > 60) c.memo.clear();
    const res = { categories, entries };
    c.memo.set(memoKey, res);
    return res;
  }

  breakdown(c: Computed, s: Subject): CategoryBreakdownDto[] {
    const out: CategoryBreakdownDto[] = [];
    for (const cat of STATS_CATEGORIES) {
      const m = this.subjectScope(c, s, cat.id, "all");
      if (m.matchCount === 0) continue;
      out.push({
        id: cat.id,
        label: cat.label,
        matchCount: m.matchCount,
        wins: m.wins,
        winRate: m.winRate,
        expectedWinRate: m.expectedWinRate,
        placementScore: m.placementScore,
        avgPoints: m.avgPoints,
        hitRate: m.hitRate,
        eloDelta: m.eloDelta,
      });
    }
    return out;
  }
}
