import { and, asc, eq } from "drizzle-orm";
import { Router } from "express";
import {
  BUILTIN_RULESETS,
  GAMES,
  getGame,
  saveRulesetSchema,
  type GameCatalogDto,
  type Ruleset,
  type RulesetDto,
  type SaveRulesetRequest,
} from "@gamenight/shared";
import type { Ctx } from "../app";
import { rulesets } from "../db/schema";
import { asyncH, HttpError } from "../lib/http";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RulesetRow = typeof rulesets.$inferSelect;

function builtinDto(r: Ruleset): RulesetDto {
  return { ...r, builtin: true, ownerUserId: null, createdAt: null, updatedAt: null };
}

function toDto(row: RulesetRow): RulesetDto {
  // kind and rules were validated together on write
  const ruleset = { id: row.id, gameId: row.gameId, name: row.name, description: row.description, kind: row.kind, rules: row.rules } as Ruleset;
  return { ...ruleset, builtin: false, ownerUserId: row.ownerUserId, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

/** Game must exist and be of the ruleset's kind. */
function assertGameKind(body: SaveRulesetRequest): void {
  const game = getGame(body.gameId);
  if (!game) throw new HttpError(400, "validation", `Unbekanntes Spiel: ${body.gameId}`);
  if (game.kind !== body.kind) throw new HttpError(400, "validation", `${game.name} erwartet Regeln vom Typ ${game.kind}`);
}

export function gamesRouter({ db }: Ctx): Router {
  const r = Router();
  r.get(
    "/",
    asyncH(async (req, res) => {
      const own = req.userId
        ? await db.select().from(rulesets).where(eq(rulesets.ownerUserId, req.userId)).orderBy(asc(rulesets.gameId), asc(rulesets.name))
        : [];
      const out: GameCatalogDto = { games: GAMES, rulesets: [...BUILTIN_RULESETS.map(builtinDto), ...own.map(toDto)] };
      res.json(out);
    }),
  );
  return r;
}

export function rulesetsRouter({ db }: Ctx): Router {
  const r = Router();

  async function findOwned(id: string, userId: string | undefined): Promise<RulesetRow> {
    if (!userId) throw new HttpError(401, "unauthorized", "Nicht angemeldet");
    if (!UUID_RE.test(id)) throw new HttpError(404, "not_found", "Regelwerk nicht gefunden");
    const [row] = await db.select().from(rulesets).where(eq(rulesets.id, id)).limit(1);
    if (!row) throw new HttpError(404, "not_found", "Regelwerk nicht gefunden");
    if (row.ownerUserId !== userId) throw new HttpError(403, "forbidden", "Nicht dein Regelwerk");
    return row;
  }

  r.post(
    "/",
    asyncH(async (req, res) => {
      if (!req.userId) throw new HttpError(401, "unauthorized", "Nicht angemeldet");
      const body = saveRulesetSchema.parse(req.body);
      assertGameKind(body);
      const [row] = await db
        .insert(rulesets)
        .values({ ownerUserId: req.userId, gameId: body.gameId, kind: body.kind, name: body.name, description: body.description, rules: body.rules })
        .returning();
      res.status(201).json(toDto(row!));
    }),
  );

  r.put(
    "/:id",
    asyncH(async (req, res) => {
      const existing = await findOwned(req.params.id!, req.userId);
      const body = saveRulesetSchema.parse(req.body);
      assertGameKind(body);
      if (body.gameId !== existing.gameId || body.kind !== existing.kind) {
        throw new HttpError(400, "validation", "Spiel und Typ eines Regelwerks können nicht geändert werden");
      }
      const [row] = await db
        .update(rulesets)
        .set({ name: body.name, description: body.description, rules: body.rules, updatedAt: new Date() })
        .where(and(eq(rulesets.id, existing.id), eq(rulesets.ownerUserId, existing.ownerUserId)))
        .returning();
      res.json(toDto(row!));
    }),
  );

  r.delete(
    "/:id",
    asyncH(async (req, res) => {
      const existing = await findOwned(req.params.id!, req.userId);
      await db.delete(rulesets).where(eq(rulesets.id, existing.id));
      res.status(204).end();
    }),
  );

  return r;
}
