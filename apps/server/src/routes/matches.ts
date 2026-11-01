import { and, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import {
  assertMatchConsistent,
  createMatchSchema,
  deriveMatch,
  getGame,
  listMatchesQuerySchema,
  matchResults,
  updateMatchSchema,
  type CreateMatchResponse,
  type DerivedMatch,
  type MatchState,
  type PlayerMatchResult,
} from "@gamenight/shared";
import type { Ctx } from "../app";
import type { Db } from "../db/client";
import { matchPlayers, matches, matchResults as matchResultsTable, users } from "../db/schema";
import { asyncH, HttpError, isUniqueViolation, likeContains } from "../lib/http";
import {
  generateCode,
  generateWriteToken,
  hashToken,
  toMatchDto,
  toSummaryDto,
  tokenMatches,
  type MatchRow,
} from "../matches/service";
import { sseInit, sseSend } from "../sse/hub";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

interface Prepared {
  derived: DerivedMatch;
  /** only set if finished */
  results: (matchId: string) => PlayerMatchResult[];
}

/** Game/kind checks on top of the engine's consistency checks. Throws on inconsistency. */
function assertConsistent(state: MatchState, previous?: MatchState): void {
  const game = getGame(state.gameId);
  if (!game) throw new Error(`unknown game ${state.gameId}`);
  if (game.kind !== state.kind) throw new Error(`game ${state.gameId} is not of kind ${state.kind}`);
  if (previous && (previous.gameId !== state.gameId || previous.kind !== state.kind)) throw new Error("the game of a match can't change");
  assertMatchConsistent(state);
}

const normName = (n: string) => n.trim().toLowerCase();

/** New guest seats (vs. the previously stored state) must not use an existing account username. */
async function assertGuestNamesFree(db: Db, state: MatchState, previous?: MatchState): Promise<void> {
  const known = new Set((previous?.setup.players ?? []).filter((p) => p.userId === null).map((p) => `${p.id}|${normName(p.name)}`));
  const fresh = state.setup.players.filter((p) => p.userId === null && !known.has(`${p.id}|${normName(p.name)}`));
  if (fresh.length === 0) return;
  const lowers = [...new Set(fresh.map((p) => normName(p.name)))];
  const taken = await db.select({ lower: users.usernameLower }).from(users).where(inArray(users.usernameLower, lowers));
  if (taken.length === 0) return;
  const set = new Set(taken.map((x) => x.lower));
  const bad = [...new Set(fresh.filter((p) => set.has(normName(p.name))).map((p) => p.name.trim()))];
  throw new HttpError(
    400,
    "guest_name_taken",
    `Der Name ${bad.map((n) => `„${n}“`).join(", ")} gehört bereits einem Konto. Bitte den Spieler per Konto hinzufügen oder einen anderen Namen wählen.`,
  );
}

/** Validates the state with the engine and (async) checks referenced users exist. Throws 400 invalid_state. */
async function prepareState(db: Db, state: MatchState, previous?: MatchState): Promise<Prepared> {
  let derived: DerivedMatch;
  let results: PlayerMatchResult[] | null = null;
  try {
    assertConsistent(state, previous);
    derived = deriveMatch(state);
    if (derived.finished) results = matchResults("00000000-0000-0000-0000-000000000000", state);
  } catch (e) {
    throw new HttpError(400, "invalid_state", `Ungültiger Spielstand: ${e instanceof Error ? e.message : "unknown"}`);
  }
  const ids = [...new Set(state.setup.players.map((p) => p.userId).filter((x): x is string => x !== null))];
  if (ids.length > 0) {
    const found = await db.select({ id: users.id }).from(users).where(inArray(users.id, ids));
    if (found.length !== ids.length) throw new HttpError(400, "invalid_state", "Unbekannter Benutzer in den Spielern");
  }
  await assertGuestNamesFree(db, state, previous);
  return {
    derived,
    results: (matchId) => (results ?? []).map((r) => ({ ...r, matchId })),
  };
}

async function writeDerivedRows(tx: Tx, matchId: string, state: MatchState, prepared: Prepared, finishedAt: Date): Promise<void> {
  await tx.delete(matchPlayers).where(eq(matchPlayers.matchId, matchId));
  await tx.insert(matchPlayers).values(
    state.setup.players.map((p, seat) => ({
      matchId,
      playerId: p.id,
      seat,
      name: p.name,
      userId: p.userId,
    })),
  );
  await tx.delete(matchResultsTable).where(eq(matchResultsTable.matchId, matchId));
  if (prepared.derived.finished) {
    const rows = prepared.results(matchId);
    if (rows.length > 0) {
      await tx.insert(matchResultsTable).values(
        rows.map((r) => ({
          matchId,
          playerId: r.playerId,
          userId: r.userId,
          name: r.name,
          gameId: r.gameId,
          finalScore: r.finalScore,
          placement: r.placement,
          playerCount: r.playerCount,
          rounds: r.rounds,
          avgScore: r.avgScore,
          rating: r.rating,
          correctRounds: r.correctRounds ?? 0,
          finishedAt,
        })),
      );
    }
  }
}

function writeToken(req: { header(name: string): string | undefined }): string {
  return req.header("x-write-token") ?? "";
}

export function matchesRouter(ctx: Ctx): Router {
  const { db, hub, stats } = ctx;
  const r = Router();

  const broadcast = (row: MatchRow) => hub.publishUpsert(toMatchDto(row), toSummaryDto(row));

  async function findByIdOrCode(idOrCode: string): Promise<MatchRow | undefined> {
    const cond = UUID_RE.test(idOrCode) ? eq(matches.id, idOrCode) : eq(matches.code, idOrCode.toUpperCase());
    const [row] = await db.select().from(matches).where(cond).limit(1);
    return row;
  }

  // ------------------------------------------------------------ create
  r.post(
    "/",
    asyncH(async (req, res) => {
      const { state } = createMatchSchema.parse(req.body);
      const prepared = await prepareState(db, state);
      const token = generateWriteToken();
      // The session user may have been deleted since the JWT was issued: treat as anonymous.
      let ownerUserId: string | null = null;
      if (req.userId) {
        const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.id, req.userId)).limit(1);
        ownerUserId = owner?.id ?? null;
      }
      let row: MatchRow | undefined;
      for (let attempt = 0; attempt < 8 && !row; attempt++) {
        try {
          row = await db.transaction(async (tx) => {
            const now = new Date();
            const [m] = await tx
              .insert(matches)
              .values({
                code: generateCode(),
                ownerUserId,
                writeTokenHash: hashToken(token),
                gameId: state.gameId,
                rulesetId: state.ruleset.id,
                state,
                finished: prepared.derived.finished,
                startedAt: now,
                finishedAt: prepared.derived.finished ? now : null,
                updatedAt: now,
                version: 1,
              })
              .returning();
            await writeDerivedRows(tx, m!.id, state, prepared, now);
            return m!;
          });
        } catch (e) {
          if (!isUniqueViolation(e)) throw e;
        }
      }
      if (!row) throw new HttpError(500, "internal", "Konnte keinen Code erzeugen");
      stats.invalidate();
      broadcast(row);
      res.status(201).json({ match: toMatchDto(row), writeToken: token } satisfies CreateMatchResponse);
    }),
  );

  // ------------------------------------------------------------ list
  r.get(
    "/",
    asyncH(async (req, res) => {
      const q = listMatchesQuerySchema.parse(req.query);
      const conds: SQL[] = [];
      if (q.status === "active") conds.push(eq(matches.finished, false));
      if (q.status === "finished") conds.push(eq(matches.finished, true));
      if (q.game) conds.push(eq(matches.gameId, q.game));
      if (q.search) {
        const pattern = likeContains(q.search);
        conds.push(
          or(
            sql`${matches.code} ilike ${pattern}`,
            sql`exists (select 1 from ${matchPlayers} mp where mp.match_id = ${matches.id} and mp.name ilike ${pattern})`,
          )!,
        );
      }
      const rows = await db
        .select()
        .from(matches)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(matches.startedAt))
        .limit(q.limit);
      res.json(rows.map(toSummaryDto));
    }),
  );

  // ------------------------------------------------------------ lobby stream (must precede /:idOrCode)
  r.get("/stream", (req, res) => {
    const { status } = z.object({ status: z.enum(["active", "finished", "all"]).default("active") }).parse(req.query);
    sseInit(res);
    hub.subscribeLobby(status, res);
  });

  // ------------------------------------------------------------ single match stream
  r.get(
    "/:id/stream",
    asyncH(async (req, res) => {
      const row = await findByIdOrCode(req.params.id!);
      if (!row) throw new HttpError(404, "not_found", "Match nicht gefunden");
      sseInit(res);
      hub.subscribeMatch(row.id, res);
      sseSend(res, "match", toMatchDto(row));
    }),
  );

  // ------------------------------------------------------------ get
  r.get(
    "/:idOrCode",
    asyncH(async (req, res) => {
      const row = await findByIdOrCode(req.params.idOrCode!);
      if (!row) throw new HttpError(404, "not_found", "Match nicht gefunden");
      res.json(toMatchDto(row));
    }),
  );

  // ------------------------------------------------------------ update
  r.put(
    "/:id",
    asyncH(async (req, res) => {
      const id = req.params.id!;
      if (!UUID_RE.test(id)) throw new HttpError(404, "not_found", "Match nicht gefunden");
      const token = writeToken(req);
      const body = updateMatchSchema.parse(req.body);

      const [existing] = await db.select().from(matches).where(eq(matches.id, id)).limit(1);
      if (!existing) throw new HttpError(404, "not_found", "Match nicht gefunden");
      if (!token || !tokenMatches(token, existing.writeTokenHash)) {
        throw new HttpError(403, "forbidden", "Kein Schreibzugriff");
      }
      const prepared = await prepareState(db, body.state, existing.state);

      const result = await db.transaction(async (tx) => {
        const [cur] = await tx.select().from(matches).where(eq(matches.id, id)).for("update");
        if (!cur) throw new HttpError(404, "not_found", "Match nicht gefunden");
        if (cur.version !== body.version) {
          throw new HttpError(409, "version_conflict", "Version veraltet", { match: toMatchDto(cur) });
        }
        const now = new Date();
        const finished = prepared.derived.finished;
        const [updated] = await tx
          .update(matches)
          .set({
            rulesetId: body.state.ruleset.id,
            state: body.state,
            finished,
            finishedAt: finished ? (cur.finishedAt ?? now) : null,
            updatedAt: now,
            version: cur.version + 1,
          })
          .where(eq(matches.id, id))
          .returning();
        await writeDerivedRows(tx, id, body.state, prepared, updated!.finishedAt ?? now);
        return updated!;
      });
      stats.invalidate();
      broadcast(result);
      res.json(toMatchDto(result));
    }),
  );

  // ------------------------------------------------------------ delete
  r.delete(
    "/:id",
    asyncH(async (req, res) => {
      const id = req.params.id!;
      if (!UUID_RE.test(id)) throw new HttpError(404, "not_found", "Match nicht gefunden");
      const [existing] = await db.select().from(matches).where(eq(matches.id, id)).limit(1);
      if (!existing) throw new HttpError(404, "not_found", "Match nicht gefunden");
      const token = writeToken(req);
      if (!token || !tokenMatches(token, existing.writeTokenHash)) {
        throw new HttpError(403, "forbidden", "Kein Schreibzugriff");
      }
      await db.delete(matches).where(eq(matches.id, id));
      stats.invalidate();
      hub.publishDeleted(id);
      res.status(204).end();
    }),
  );

  return r;
}
