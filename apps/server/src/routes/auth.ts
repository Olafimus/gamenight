import bcrypt from "bcryptjs";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { Router, type Request, type RequestHandler, type Response } from "express";
import jwt from "jsonwebtoken";
import {
  changePasswordSchema,
  claimGuestSchema,
  credentialsSchema,
  mapPlayers,
  registerSchema,
  updateProfileSchema,
  type ClaimGuestResponse,
  type UserDto,
} from "@gamenight/shared";
import type { Ctx } from "../app";
import { matchPlayers, matchResults, matches, users } from "../db/schema";
import { asyncH, HttpError, isUniqueViolation } from "../lib/http";

declare module "express-serve-static-core" {
  interface Request {
    /** Set by sessionMiddleware when a valid session cookie is present. */
    userId?: string;
  }
}

const COOKIE = "session";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

type Tx = Parameters<Parameters<Ctx["db"]["transaction"]>[0]>[0];

export function toUserDto(u: typeof users.$inferSelect): UserDto {
  return { id: u.id, username: u.username, displayName: u.displayName, createdAt: u.createdAt.toISOString() };
}

export function sessionMiddleware(ctx: Ctx): RequestHandler {
  return (req, _res, next) => {
    const token = req.cookies?.[COOKIE];
    if (typeof token === "string") {
      try {
        const payload = jwt.verify(token, ctx.env.jwtSecret, { algorithms: ["HS256"] });
        if (typeof payload === "object" && typeof payload.sub === "string") req.userId = payload.sub;
      } catch {
        /* invalid/expired -> anonymous */
      }
    }
    next();
  };
}

/** Reassigns the finished-match seats of a guest name (lower-cased) to the user; null when the guest has none. */
async function claimGuestSeats(tx: Tx, userId: string, lower: string): Promise<ClaimGuestResponse | null> {
  const guestCond = and(isNull(matchResults.userId), sql`lower(trim(${matchResults.name})) = ${lower}`)!;
  const rows = await tx
    .select({ matchId: matchResults.matchId, playerId: matchResults.playerId })
    .from(matchResults)
    .innerJoin(matches, and(eq(matches.id, matchResults.matchId), eq(matches.finished, true)))
    .where(guestCond);
  if (rows.length === 0) return null;
  const matchIds = [...new Set(rows.map((x) => x.matchId))];
  const mine = await tx
    .select({ matchId: matchResults.matchId })
    .from(matchResults)
    .where(and(eq(matchResults.userId, userId), inArray(matchResults.matchId, matchIds)));
  const conflict = new Set(mine.map((x) => x.matchId));
  // one claimed player per match (if the name occurs twice, the first one wins)
  const claims = new Map<string, string>();
  for (const x of rows) if (!conflict.has(x.matchId) && !claims.has(x.matchId)) claims.set(x.matchId, x.playerId);
  for (const [matchId, playerId] of claims) {
    await tx
      .update(matchResults)
      .set({ userId })
      .where(and(eq(matchResults.matchId, matchId), eq(matchResults.playerId, playerId)));
    await tx
      .update(matchPlayers)
      .set({ userId })
      .where(and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.playerId, playerId)));
    const [m] = await tx.select({ state: matches.state }).from(matches).where(eq(matches.id, matchId)).for("update");
    if (m) {
      const state = mapPlayers(m.state, (p) => (p.id === playerId ? { ...p, userId } : p));
      await tx.update(matches).set({ state }).where(eq(matches.id, matchId));
    }
  }
  return { claimedMatches: claims.size, skippedMatches: matchIds.length - claims.size };
}

export function authRouter(ctx: Ctx): Router {
  const { db, env, stats } = ctx;
  const r = Router();

  const isSecure = (req: Request) => env.cookieSecure ?? req.secure;
  const setSession = (req: Request, res: Response, userId: string) => {
    const token = jwt.sign({}, env.jwtSecret, { algorithm: "HS256", subject: userId, expiresIn: "30d" });
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecure(req),
      maxAge: MAX_AGE_MS,
      path: "/",
    });
  };

  r.post(
    "/register",
    asyncH(async (req, res) => {
      const { username, password, claimGuest } = registerSchema.parse(req.body);
      const lower = username.toLowerCase();
      // A guest seat already uses this name: the client asks first, then the guest is taken over into the new account.
      const [guest] = await db
        .select({ name: matchPlayers.name })
        .from(matchPlayers)
        .where(and(isNull(matchPlayers.userId), sql`lower(trim(${matchPlayers.name})) = ${lower}`))
        .limit(1);
      if (guest && !claimGuest) {
        const guestName = guest.name.trim();
        throw new HttpError(409, "username_guest_taken", `Der Name „${guestName}“ gehört einem Gastspieler.`, { guestName });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      try {
        const u = await db.transaction(async (tx) => {
          const [created] = await tx.insert(users).values({ username, usernameLower: lower, passwordHash }).returning();
          if (guest) await claimGuestSeats(tx, created!.id, lower);
          return created!;
        });
        if (guest) stats.invalidate();
        setSession(req, res, u.id);
        res.status(201).json(toUserDto(u));
      } catch (e) {
        if (isUniqueViolation(e)) throw new HttpError(409, "username_taken", "Benutzername bereits vergeben");
        throw e;
      }
    }),
  );

  r.post(
    "/login",
    asyncH(async (req, res) => {
      const { username, password } = credentialsSchema.parse(req.body);
      const [u] = await db.select().from(users).where(eq(users.usernameLower, username.toLowerCase())).limit(1);
      const ok = u ? await bcrypt.compare(password, u.passwordHash) : false;
      if (!u || !ok) throw new HttpError(401, "invalid_credentials", "Benutzername oder Passwort falsch");
      setSession(req, res, u.id);
      res.json(toUserDto(u));
    }),
  );

  r.post("/logout", (req, res) => {
    res.clearCookie(COOKIE, { httpOnly: true, sameSite: "lax", secure: isSecure(req), path: "/" });
    res.status(204).end();
  });

  r.get(
    "/me",
    asyncH(async (req, res) => {
      if (!req.userId) throw new HttpError(401, "unauthorized", "Nicht angemeldet");
      const [u] = await db.select().from(users).where(eq(users.id, req.userId)).limit(1);
      if (!u) throw new HttpError(401, "unauthorized", "Nicht angemeldet");
      res.json(toUserDto(u));
    }),
  );

  r.patch(
    "/me",
    asyncH(async (req, res) => {
      if (!req.userId) throw new HttpError(401, "unauthorized", "Nicht angemeldet");
      const { displayName } = updateProfileSchema.parse(req.body);
      const [u] = await db.update(users).set({ displayName }).where(eq(users.id, req.userId)).returning();
      if (!u) throw new HttpError(401, "unauthorized", "Nicht angemeldet");
      stats.invalidate();
      res.json(toUserDto(u));
    }),
  );

  r.post(
    "/password",
    asyncH(async (req, res) => {
      if (!req.userId) throw new HttpError(401, "unauthorized", "Nicht angemeldet");
      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
      const [u] = await db.select().from(users).where(eq(users.id, req.userId)).limit(1);
      if (!u) throw new HttpError(401, "unauthorized", "Nicht angemeldet");
      if (!(await bcrypt.compare(currentPassword, u.passwordHash))) {
        throw new HttpError(400, "invalid_credentials", "Aktuelles Passwort ist falsch");
      }
      await db.update(users).set({ passwordHash: await bcrypt.hash(newPassword, 10) }).where(eq(users.id, u.id));
      res.status(204).end();
    }),
  );

  r.post(
    "/claim-guest",
    asyncH(async (req, res) => {
      if (!req.userId) throw new HttpError(401, "unauthorized", "Nicht angemeldet");
      const userId = req.userId;
      const { name } = claimGuestSchema.parse(req.body);
      const lower = name.toLowerCase();
      const out = await db.transaction((tx) => claimGuestSeats(tx, userId, lower));
      if (!out) throw new HttpError(404, "not_found", "Kein Gast mit diesem Namen gefunden");
      stats.invalidate();
      res.json(out);
    }),
  );

  return r;
}
