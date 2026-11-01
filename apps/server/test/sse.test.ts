import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setBid } from "@scheisse/shared";
import { createMatch, setupTestApp, stateFor } from "./helpers";

const t = setupTestApp();
let server: http.Server;
let port: number;

beforeAll(async () => {
  server = http.createServer(t.app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});
beforeEach(() => t.reset());
afterAll(async () => {
  t.hub.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await t.close();
});

type Ev = { event: string; data: any };

interface Stream {
  headers: http.IncomingHttpHeaders;
  waitFor(pred: (events: Ev[]) => boolean): Promise<Ev[]>;
  close(): void;
}

function openStream(path: string): Promise<Stream> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path }, (res) => {
      let buf = "";
      const events: Ev[] = [];
      const waiters: (() => void)[] = [];
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        buf += chunk;
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const ev = /^event: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (ev && data) events.push({ event: ev, data: JSON.parse(data) });
        }
        waiters.splice(0).forEach((w) => w());
      });
      resolve({
        headers: res.headers,
        waitFor: (pred) =>
          new Promise((ok, fail) => {
            const timer = setTimeout(() => fail(new Error(`timeout; got ${JSON.stringify(events)}`)), 5000);
            const check = () => {
              if (pred(events)) {
                clearTimeout(timer);
                ok(events);
              } else waiters.push(check);
            };
            check();
          }),
        close: () => req.destroy(),
      });
    });
    req.on("error", reject);
  });
}

const twoPlayers = () =>
  stateFor([
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ]);

describe("SSE", () => {
  it("single match stream sends initial match event, updates and deleted", async () => {
    const { match, writeToken } = await createMatch(t.app, twoPlayers());
    const s = await openStream(`/api/matches/${match.id}/stream`);
    expect(s.headers["content-type"]).toMatch(/text\/event-stream/);
    expect(s.headers["cache-control"]).toBe("no-cache");
    const first = await s.waitFor((e) => e.length >= 1);
    expect(first[0]!.event).toBe("match");
    expect(first[0]!.data.version).toBe(1);

    const r = await request(t.app)
      .put(`/api/matches/${match.id}`)
      .set("X-Write-Token", writeToken)
      .send({ state: setBid(match.state, "a", 1), version: 1 });
    expect(r.status).toBe(200);
    const evs = await s.waitFor((e) => e.length >= 2);
    expect(evs[1]!.event).toBe("match");
    expect(evs[1]!.data.version).toBe(2);
    expect(evs[1]!.data.state.current.bids.a).toBe(1);

    await request(t.app).delete(`/api/matches/${match.id}`).set("X-Write-Token", writeToken);
    const evs2 = await s.waitFor((e) => e.some((x) => x.event === "deleted"));
    expect(evs2.at(-1)!.data.id).toBe(match.id);
    s.close();
  });

  it("lobby stream sends upsert and removed", async () => {
    const s = await openStream("/api/matches/stream?status=active");
    const { match, writeToken } = await createMatch(t.app, twoPlayers());
    const evs = await s.waitFor((e) => e.length >= 1);
    expect(evs[0]!.event).toBe("upsert");
    expect(evs[0]!.data).toMatchObject({ id: match.id, code: match.code, playerCount: 2, finished: false });
    await request(t.app).delete(`/api/matches/${match.id}`).set("X-Write-Token", writeToken);
    const evs2 = await s.waitFor((e) => e.some((x) => x.event === "removed"));
    expect(evs2.at(-1)!.data).toEqual({ id: match.id });
    s.close();
  });

  it("404 for unknown match stream", async () => {
    const r = await request(t.app).get("/api/matches/ZZZZZ/stream");
    expect(r.status).toBe(404);
  });
});
