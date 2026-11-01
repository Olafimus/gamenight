import type { Response } from "express";
import type { MatchDto, MatchSummaryDto } from "@scheisse/shared";

export type LobbyStatus = "active" | "finished" | "all";

interface LobbyClient {
  res: Response;
  status: LobbyStatus;
}

export function sseInit(res: Response): void {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write(": connected\n\n");
}

export function sseSend(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

const PING = "event: ping\ndata: 1\n\n";

function matchesStatus(status: LobbyStatus, finished: boolean): boolean {
  return status === "all" || (status === "finished") === finished;
}

export class Hub {
  private matchClients = new Map<string, Set<Response>>();
  private lobbyClients = new Set<LobbyClient>();
  private pingTimer: NodeJS.Timeout | null;

  constructor(pingMs = 15000) {
    this.pingTimer = setInterval(() => this.ping(), pingMs);
    this.pingTimer.unref();
  }

  close(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    for (const set of this.matchClients.values()) for (const r of set) r.end();
    for (const c of this.lobbyClients) c.res.end();
    this.matchClients.clear();
    this.lobbyClients.clear();
  }

  /** A named event (not a comment) so clients can see it and detect dead connections. */
  private ping(): void {
    for (const set of this.matchClients.values()) for (const r of set) r.write(PING);
    for (const c of this.lobbyClients) c.res.write(PING);
  }

  subscribeMatch(matchId: string, res: Response): void {
    let set = this.matchClients.get(matchId);
    if (!set) {
      set = new Set();
      this.matchClients.set(matchId, set);
    }
    const s = set;
    s.add(res);
    res.on("close", () => {
      s.delete(res);
      if (s.size === 0 && this.matchClients.get(matchId) === s) this.matchClients.delete(matchId);
    });
  }

  subscribeLobby(status: LobbyStatus, res: Response): void {
    const client = { res, status };
    this.lobbyClients.add(client);
    res.on("close", () => this.lobbyClients.delete(client));
  }

  publishUpsert(match: MatchDto, summary: MatchSummaryDto): void {
    for (const r of this.matchClients.get(match.id) ?? []) sseSend(r, "match", match);
    for (const c of this.lobbyClients) {
      if (matchesStatus(c.status, match.finished)) sseSend(c.res, "upsert", summary);
      else sseSend(c.res, "removed", { id: match.id });
    }
  }

  publishDeleted(id: string): void {
    for (const r of this.matchClients.get(id) ?? []) sseSend(r, "deleted", { id });
    for (const c of this.lobbyClients) sseSend(c.res, "removed", { id });
  }
}
