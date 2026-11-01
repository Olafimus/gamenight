import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createMatch, playRounds, registerUser, setupTestApp, stateFor } from "./helpers";

const t = setupTestApp();
beforeEach(() => t.reset());
afterAll(() => t.close());

describe("health", () => {
  it("returns ok", async () => {
    const r = await request(t.app).get("/api/health");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
  });
});

describe("auth", () => {
  it("registers, sets cookie, me works, logout clears", async () => {
    const agent = request.agent(t.app);
    const reg = await agent.post("/api/auth/register").send({ username: "Alice", password: "secret123" });
    expect(reg.status).toBe(201);
    expect(reg.body).toMatchObject({ username: "Alice" });
    expect(reg.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(reg.body.passwordHash).toBeUndefined();
    expect(String(reg.headers["set-cookie"])).toMatch(/session=.*HttpOnly/i);

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.id).toBe(reg.body.id);

    const out = await agent.post("/api/auth/logout");
    expect(out.status).toBe(204);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("me without cookie is 401", async () => {
    const r = await request(t.app).get("/api/auth/me");
    expect(r.status).toBe(401);
    expect(r.body.code).toBeTruthy();
  });

  it("login works with case-insensitive username, wrong password is 401", async () => {
    await registerUser(t.app, "Alice");
    const ok = await request(t.app).post("/api/auth/login").send({ username: "alice", password: "secret123" });
    expect(ok.status).toBe(200);
    expect(ok.body.username).toBe("Alice");
    const bad = await request(t.app).post("/api/auth/login").send({ username: "Alice", password: "wrong-pass" });
    expect(bad.status).toBe(401);
    expect(bad.body.code).toBe("invalid_credentials");
    const unknown = await request(t.app).post("/api/auth/login").send({ username: "nobody", password: "secret123" });
    expect(unknown.status).toBe(401);
  });

  it("duplicate username (case-insensitive) is 409", async () => {
    await registerUser(t.app, "Alice");
    const r = await request(t.app).post("/api/auth/register").send({ username: "ALICE", password: "secret123" });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("username_taken");
  });

  it("validation errors are 400 validation", async () => {
    const r = await request(t.app).post("/api/auth/register").send({ username: "a", password: "x" });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("validation");
    const bad = await request(t.app).post("/api/auth/register").set("Content-Type", "application/json").send("{oops");
    expect(bad.status).toBe(400);
  });

  it("searches users case-insensitively, sorted, max 20", async () => {
    for (const n of ["bob", "Alice", "alfred", "Carl"]) await registerUser(t.app, n);
    const r = await request(t.app).get("/api/users").query({ search: "AL" });
    expect(r.status).toBe(200);
    expect(r.body.map((u: { username: string }) => u.username)).toEqual(["alfred", "Alice"]);
    const all = await request(t.app).get("/api/users");
    expect(all.body).toHaveLength(4);
  });
});

describe("session cookie secure flag", () => {
  it("is Secure only for HTTPS requests (X-Forwarded-Proto) even in production", async () => {
    const { createApp } = await import("../src/app");
    const { app, hub } = createApp({ db: t.db, env: { jwtSecret: "s", production: true } });
    try {
      const plain = await request(app).post("/api/auth/register").send({ username: "CookiePlain", password: "secret123" });
      expect(plain.status).toBe(201);
      expect(String(plain.headers["set-cookie"])).not.toMatch(/;\s*Secure/i);
      const https = await request(app).post("/api/auth/register").set("X-Forwarded-Proto", "https").send({ username: "CookieTls", password: "secret123" });
      expect(https.status).toBe(201);
      expect(String(https.headers["set-cookie"])).toMatch(/;\s*Secure/i);
    } finally {
      hub.close();
    }
  });

  it("COOKIE_SECURE override wins", async () => {
    const { createApp } = await import("../src/app");
    const { app, hub } = createApp({ db: t.db, env: { jwtSecret: "s", production: false, cookieSecure: true } });
    try {
      const r = await request(app).post("/api/auth/register").send({ username: "CookieForce", password: "secret123" });
      expect(String(r.headers["set-cookie"])).toMatch(/;\s*Secure/i);
    } finally {
      hub.close();
    }
  });
});

describe("account profile", () => {
  it("sets and clears the display name, search finds it", async () => {
    const { agent } = await registerUser(t.app, "alice");
    const set = await agent.patch("/api/auth/me").send({ displayName: "  Ali Baba " });
    expect(set.status).toBe(200);
    expect(set.body.displayName).toBe("Ali Baba");
    expect((await agent.get("/api/auth/me")).body.displayName).toBe("Ali Baba");
    const found = await request(t.app).get("/api/users?search=baba");
    expect(found.body.map((u: { username: string }) => u.username)).toEqual(["alice"]);
    const cleared = await agent.patch("/api/auth/me").send({ displayName: "" });
    expect(cleared.body.displayName).toBeNull();
    expect((await request(t.app).patch("/api/auth/me").send({ displayName: "x" })).status).toBe(401);
  });

  it("changes the password only with the current one", async () => {
    const { agent } = await registerUser(t.app, "alice");
    const bad = await agent.post("/api/auth/password").send({ currentPassword: "nope", newPassword: "newsecret" });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("invalid_credentials");
    expect((await agent.post("/api/auth/password").send({ currentPassword: "secret123", newPassword: "newsecret" })).status).toBe(204);
    expect((await request(t.app).post("/api/auth/login").send({ username: "alice", password: "newsecret" })).status).toBe(200);
  });
});

describe("guest names", () => {
  it("block registering the same username", async () => {
    await createMatch(t.app, stateFor([{ id: "a", name: "Gustav" }, { id: "b", name: "Bert" }]));
    const r = await request(t.app).post("/api/auth/register").send({ username: "gustav", password: "secret123" });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("username_guest_taken");
    expect(r.body.guestName).toBe("Gustav");
    expect((await request(t.app).post("/api/auth/register").send({ username: "gustav2", password: "secret123" })).status).toBe(201);
  });

  it("register with claimGuest takes the guest over", async () => {
    const fin = await createMatch(t.app, playRounds(stateFor([{ id: "a", name: "Gustav" }, { id: "b", name: "Bert" }])));
    const agent = request.agent(t.app);
    const r = await agent.post("/api/auth/register").send({ username: "gustav", password: "secret123", claimGuest: true });
    expect(r.status).toBe(201);
    const stored = await request(t.app).get(`/api/matches/${fin.match.id}`);
    expect(stored.body.state.setup.players.find((p: { id: string }) => p.id === "a").userId).toBe(r.body.id);
    expect((await agent.get("/api/auth/me")).status).toBe(200);
    // the guest is gone, so the name is now an ordinary taken username
    const again = await request(t.app).post("/api/auth/register").send({ username: "Gustav", password: "secret123", claimGuest: true });
    expect(again.body.code).toBe("username_taken");
  });

  it("player search returns accounts and distinct guests", async () => {
    const { user } = await registerUser(t.app, "berta");
    await createMatch(t.app, stateFor([{ id: "a", name: "Bernd" }, { id: "b", name: "Berta", userId: user.id }]));
    await createMatch(t.app, stateFor([{ id: "a", name: "bernd" }, { id: "b", name: "Zoe" }]));
    const r = await request(t.app).get("/api/players?search=ber");
    expect(r.status).toBe(200);
    expect(r.body).toEqual([
      { kind: "user", userId: user.id, name: "berta", username: "berta" },
      { kind: "guest", userId: null, name: "bernd", username: null },
    ]);
    expect((await request(t.app).get("/api/players")).body).toEqual([]);
  });
});
