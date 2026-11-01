import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError } from "zod";
import type { ApiError } from "@gamenight/shared";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message ?? code);
  }
}

export const asyncH =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    const msg = err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    res.status(400).json({ error: msg, code: "validation" } satisfies ApiError);
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
    return;
  }
  const e = err as { type?: string };
  if (e?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Invalid JSON", code: "validation" } satisfies ApiError);
    return;
  }
  if (e?.type === "entity.too.large") {
    res.status(413).json({ error: "Payload too large", code: "payload_too_large" } satisfies ApiError);
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error", code: "internal" } satisfies ApiError);
}

/** Escape LIKE wildcards (default escape char is backslash in Postgres). */
export function likeContains(s: string): string {
  return `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
