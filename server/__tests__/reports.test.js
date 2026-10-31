const express = require("express");
const request = require("supertest");
const { buildReport } = require("../reports/buildReport");
const { createReportRoutes } = require("../routes/report.routes");
const { buildFinalEvaluation, weightedScore } = require("../realtime/interview/finalEvaluation");
const { restApp } = require("./restHelpers");

const SETTINGS = {
  role: "Full Stack Developer",
  topics: [
    { name: "JavaScript", weight: 30, questions: 2 },
    { name: "React", weight: 60, questions: 1 },
    { name: "MongoDB", weight: 10, questions: 1 },
  ],
};
const ev = (score, over = {}) => ({ status: "EVALUATED", answerQuality: "CORRECT", score, strengths: ["clear explanation"], missingConcepts: [], incorrectConcepts: [], reasoningSummary: `Scored ${score}.`, suggestedFollowUpAreas: [], ...over });
const answer = (turnId, topic, score, over = {}) => ({
  turnId,
  topic,
  status: "EVALUATED",
  skipped: false,
  questionType: "MAIN",
  questionText: `Question about ${topic}?`,
  transcript: `My answer about ${topic}. More detail follows.`,
  difficulty: "INTERMEDIATE",
  createdAt: new Date(2026, 10, 1, 10, Number(turnId.slice(-1))),
  evaluation: ev(score),
  ...over,
});

const ANSWERS = [
  answer("t1", "JavaScript", 9),
  answer("t2", "JavaScript", 8),
  answer("t3", "React", 4, { evaluation: ev(4, { answerQuality: "PARTIALLY_CORRECT", strengths: [], missingConcepts: ["keys", "reconciliation"], suggestedFollowUpAreas: ["list keys"] }) }),
  answer("t4", "Warmup", 0, { questionType: "WARMUP", status: "RECORDED", evaluation: { status: "NOT_APPLICABLE" } }),
  answer("t5", "JavaScript", 0, { status: "CLARIFICATION_REQUESTED" }),
  answer("t6", "JavaScript", 0, { skipped: true, status: "SKIPPED", evaluation: { status: "NOT_APPLICABLE" } }),
];

const evaluationFor = (answers, extra = {}) => ({
  sessionId: "sess_abcdef123456",
  interviewId: "a".repeat(24),
  userId: "u1",
  userName: "Ana Rao",
  userEmail: "ana@x.com",
  evaluationStatus: "COMPLETE",
  createdAt: new Date(2026, 10, 1, 10, 30),
  ...buildFinalEvaluation(answers, SETTINGS),
  ...extra,
});

describe("final evaluation weighting", () => {
  test("weights topic scores by the configured topic weights", () => {
    expect(weightedScore([{ topic: "A", score: 10 }, { topic: "B", score: 0 }], { topics: [{ name: "A", weight: 75 }, { name: "B", weight: 25 }] })).toBe(7.5);
    expect(weightedScore([{ topic: "X", score: 5 }], { topics: [{ name: "A", weight: 100 }] })).toBeNull(); // nothing configured matches: fall back to the plain mean
    expect(weightedScore([{ topic: "A", score: 5 }], null)).toBeNull();
  });

  test("the overall score uses the weights, not a plain mean of answers", () => {
    const plain = buildFinalEvaluation(ANSWERS, null).overallScore;
    const weighted = buildFinalEvaluation(ANSWERS, SETTINGS).overallScore;
    expect(plain).toBe(7); // (9 + 8 + 4) / 3
    expect(weighted).toBe(5.5); // JS 8.5 @30 and React 4 @60 (MongoDB not asked): the weak, heavily weighted topic pulls it down
  });
});

describe("buildReport", () => {
  const report = buildReport({ interview: { title: "MERN Interview", settings: SETTINGS }, session: { created: new Date(2026, 10, 1, 10, 0) }, evaluation: evaluationFor(ANSWERS), answers: ANSWERS });

  test("identifies itself as a backend report and scores out of 100", () => {
    expect(report).toMatchObject({ source: "backend", status: "completed", interviewTitle: "MERN Interview", role: "Full Stack Developer", overall: 55, durationMinutes: 30 });
    expect(report.candidate).toEqual({ name: "Ana Rao", email: "ana@x.com" });
  });

  test("lists only scored questions: no warm-up, skips or clarified attempts", () => {
    expect(report.questions.map((q) => q.id)).toEqual(["t1", "t2", "t3"]);
    expect(report.questions[2]).toMatchObject({ number: 3, topic: "React", score: 4, missing: ["keys", "reconciliation"], betterApproach: null });
  });

  test("scores topics and marks configured topics that were never asked as not covered", () => {
    expect(report.topics).toEqual([
      { topic: "JavaScript", score: 85, weight: 30, questionsAsked: 2 },
      { topic: "React", score: 40, weight: 60, questionsAsked: 1 },
      { topic: "MongoDB", score: null, weight: 10, questionsAsked: 0 },
    ]);
  });

  test("derives strengths with evidence and improvements with actions from the stored evaluations", () => {
    expect(report.strengths).toHaveLength(1);
    expect(report.strengths[0]).toMatchObject({ topic: "JavaScript", evidence: "My answer about JavaScript." });
    expect(report.improvements[0]).toMatchObject({ area: "React", current: 40, priority: "high", actions: ["Review list keys"] });
    expect(report.improvements[0].missing).toMatch(/keys and reconciliation/);
    expect(report.roadmap[0]).toMatchObject({ priority: 1, topic: "React", resources: [], estimatedHours: null });
  });

  test("says what it did not assess instead of inventing it", () => {
    expect(report.communication).toBeNull();
    expect(report.notAssessed).toEqual(expect.arrayContaining(["communication", "betterApproach", "learningResources"]));
    expect(report.finalAssessment.readiness).toBeNull();
  });

  test("handles an interview with no settings", () => {
    const plain = buildReport({ interview: { title: "Legacy" }, session: null, evaluation: evaluationFor(ANSWERS.slice(0, 2), { ...buildFinalEvaluation(ANSWERS.slice(0, 2), null) }), answers: ANSWERS.slice(0, 2) });
    expect(plain.topics).toEqual([{ topic: "JavaScript", score: 85, weight: 0, questionsAsked: 2 }]);
    expect(plain.overall).toBe(85);
  });
});

// ---- endpoints -------------------------------------------------------------------

const cursor = (rows) => ({ sort: () => cursor(rows), limit: () => cursor(rows), lean: async () => rows, then: (res) => res(rows) });
const matchesFilter = (row, filter) => Object.entries(filter).every(([k, v]) => (v && v.$in ? v.$in.includes(row[k]) : String(row[k]) === String(v)));

function reportsApp({ interviews, evaluations, answers, sessions = [] }) {
  const models = {
    Interview: {
      find: (filter) => cursor(interviews.filter((i) => (filter.ownerId ? i.ownerId === filter.ownerId : filter._id?.$in ? filter._id.$in.includes(String(i._id)) : true))),
      findById: (id) => ({ lean: async () => interviews.find((i) => String(i._id) === String(id)) ?? null }),
    },
    InterviewEvaluation: { find: (filter) => cursor(evaluations.filter((e) => matchesFilter(e, filter))), findOne: (filter) => ({ lean: async () => evaluations.find((e) => matchesFilter(e, filter)) ?? null }) },
    InterviewAnswer: { find: (filter) => cursor(answers.filter((a) => matchesFilter(a, filter))) },
    InterviewSession: { findOne: (filter) => ({ lean: async () => sessions.find((s) => matchesFilter(s, filter)) ?? null }) },
  };
  return models;
}

describe("report endpoints", () => {
  async function setup() {
    const ctx = await restApp();
    const owner = await ctx.make("rec@x.com", "recruiter");
    const other = await ctx.make("rec2@x.com", "recruiter");
    const ana = await ctx.make("ana@x.com", "candidate");
    const bo = await ctx.make("bo@x.com", "candidate");
    const interviews = [{ _id: "a".repeat(24), ownerId: owner.id, title: "MERN Interview", settings: SETTINGS }];
    const evaluations = [evaluationFor(ANSWERS, { userId: ana.id })];
    const answers = ANSWERS.map((a) => ({ ...a, sessionId: "sess_abcdef123456" }));
    const app = express();
    app.use("/api/reports", createReportRoutes({ models: reportsApp({ interviews, evaluations, answers }), auth: ctx.authDeps }));
    return { app, owner, other, ana, bo };
  }
  const get = (app, who, path = "") => request(app).get(`/api/reports${path}`).set("Authorization", who.auth);

  test("a candidate lists and opens only their own report", async () => {
    const { app, ana, bo } = await setup();
    const mine = await get(app, ana);
    expect(mine.body.reports).toEqual([expect.objectContaining({ id: "sess_abcdef123456", interviewTitle: "MERN Interview", overall: 55, candidate: { name: "Ana Rao", email: "ana@x.com" } })]);
    expect((await get(app, ana, "/sess_abcdef123456")).body.report).toMatchObject({ overall: 55, source: "backend" });
    expect((await get(app, bo)).body.reports).toEqual([]);
    expect((await get(app, bo, "/sess_abcdef123456")).status).toBe(404); // someone else's report looks like a missing one
  });

  test("the owning recruiter sees reports for their interviews; another recruiter does not", async () => {
    const { app, owner, other } = await setup();
    expect((await get(app, owner)).body.reports).toHaveLength(1);
    expect((await get(app, owner, "/sess_abcdef123456")).status).toBe(200);
    expect((await get(app, other)).body.reports).toEqual([]);
    expect((await get(app, other, "/sess_abcdef123456")).status).toBe(404);
  });

  test("rejects malformed ids and unauthenticated requests", async () => {
    const { app, ana } = await setup();
    expect((await get(app, ana, "/not-a-session")).status).toBe(404);
    expect((await request(app).get("/api/reports")).status).toBe(401);
  });

  test("an interview that produced too little to score has no report", async () => {
    const ctx = await restApp();
    const ana = await ctx.make("ana@x.com", "candidate");
    const evaluations = [evaluationFor([], { userId: ana.id, evaluationStatus: "INSUFFICIENT_DATA" })];
    const app = express();
    app.use("/api/reports", createReportRoutes({ models: reportsApp({ interviews: [], evaluations, answers: [] }), auth: ctx.authDeps }));
    expect((await get(app, ana)).body.reports).toEqual([]);
    expect((await get(app, ana, "/sess_abcdef123456")).status).toBe(404);
  });
});
