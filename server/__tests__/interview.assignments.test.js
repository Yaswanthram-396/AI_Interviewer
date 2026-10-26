const { startTestServer, openSession, sleep, INTERVIEW_ID } = require("./helpers");
const { loadRealtimeConfig } = require("../realtime/config");

/** Live sessions and assignments: access by email, draft/archived refusal, and status tracking. */

const users = {
  ana: { id: "u-ana", email: "ana@x.com", name: "Ana Rao", role: "candidate" },
  bo: { id: "u-bo", email: "bo@x.com", name: "Bo", role: "candidate" },
};
const auth = { enforced: true, authenticate: async (token) => users[token] || null };
const accessFor = (over = {}) => ({
  [INTERVIEW_ID]: { ownerId: "rec-1", status: "active", assignments: [{ _id: "a1", email: "ANA@x.com", status: "invited" }], ...over },
});

describe("live access follows the interview's assignments", () => {
  let t;
  afterEach(async () => {
    await t?.rt.close();
    t = null;
  });
  const hello = (token) => openSession(t.url, { accessToken: token });

  test("a candidate assigned by email (any letter case) may start; someone else may not", async () => {
    t = await startTestServer({ auth, access: accessFor() });
    expect((await hello("ana")).ready.type).toBe("session_ready");
    expect((await hello("bo")).ready.code).toBe("INTERVIEW_NOT_FOUND");
  });

  test("a draft or archived interview cannot be started even by an assigned candidate", async () => {
    for (const status of ["draft", "archived"]) {
      t = await startTestServer({ auth, access: accessFor({ status }) });
      expect((await hello("ana")).ready.code).toBe("INTERVIEW_NOT_FOUND");
      await t.rt.close();
    }
    t = null;
  });

  test("a legacy interview with a single candidateId and no status still works", async () => {
    t = await startTestServer({ auth, access: { [INTERVIEW_ID]: { ownerId: "rec-1", candidateId: "u-ana" } } });
    expect((await hello("ana")).ready.type).toBe("session_ready");
  });

  test("starting a session moves the candidate's assignment to in progress and records the session", async () => {
    t = await startTestServer({ auth, access: accessFor() });
    const { ready } = await hello("ana");
    expect(t.store.assignmentUpdates).toHaveLength(1);
    expect(t.store.assignmentUpdates[0]).toMatchObject({
      interviewId: INTERVIEW_ID,
      user: { id: "u-ana", email: "ana@x.com" },
      patch: { status: "in_progress", sessionId: ready.sessionId },
      options: { keepCompleted: true }, // an already completed assignment must never move back
    });
    expect(t.store.sessions.get(ready.sessionId)).toMatchObject({ userEmail: "ana@x.com", userName: "Ana Rao" });
  });
});

describe("finishing an interview completes the assignment", () => {
  let t;
  afterEach(async () => {
    await t?.rt.close();
    t = null;
  });

  const analysis = JSON.stringify({
    evaluation: { answerQuality: "CORRECT", score: 8, strengths: ["clear"], missingConcepts: [], incorrectConcepts: [], reasoningSummary: "Good.", suggestedFollowUpAreas: [] },
    decision: { nextAction: "ASK_FOLLOW_UP", reason: "depth", question: "Example?", topic: "JavaScript", difficulty: "INTERMEDIATE" },
    summary: "ok",
  });
  const question = JSON.stringify({ question: "What is a closure?", topic: "JavaScript", difficulty: "BEGINNER", questionType: "CONCEPTUAL", evaluationCriteria: [] });

  async function runInterview({ endWith, answers = 2 }) {
    t = await startTestServer({
      auth,
      access: accessFor(),
      config: { interview: { ...loadRealtimeConfig({}).interview, engine: "structured" } },
    });
    const replies = [question, analysis];
    t.llm.reply = (n) => replies[n - 1];
    const { c, ready } = await openSession(t.url, { accessToken: "ana" });
    c.send({ type: "start_interview", turnId: "turn-open-0001" });
    await c.waitFor((m) => m.type === "tts_audio");
    c.send({ type: "user_turn", turnId: "turn-ans-0001", text: "I build APIs." });
    await c.waitFor((m) => m.type === "tts_audio" && m.turnId === "turn-ans-0001");
    if (answers > 1) {
      c.send({ type: "user_turn", turnId: "turn-ans-0002", text: "A closure keeps its scope alive." });
      await c.waitFor((m) => m.type === "tts_audio" && m.turnId === "turn-ans-0002");
    }
    c.send(endWith);
    await c.waitType("session_ended");
    await sleep(60);
    return ready.sessionId;
  }

  test("ending with scored answers marks the assignment completed", async () => {
    const sessionId = await runInterview({ endWith: { type: "end_interview" } });
    const done = t.store.assignmentUpdates.find((u) => u.patch.status === "completed");
    expect(done).toMatchObject({ interviewId: INTERVIEW_ID, user: { id: "u-ana", email: "ana@x.com" }, patch: { sessionId } });
    expect(t.store.evaluations.get(sessionId)).toMatchObject({ evaluationStatus: "COMPLETE", userEmail: "ana@x.com", userName: "Ana Rao" });
  });

  test("ending before any answer was scored leaves the assignment in progress", async () => {
    await runInterview({ endWith: { type: "end_interview" }, answers: 1 }); // only the introduction was answered
    expect(t.store.assignmentUpdates.some((u) => u.patch.status === "completed")).toBe(false);
  });
});

describe("identity is optional when auth is not enforced (the original open behaviour)", () => {
  const open = { enforced: false, authenticate: async (token) => users[token] || null };
  let t;
  afterEach(async () => {
    await t?.rt.close();
    t = null;
  });
  const hello = (token) => openSession(t.url, { accessToken: token });

  test("an anonymous client can still start an interview", async () => {
    t = await startTestServer({ auth: open });
    expect((await hello(undefined)).ready.type).toBe("session_ready");
    expect(t.store.assignmentUpdates).toHaveLength(0);
  });

  test("a signed-in candidate's session is attributed to them, even though access is open", async () => {
    t = await startTestServer({ auth: open });
    const { ready } = await hello("ana");
    expect(t.store.sessions.get(ready.sessionId)).toMatchObject({ userId: "u-ana", userEmail: "ana@x.com" });
    expect(t.store.assignmentUpdates[0]).toMatchObject({ user: { id: "u-ana" }, patch: { status: "in_progress" } });
  });

  test("an invalid token does not lock anyone out when auth is not enforced", async () => {
    t = await startTestServer({ auth: open });
    const { ready } = await hello("garbage");
    expect(ready.type).toBe("session_ready");
    expect(t.store.sessions.get(ready.sessionId).userId).toBeNull();
  });
});

describe("assignment bookkeeping can never block an interview", () => {
  let t;
  afterEach(async () => {
    await t?.rt.close();
    t = null;
  });

  test("if updating the assignment fails (e.g. an interview created before assignments existed), the candidate can still start", async () => {
    t = await startTestServer({ auth, access: accessFor() });
    t.store.markAssignment = async () => {
      throw new Error("The path 'assignments' must exist in the document in order to apply array updates.");
    };
    const { ready } = await openSession(t.url, { accessToken: "ana" });
    expect(ready.type).toBe("session_ready"); // used to be an INTERNAL error
    expect(t.metrics.snapshot().counters["assignment.update_failed"]).toBe(1);
  });
});
