import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { deriveMatch, type MatchDto, type MatchSummaryDto } from "@gamenight/shared";
import type { matches } from "../db/schema";

export type MatchRow = typeof matches.$inferSelect;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateCode(): string {
  let s = "";
  for (const b of randomBytes(5)) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return s;
}

export function generateWriteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenMatches(token: string, hash: string): boolean {
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function toMatchDto(row: MatchRow): MatchDto {
  return {
    id: row.id,
    code: row.code,
    ownerUserId: row.ownerUserId,
    state: row.state,
    finished: row.finished,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}

export function toSummaryDto(row: MatchRow): MatchSummaryDto {
  const d = deriveMatch(row.state);
  return {
    id: row.id,
    code: row.code,
    gameId: row.state.gameId,
    rulesetName: row.state.ruleset.name,
    playerNames: row.state.setup.players.map((p) => p.name),
    playerCount: row.state.setup.players.length,
    roundNumber: d.roundNumber,
    totalRounds: d.totalRounds,
    cardsThisRound: d.kind === "trick-bidding" ? d.cardsThisRound : null,
    finished: row.finished,
    startedAt: row.startedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
