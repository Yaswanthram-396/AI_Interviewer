const request = require("supertest");
const { restApp } = require("./restHelpers");
const { normalizeSettings, normalizeAssignees } = require("../interviews/settings");

const settings = (over = {}) => ({
  role: "Full Stack Developer",
  mainQuestions: 3,
  maxFollowUps: 2,
  topics: [
    { name: "JavaScript", weight: 60, questions: 2, difficulty: "intermediate" },
    { name: "React", weight: 40, questions: 1, difficulty: "intermediate" },
  ],
  behavior: { personality: ["professional", "friendly"] },
  ...over,
});

const post = (app, who, body) => request(app).post("/api/interviews/create-interview").set("Authorization", who.auth).send(body);
const put = (app, who, id, body) => request(app).put(`/api/interviews/${id}`).set("Authorization", who.auth).send(body);
const list = (app, who) => request(app).get("/api/interviews").set("Authorization", who.auth);
const addPeople = (app, who, id, people) => request(app).post(`/api/interviews/${id}/assignments`).set("Authorization", who.auth).send({ assignments: people });

async function world() {
  const ctx = await restApp();
  const recruiter = await ctx.make("rec@x.com", "recruiter");
  const otherRecruiter = await ctx.make("rec2@x.com", "recruiter");
  const ana = await ctx.make("ana@x.com", "candidate");
  const bo = await ctx.make("bo@x.com", "candidate");
  return { ...ctx, recruiter, otherRecruiter, ana, bo };
}

describe("settings validation", () => {
  test("normalises and bounds untrusted input", () => {
    const r = normalizeSettings({ ...settings(), role: "x".repeat(500), evil: "drop me", behavior: { personality: ["friendly", "nonsense", "friendly"], allowSkip: "yes" } });
    expect(r.ok).toBe(true);
    expect(r.value.role).toHaveLength(100);
    expect(r.value).not.toHaveProperty("evil");
    expect(r.value.behavior.personality).toEqual(["friendly"]);
    expect(r.value.behavior.allowSkip).toBe(false); // only a real boolean true enables a flag
  });

  test("publishing requires weights that total 100 and question counts that match", () => {
    expect(normalizeSettings(settings(), { publishing: true }).ok).toBe(true);
    expect(normalizeSettings(settings({ topics: [{ name: "A", weight: 90, questions: 3 }] }), { publishing: true }).message).toMatch(/total 100 \(currently 90\)/);
    expect(normalizeSettings(settings({ mainQuestions: 9 }), { publishing: true }).message).toMatch(/add up to 3 questions but mainQuestions is 9/);
    expect(normalizeSettings(settings({ topics: [] }), { publishing: true }).message).toMatch(/at least one topic/);
    expect(normalizeSettings(settings({ topics: [] }), { publishing: false }).ok).toBe(true); // drafts may be incomplete
  });

  test("rejects out-of-range numbers and duplicate topics", () => {
    expect(normalizeSettings(settings({ mainQuestions: 99 })).ok).toBe(false);
    expect(normalizeSettings(settings({ maxFollowUps: -1 })).ok).toBe(false);
    expect(normalizeSettings(settings({ topics: [{ name: "A", weight: 50, questions: 1 }, { name: "a", weight: 50, questions: 1 }] })).message).toMatch(/duplicate/);
  });

  test("assignees are lowercased, de-duplicated and validated", () => {
    expect(normalizeAssignees([{ email: "A@X.io" }, { email: "a@x.io", name: "dup" }]).value).toEqual([{ email: "a@x.io", name: "a", externalId: undefined }]);
    expect(normalizeAssignees([{ email: "nope" }]).ok).toBe(false);
    expect(normalizeAssignees([{ email: "a@x.io" }], [{ email: "A@x.io" }]).value).toEqual([]); // already assigned: no-op
  });
});

describe("interviews API: create, publish, visibility", () => {
  test("creates with settings, a code and assignments, and rejects an unpublishable configuration", async () => {
    const { app, recruiter } = await world();
    const ok = await post(app, recruiter, { title: "MERN Stack Interview", description: "d", timeLimit: 30, settings: settings(), assignments: [{ name: "Ana", email: "ana@x.com" }] });
    expect(ok.status).toBe(201);
    expect(ok.body.interview).toMatchObject({ status: "active", timeLimit: 30, settings: { role: "Full Stack Developer" } });
    expect(ok.body.interview.code).toMatch(/^SIRI-[0-9A-F]{4}$/);
    expect(ok.body.interview.assignments).toHaveLength(1);

    const badWeights = await post(app, recruiter, { title: "MERN Stack Interview", settings: settings({ topics: [{ name: "A", weight: 50, questions: 3 }] }) });
    expect(badWeights.status).toBe(400);
    expect(badWeights.body.message).toMatch(/total 100/);
    expect((await post(app, recruiter, { title: "MERN Stack Interview", assignments: [{ email: "bad" }] })).status).toBe(400);
  });

  test("a draft is invisible to candidates until it is published", async () => {
    const { app, recruiter, ana } = await world();
    const draft = (await post(app, recruiter, { title: "Draft Interview", status: "draft", settings: settings({ topics: [] }), assignments: [{ email: "ana@x.com" }] })).body.interview;
    expect((await list(app, ana)).body.interviews).toEqual([]);
    expect((await request(app).get(`/api/interviews/${draft._id}`).set("Authorization", ana.auth)).status).toBe(404);

    expect((await put(app, recruiter, draft._id, { status: "active" })).status).toBe(400); // incomplete: cannot publish
    expect((await put(app, recruiter, draft._id, { status: "active", settings: settings() })).status).toBe(200);
    expect((await list(app, ana)).body.interviews.map((i) => i.title)).toEqual(["Draft Interview"]);
  });

  test("a candidate sees only their own assignment and none of the owner's internals", async () => {
    const { app, recruiter, ana, bo } = await world();
    await post(app, recruiter, { title: "Shared Interview", settings: settings(), assignments: [{ name: "Ana", email: "ANA@x.com" }, { name: "Bo", email: "bo@x.com" }] });
    for (const [who, email] of [[ana, "ana@x.com"], [bo, "bo@x.com"]]) {
      const [interview] = (await list(app, who)).body.interviews;
      expect(interview.assignments.map((a) => a.email)).toEqual([email]);
      expect(interview).not.toHaveProperty("ownerId");
    }
  });

  test("an unassigned candidate sees nothing and gets 404 (not 403) for a direct request", async () => {
    const { app, recruiter, ana, make } = await world();
    const created = (await post(app, recruiter, { title: "Private Interview", settings: settings(), assignments: [{ email: "ana@x.com" }] })).body.interview;
    const outsider = await make("eve@x.com", "candidate");
    expect((await list(app, outsider)).body.interviews).toEqual([]);
    expect((await request(app).get(`/api/interviews/${created._id}`).set("Authorization", outsider.auth)).status).toBe(404);
    expect((await request(app).get(`/api/interviews/${created._id}`).set("Authorization", ana.auth)).status).toBe(200);
  });

  test("archived interviews disappear for candidates; managers still see them", async () => {
    const { app, recruiter, ana } = await world();
    const created = (await post(app, recruiter, { title: "Old Interview", settings: settings(), assignments: [{ email: "ana@x.com" }] })).body.interview;
    expect((await put(app, recruiter, created._id, { status: "archived" })).status).toBe(200);
    expect((await list(app, ana)).body.interviews).toEqual([]);
    expect((await list(app, recruiter)).body.interviews.map((i) => i.status)).toEqual(["archived"]);
  });

  test("interviews created before `status` existed stay visible to their assigned candidate", async () => {
    const { app, docs, ana } = await world();
    docs.push({ _id: "a".repeat(24), title: "Legacy Interview", candidateId: ana.id, ownerId: "x" }); // no status, no assignments
    expect((await list(app, ana)).body.interviews.map((i) => i.title)).toEqual(["Legacy Interview"]);
  });
});

describe("interviews API: updates and assignments", () => {
  test("only the owning recruiter can edit; candidates cannot", async () => {
    const { app, recruiter, otherRecruiter, ana } = await world();
    const created = (await post(app, recruiter, { title: "Owned Interview", settings: settings(), assignments: [{ email: "ana@x.com" }] })).body.interview;
    expect((await put(app, otherRecruiter, created._id, { title: "Hijacked title" })).status).toBe(404);
    expect((await put(app, ana, created._id, { title: "Hijacked title" })).status).toBe(403);
    expect((await put(app, recruiter, created._id, { title: "Renamed Interview", timeLimit: 45 })).body.interview).toMatchObject({ title: "Renamed Interview", timeLimit: 45 });
  });

  test("rejects invalid edits", async () => {
    const { app, recruiter } = await world();
    const { _id } = (await post(app, recruiter, { title: "Valid Interview", settings: settings() })).body.interview;
    for (const body of [{ title: "x" }, { status: "completed" }, { difficulty: "Impossible" }, { timeLimit: 0 }, {}]) {
      expect((await put(app, recruiter, _id, body)).status).toBe(400);
    }
  });

  test("adding the same person twice is a no-op; removal works only before they start", async () => {
    const { app, recruiter, docs } = await world();
    const { _id } = (await post(app, recruiter, { title: "People Interview", settings: settings() })).body.interview;
    expect((await addPeople(app, recruiter, _id, [{ email: "a@x.io" }, { email: "b@x.io" }])).body.added).toBe(2);
    const again = await addPeople(app, recruiter, _id, [{ email: "A@x.io" }, { email: "c@x.io" }]);
    expect(again.body.added).toBe(1);
    expect(again.body.interview.assignments.map((a) => a.email)).toEqual(["a@x.io", "b@x.io", "c@x.io"]);

    const [first, second] = again.body.interview.assignments;
    const remove = (a) => request(app).delete(`/api/interviews/${_id}/assignments/${a._id}`).set("Authorization", recruiter.auth);
    expect((await remove(first)).status).toBe(200);
    docs.find((d) => d._id === _id).assignments.find((a) => a._id === second._id).status = "in_progress";
    expect((await remove(second)).status).toBe(409);
  });

  test("an archived interview cannot receive new candidates", async () => {
    const { app, recruiter } = await world();
    const { _id } = (await post(app, recruiter, { title: "Closed Interview", settings: settings() })).body.interview;
    await put(app, recruiter, _id, { status: "archived" });
    expect((await addPeople(app, recruiter, _id, [{ email: "a@x.io" }])).status).toBe(400);
  });
});
