import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import type { Db } from "./db/client";
import type { Env } from "./env";
import { errorHandler, HttpError } from "./lib/http";
import { authRouter, sessionMiddleware } from "./routes/auth";
import { matchesRouter } from "./routes/matches";
import { statsRouter } from "./routes/stats";
import { playersRouter, usersRouter } from "./routes/users";
import { StatsCache } from "./stats/cache";
import { Hub } from "./sse/hub";

export interface Ctx {
  db: Db;
  env: Pick<Env, "jwtSecret" | "production" | "cookieSecure">;
  hub: Hub;
  stats: StatsCache;
}

export interface AppDeps {
  db: Db;
  env: Pick<Env, "jwtSecret" | "production" | "cookieSecure">;
  hub?: Hub;
}

export function createApp(deps: AppDeps): { app: Express; hub: Hub; stats: StatsCache } {
  const hub = deps.hub ?? new Hub();
  const ctx: Ctx = { db: deps.db, env: deps.env, hub, stats: new StatsCache(deps.db) };
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "256kb" }));
  app.use(cookieParser());
  app.use(sessionMiddleware(ctx));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/api/auth", authRouter(ctx));
  app.use("/api/users", usersRouter(ctx));
  app.use("/api/players", playersRouter(ctx));
  app.use("/api/matches", matchesRouter(ctx));
  app.use("/api/stats", statsRouter(ctx));

  app.use("/api", (_req, _res, next) => next(new HttpError(404, "not_found", "Not found")));
  app.use(errorHandler);
  return { app, hub, stats: ctx.stats };
}
