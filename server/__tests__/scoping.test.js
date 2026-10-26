const express = require("express");
const request = require("supertest");
const { loadAuthConfig } = require("../auth/config");
const { createMemoryAuthRepo } = require("../auth/repo");
const { createAuthService } = require("../auth/service");
const { createAuthHttp } = require("../auth/http");
const { createInterviewRoutes } = require("../routes/interview.routes");
const { startTestServer, openSession, INTERVIEW_ID, OTHER_INTERVIEW_ID } = require("./helpers");

const { restApp, oid, PW } = require("./restHelpers");

const create = (app, who, title = "Backend Engineer") =>
  request(app).post("/api/interviews/create-interview").set("Authorization", who.auth).send({ title, interviewDate: "2026-01-01", interviewTime: "10:00" });

describe("REST interview scoping (AUTH_ENFORCED=true)", () => {
  test("recruiters see only their own interviews; admins see all", async () => {
    const { app, make } = await restApp();
    const [a, b, admin] = [await make("a@x.com", "recruiter"), await make("b@x.com", "recruiter"), await make("ad@x.com", "admin")];
    await create(app, a, "A's interview");
    await create(app, b, "B's interview");
    const list = (who) => request(app).get("/api/interviews").set("Authorization", who.auth);
    expect((await list(a)).body.interviews.map((i) => i.title)).toEqual(["A's interview"]);
    expect((await list(b)).body.interviews.map((i) => i.title)).toEqual(["B's interview"]);
    expect((await list(admin)).body.interviews).toHaveLength(2);
  });

  test("created interviews are owned by the creator, not by anything in the body", async () => {
    const { app, make, docs } = await restApp();
    const a = await make("a@x.com", "recruiter");
    await request(app).post("/api/interviews/create-interview").set("Authorization", a.auth).send({ title: "Backend Engineer", interviewDate: "d", interviewTime: "t", ownerId: "someone-else", candidateId: "x" });
    expect(docs[0].ownerId).toBe(a.id);
    expect(docs[0].candidateId).toBeUndefined();
  });

  test("another recruiter gets 404 (not 403) for single-resource access and assignment", async () => {
    const { app, make, docs } = await restApp();
    const a = await make("a@x.com", "recruiter");
    const b = await make("b@x.com", "recruiter");
    await make("c@x.com", "candidate");
    await create(app, a);
    const id = docs[0]._id;
    expect((await request(app).get(`/api/interviews/${id}`).set("Authorization", a.auth)).status).toBe(200);
    expect((await request(app).get(`/api/interviews/${id}`).set("Authorization", b.auth)).status).toBe(404);
    expect((await request(app).post(`/api/interviews/${id}/assign`).set("Authorization", b.auth).send({ candidateEmail: "c@x.com" })).status).toBe(404);
    expect(docs[0].candidateId).toBeUndefined();
  });

  test("assignment gives the candidate (and only that candidate) access", async () => {
    const { app, make, docs } = await restApp();
    const rec = await make("r@x.com", "recruiter");
    const c1 = await make("c1@x.com", "candidate");
    const c2 = await make("c2@x.com", "candidate");
    await create(app, rec);
    const id = docs[0]._id;
    const as = await request(app).post(`/api/interviews/${id}/assign`).set("Authorization", rec.auth).send({ candidateEmail: "C1@x.com" });
    expect(as.status).toBe(200);
    expect((await request(app).get(`/api/interviews/${id}`).set("Authorization", c1.auth)).status).toBe(200);
    expect((await request(app).get(`/api/interviews/${id}`).set("Authorization", c2.auth)).status).toBe(404);
    expect((await request(app).get("/api/interviews").set("Authorization", c1.auth)).body.interviews).toHaveLength(1);
    expect((await request(app).get("/api/interviews").set("Authorization", c2.auth)).body.interviews).toHaveLength(0);
  });

  test("candidates cannot create or assign; assigning to a non-candidate fails", async () => {
    const { app, make, docs } = await restApp();
    const rec = await make("r@x.com", "recruiter");
    const cand = await make("c@x.com", "candidate");
    await make("r2@x.com", "recruiter");
    expect((await create(app, cand)).status).toBe(403);
    await create(app, rec);
    const id = docs[0]._id;
    expect((await request(app).post(`/api/interviews/${id}/assign`).set("Authorization", cand.auth).send({ candidateEmail: "c@x.com" })).status).toBe(403);
    expect((await request(app).post(`/api/interviews/${id}/assign`).set("Authorization", rec.auth).send({ candidateEmail: "r2@x.com" })).status).toBe(404);
  });

  test("anonymous requests and malformed ids are rejected", async () => {
    const { app, make } = await restApp();
    const rec = await make("r@x.com", "recruiter");
    expect((await request(app).get("/api/interviews")).status).toBe(401);
    expect((await request(app).get("/api/interviews/abc").set("Authorization", rec.auth)).status).toBe(404);
    expect((await request(app).get(`/api/interviews/${oid(9)}`).set("Authorization", rec.auth)).status).toBe(404);
  });
});

describe("REST behaviour with enforcement off (legacy rollout)", () => {
  test("anonymous listing still works", async () => {
    const { app, docs } = await restApp({ enforced: false });
    docs.push({ _id: oid(1), title: "Legacy" });
    const res = await request(app).get("/api/interviews");
    expect(res.status).toBe(200);
    expect(res.body.interviews).toHaveLength(1);
  });
});

describe("WebSocket binding (enforced)", () => {
  const users = {
    tokA: { id: "cand-a", role: "candidate" },
    tokB: { id: "cand-b", role: "candidate" },
    tokR: { id: "rec-1", role: "recruiter" },
  };
  const auth = { enforced: true, authenticate: async (t) => users[t] || null };
  const access = {
    [INTERVIEW_ID]: { ownerId: "rec-1", candidateId: "cand-a" },
    [OTHER_INTERVIEW_ID]: { ownerId: "rec-1", candidateId: "cand-b" },
  };
  let t;
  afterEach(async () => {
    await t?.rt.close();
  });
  const hello = (token, extra = {}) => openSession(t.url, { accessToken: token, ...extra });

  test("hello without a token is refused", async () => {
    t = await startTestServer({ auth, access });
    const { ready } = await hello(undefined);
    expect(ready.code).toBe("UNAUTHENTICATED");
  });

  test("invalid token is refused", async () => {
    t = await startTestServer({ auth, access });
    expect((await hello("nope")).ready.code).toBe("UNAUTHENTICATED");
  });

  test("assigned candidate may start; other candidate and recruiter get INTERVIEW_NOT_FOUND", async () => {
    t = await startTestServer({ auth, access });
    expect((await hello("tokA")).ready.type).toBe("session_ready");
    expect((await hello("tokB")).ready.code).toBe("INTERVIEW_NOT_FOUND");
    expect((await hello("tokR")).ready.code).toBe("INTERVIEW_NOT_FOUND");
    expect(t.store.sessions.size).toBe(1);
  });

  test("unassigned or unknown interviews look identical to a forbidden one", async () => {
    t = await startTestServer({ auth, access: { [INTERVIEW_ID]: { ownerId: "rec-1" } } });
    const a = (await hello("tokA")).ready;
    const b = (await hello("tokA", { interviewId: "64b0000000000000000000ff" })).ready;
    expect([a.code, b.code]).toEqual(["INTERVIEW_NOT_FOUND", "INTERVIEW_NOT_FOUND"]);
    expect(a.message).toBe(b.message);
  });

  test("session is bound to the user: the resume token is useless to anyone else", async () => {
    t = await startTestServer({ auth, access: { [INTERVIEW_ID]: { ownerId: "rec-1", candidateId: "cand-a" } } });
    const first = await hello("tokA");
    expect(t.store.sessions.get(first.ready.sessionId).userId).toBe("cand-a");
    first.c.close();
    // another user who somehow got the token (and is assigned) cannot take it over
    users.tokA2 = { id: "cand-a2", role: "candidate" };
    t.store.getInterviewAccess = async () => ({ ownerId: "rec-1", candidateId: "cand-a2" });
    const stolen = await hello("tokA2", { resumeToken: first.ready.resumeToken });
    expect(stolen.ready.code).toBe("INVALID_RESUME_TOKEN");
    delete users.tokA2;
  });

  test("the rightful user can resume; no access token on resume is refused", async () => {
    t = await startTestServer({ auth, access });
    const first = await hello("tokA");
    first.c.close();
    await first.c.closed;
    const noTok = await hello(undefined, { resumeToken: first.ready.resumeToken });
    expect(noTok.ready.code).toBe("UNAUTHENTICATED");
    const again = await hello("tokA", { resumeToken: first.ready.resumeToken });
    expect(again.ready).toMatchObject({ type: "session_ready", resumed: true });
  });

  test("losing the assignment blocks resume", async () => {
    t = await startTestServer({ auth, access });
    const first = await hello("tokA");
    first.c.close();
    await first.c.closed;
    t.store.getInterviewAccess = async () => ({ ownerId: "rec-1", candidateId: "someone-else" });
    expect((await hello("tokA", { resumeToken: first.ready.resumeToken })).ready.code).toBe("INTERVIEW_NOT_FOUND");
  });

  test("not enforced: anonymous hello still works and tokens are bound to null user", async () => {
    t = await startTestServer({});
    const { ready } = await openSession(t.url);
    expect(ready.type).toBe("session_ready");
    expect(t.store.sessions.get(ready.sessionId).userId).toBeNull();
  });
});
