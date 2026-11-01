import { asc, desc, isNull, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { userLabel, type PlayerSearchResultDto } from "@scheisse/shared";
import type { Ctx } from "../app";
import { matchPlayers, matches, users } from "../db/schema";
import { asyncH, likeContains } from "../lib/http";
import { toUserDto } from "./auth";

const searchSchema = z.object({ search: z.string().trim().max(50).optional() });

const userMatches = (search: string) =>
  sql`(${users.usernameLower} like ${likeContains(search.toLowerCase())} or lower(${users.displayName}) like ${likeContains(search.toLowerCase())})`;

export function usersRouter({ db }: Ctx): Router {
  const r = Router();
  r.get(
    "/",
    asyncH(async (req, res) => {
      const { search } = searchSchema.parse(req.query);
      const q = db.select().from(users);
      const rows = await (search ? q.where(userMatches(search)) : q).orderBy(asc(users.usernameLower)).limit(20);
      res.json(rows.map(toUserDto));
    }),
  );
  return r;
}

/** Search for seat candidates: accounts and guest names used in earlier matches. */
export function playersRouter({ db }: Ctx): Router {
  const r = Router();
  r.get(
    "/",
    asyncH(async (req, res) => {
      const { search } = searchSchema.parse(req.query);
      if (!search) {
        res.json([]);
        return;
      }
      const userRows = await db.select().from(users).where(userMatches(search)).orderBy(asc(users.usernameLower)).limit(20);

      // One row per lower(trim(name)), keeping the most recently used spelling; names that equal a username are accounts.
      const lowerName = sql<string>`lower(trim(${matchPlayers.name}))`;
      const guestRows = await db
        .selectDistinctOn([lowerName], { name: sql<string>`trim(${matchPlayers.name})` })
        .from(matchPlayers)
        .innerJoin(matches, sql`${matches.id} = ${matchPlayers.matchId}`)
        .where(
          sql`${isNull(matchPlayers.userId)} and ${lowerName} like ${likeContains(search.toLowerCase())}
              and not exists (select 1 from ${users} where ${users.usernameLower} = ${lowerName})`,
        )
        .orderBy(lowerName, desc(matches.startedAt))
        .limit(20);

      const out: PlayerSearchResultDto[] = [
        ...userRows.map((u) => ({ kind: "user" as const, userId: u.id, name: userLabel(u), username: u.username })),
        ...guestRows.map((g) => ({ kind: "guest" as const, userId: null, name: g.name, username: null })),
      ];
      res.json(out);
    }),
  );
  return r;
}
