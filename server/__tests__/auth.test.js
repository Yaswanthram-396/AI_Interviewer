const express = require("express");
const cookieParser = require("cookie-parser");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const { loadAuthConfig } = require("../auth/config");
const { createMemoryAuthRepo } = require("../auth/repo");
const { createAuthService } = require("../auth/service");
const { createAuthHttp } = require("../auth/http");
const { checkPasswordPolicy } = require("../auth/password");
const P = require("../auth/policies");

const PW = "correct-horse-battery";

function setup(envOverrides = {}, clock = { t: Date.now() }) {
  const config = loadAuthConfig({ JWT_SECRET: "s".repeat(32), BCRYPT_COST: "4", AUTH_ENFORCED: "true", AUTH_RATE_MAX: "1000", ...envOverrides });
  const repo = createMemoryAuthRepo();
  const service = createAuthService({ repo, config, now: () => clock.t });
  const http = createAuthHttp({ service, config });
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", http.router);
  app.get("/api/recruiter-only", http.gate(P.ROLES.RECRUITER, P.ROLES.ADMIN), (req, res) => res.json({ ok: true, user: req.user?.id }));
  return { config, repo, service, app, clock };
}

const cookieOf = (res) => (res.headers["set-cookie"] || []).find((c) => c.startsWith("rt="));
const tokenFromCookie = (c) => c.split(";")[0].slice(3);

describe("password policy", () => {
  test.each([
    ["short", "abc", /at least 10/],
    ["common", "password123", /at least 10|common/],
    ["too long in bytes", "é".repeat(40), /at most 72/],
    ["contains email name", "johnsmith-2024!", /email name/],
    ["repeated char", "aaaaaaaaaaaa", /too simple/],
  ])("rejects %s", (_n, pw, re) => {
    expect(checkPasswordPolicy(pw, "johnsmith@example.com")).toMatch(re);
  });
  test("accepts a passphrase", () => expect(checkPasswordPolicy(PW, "a@b.co")).toBeNull());
});

describe("config", () => {
  test("production requires JWT_SECRET", () => {
    expect(() => loadAuthConfig({ NODE_ENV: "production" })).toThrow(/JWT_SECRET/);
  });
  test("enforcement is opt-in", () => {
    expect(loadAuthConfig({}).enforced).toBe(false);
    expect(loadAuthConfig({ AUTH_ENFORCED: "true" }).enforced).toBe(true);
  });
});

describe("register / login", () => {
  test("register creates a candidate, hashes the password, sets an HttpOnly refresh cookie", async () => {
    const { app, repo } = setup();
    const res = await request(app).post("/api/auth/register").send({ email: "Ann@Example.com ", password: PW, name: "Ann" });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: "ann@example.com", role: "candidate" });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
    const stored = [...repo.users.values()][0];
    expect(stored.passwordHash).not.toContain(PW);
    expect(cookieOf(res)).toMatch(/HttpOnly/i);
    expect(cookieOf(res)).toMatch(/Path=\/api\/auth/);
    expect(cookieOf(res)).toMatch(/SameSite=Lax/i);
  });

  test("a client cannot choose its own role on signup", async () => {
    const { app, repo } = setup();
    await request(app).post("/api/auth/register").send({ email: "a@example.com", password: PW, role: "admin" });
    expect([...repo.users.values()][0].role).toBe("candidate");
  });

  test("duplicate email, bad email and weak password are rejected", async () => {
    const { app } = setup();
    await request(app).post("/api/auth/register").send({ email: "a@example.com", password: PW });
    expect((await request(app).post("/api/auth/register").send({ email: "A@example.com", password: PW })).body.code).toBe("EMAIL_TAKEN");
    expect((await request(app).post("/api/auth/register").send({ email: "nope", password: PW })).body.code).toBe("INVALID_EMAIL");
    expect((await request(app).post("/api/auth/register").send({ email: "b@example.com", password: "short" })).body.code).toBe("WEAK_PASSWORD");
  });

  test("login: same error for unknown email and wrong password; non-string input is safe", async () => {
    const { app } = setup();
    await request(app).post("/api/auth/register").send({ email: "a@example.com", password: PW });
    const wrong = await request(app).post("/api/auth/login").send({ email: "a@example.com", password: "wrong-password-x" });
    const unknown = await request(app).post("/api/auth/login").send({ email: "zz@example.com", password: PW });
    expect([wrong.status, unknown.status]).toEqual([401, 401]);
    expect(wrong.body).toEqual(unknown.body);
    const inj = await request(app).post("/api/auth/login").send({ email: { $ne: "" }, password: { $ne: "" } });
    expect(inj.status).toBe(401);
    expect((await request(app).post("/api/auth/login").send()).status).toBe(401);
  });

  test("lockout after repeated failures, then recovers after the lock expires", async () => {
    const clock = { t: Date.now() };
    const { app } = setup({ AUTH_MAX_FAILED_LOGINS: "3", AUTH_LOCKOUT_MS: "60000" }, clock);
    await request(app).post("/api/auth/register").send({ email: "a@example.com", password: PW });
    for (let i = 0; i < 3; i++) await request(app).post("/api/auth/login").send({ email: "a@example.com", password: "bad-password-1" });
    const locked = await request(app).post("/api/auth/login").send({ email: "a@example.com", password: PW });
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe("ACCOUNT_LOCKED");
    clock.t += 61000;
    expect((await request(app).post("/api/auth/login").send({ email: "a@example.com", password: PW })).status).toBe(200);
  });

  test("disabled accounts cannot log in", async () => {
    const { app, repo } = setup();
    await request(app).post("/api/auth/register").send({ email: "a@example.com", password: PW });
    [...repo.users.values()][0].disabled = true;
    expect((await request(app).post("/api/auth/login").send({ email: "a@example.com", password: PW })).status).toBe(401);
  });
});

describe("access tokens and authorization", () => {
  async function user(app, email, role, service) {
    if (role === "candidate") return (await request(app).post("/api/auth/register").send({ email, password: PW })).body.accessToken;
    await service.createUser({ email, password: PW, role });
    return (await request(app).post("/api/auth/login").send({ email, password: PW })).body.accessToken;
  }

  test("/me requires a valid bearer token", async () => {
    const { app } = setup();
    expect((await request(app).get("/api/auth/me")).status).toBe(401);
    expect((await request(app).get("/api/auth/me").set("Authorization", "Bearer garbage")).status).toBe(401);
    const tok = await user(app, "a@example.com", "candidate");
    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${tok}`);
    expect(me.body.user).toMatchObject({ email: "a@example.com", role: "candidate" });
  });

  test("role gates: candidate 403, recruiter 200, anonymous 401", async () => {
    const { app, service } = setup();
    const cand = await user(app, "c@example.com", "candidate", service);
    const rec = await user(app, "r@example.com", "recruiter", service);
    expect((await request(app).get("/api/recruiter-only")).status).toBe(401);
    expect((await request(app).get("/api/recruiter-only").set("Authorization", `Bearer ${cand}`)).status).toBe(403);
    expect((await request(app).get("/api/recruiter-only").set("Authorization", `Bearer ${rec}`)).status).toBe(200);
  });

  test("gate is a pass-through when enforcement is off", async () => {
    const { app } = setup({ AUTH_ENFORCED: "false" });
    expect((await request(app).get("/api/recruiter-only")).status).toBe(200);
  });

  test("tampered, wrong-secret, alg=none, expired and stale-version tokens are rejected", async () => {
    const clock = { t: Date.now() };
    const { app, service, repo, config } = setup({ ACCESS_TOKEN_TTL_SEC: "60" });
    const tok = await user(app, "a@example.com", "candidate");
    const id = [...repo.users.values()][0].id;
    const get = (t) => request(app).get("/api/auth/me").set("Authorization", `Bearer ${t}`);

    expect((await get(tok.slice(0, -2) + "xx")).status).toBe(401);
    expect((await get(jwt.sign({ role: "admin", ver: 0 }, "other-secret", { subject: id }))).status).toBe(401);
    const none = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url") + "." + Buffer.from(JSON.stringify({ sub: id, role: "admin", ver: 0 })).toString("base64url") + ".";
    expect((await get(none)).status).toBe(401);
    expect((await get(jwt.sign({ role: "candidate", ver: 0 }, config.jwtSecret, { subject: id, expiresIn: -10 }))).status).toBe(401);

    // role claim in the token is not trusted for identity: DB role is returned
    const forged = jwt.sign({ role: "admin", ver: 0 }, config.jwtSecret, { subject: id });
    expect((await get(forged)).body.user.role).toBe("candidate");

    await service.revokeAll(id);
    expect((await get(tok)).status).toBe(401);
    void clock;
  });

  test("only admins can create recruiter accounts", async () => {
    const { app, service } = setup();
    const cand = await user(app, "c@example.com", "candidate", service);
    const admin = await user(app, "ad@example.com", "admin", service);
    const body = { email: "newrec@example.com", password: PW, role: "recruiter" };
    expect((await request(app).post("/api/auth/users").send(body)).status).toBe(401);
    expect((await request(app).post("/api/auth/users").set("Authorization", `Bearer ${cand}`).send(body)).status).toBe(403);
    const ok = await request(app).post("/api/auth/users").set("Authorization", `Bearer ${admin}`).send(body);
    expect(ok.status).toBe(201);
    expect(ok.body.user.role).toBe("recruiter");
  });
});

describe("refresh rotation", () => {
  const login = async (app) => {
    const res = await request(app).post("/api/auth/register").send({ email: "a@example.com", password: PW });
    return tokenFromCookie(cookieOf(res));
  };
  const refresh = (app, t) => request(app).post("/api/auth/refresh").set("Cookie", `rt=${t}`);

  test("refresh issues a new token pair and the old refresh token stops working", async () => {
    const { app } = setup();
    const t1 = await login(app);
    const r = await refresh(app, t1);
    expect(r.status).toBe(200);
    expect(r.body.accessToken).toBeTruthy();
    const t2 = tokenFromCookie(cookieOf(r));
    expect(t2).not.toBe(t1);
    expect((await refresh(app, t2)).status).toBe(200);
  });

  test("reusing a rotated token revokes the whole family", async () => {
    const { app } = setup();
    const t1 = await login(app);
    const t2 = tokenFromCookie(cookieOf(await refresh(app, t1)));
    const reuse = await refresh(app, t1);
    expect(reuse.status).toBe(401);
    expect((await refresh(app, t2)).status).toBe(401); // the legitimate successor is revoked too
  });

  test("concurrent use of one refresh token yields at most one success", async () => {
    const { app } = setup();
    const t1 = await login(app);
    const results = await Promise.all([refresh(app, t1), refresh(app, t1), refresh(app, t1)]);
    expect(results.filter((r) => r.status === 200).length).toBeLessThanOrEqual(1);
  });

  test("missing, unknown and expired refresh tokens are rejected", async () => {
    const clock = { t: Date.now() };
    const { app } = setup({ REFRESH_TOKEN_TTL_SEC: "60" }, clock);
    expect((await request(app).post("/api/auth/refresh")).status).toBe(401);
    expect((await refresh(app, "unknown")).status).toBe(401);
    const t1 = await login(app);
    clock.t += 61000;
    expect((await refresh(app, t1)).status).toBe(401);
  });

  test("logout revokes the session and clears the cookie", async () => {
    const { app } = setup();
    const t1 = await login(app);
    const out = await request(app).post("/api/auth/logout").set("Cookie", `rt=${t1}`);
    expect(out.status).toBe(200);
    expect(cookieOf(out)).toMatch(/rt=;/);
    expect((await refresh(app, t1)).status).toBe(401);
  });

  test("refresh from a disallowed browser origin is refused", async () => {
    const { app } = setup({ CORS_ORIGIN: "https://app.example.com" });
    const t1 = await login(app);
    expect((await refresh(app, t1).set("Origin", "https://evil.example.com")).status).toBe(403);
    expect((await refresh(app, t1).set("Origin", "https://app.example.com")).status).toBe(200);
  });
});

describe("rate limiting", () => {
  test("auth routes are throttled", async () => {
    const { app } = setup({ AUTH_RATE_MAX: "3" });
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await request(app).post("/api/auth/login").send({ email: "x@example.com", password: PW })).status);
    expect(codes).toContain(429);
  });
});

describe("policies", () => {
  const rec = { id: "r1", role: "recruiter" };
  const other = { id: "r2", role: "recruiter" };
  const cand = { id: "c1", role: "candidate" };
  const admin = { id: "a1", role: "admin" };
  const interview = { ownerId: "r1", candidateId: "c1" };

  test("management is owner-or-admin", () => {
    expect(P.canManageInterview(rec, interview)).toBe(true);
    expect(P.canManageInterview(other, interview)).toBe(false);
    expect(P.canManageInterview(admin, interview)).toBe(true);
    expect(P.canManageInterview(cand, interview)).toBe(false);
    expect(P.canManageInterview(rec, null)).toBe(false);
  });
  test("viewing and taking", () => {
    expect(P.canViewInterview(cand, interview)).toBe(true);
    expect(P.canViewInterview({ id: "c2", role: "candidate" }, interview)).toBe(false);
    expect(P.canTakeInterview(cand, interview)).toBe(true);
    expect(P.canTakeInterview(rec, interview)).toBe(false);
    expect(P.canTakeInterview({ id: "c1", role: "candidate" }, { ownerId: "r1" })).toBe(false); // unassigned
  });
  test("missing ids never match", () => {
    expect(P.canManageInterview({ id: undefined, role: "recruiter" }, { ownerId: undefined })).toBe(false);
  });
});
