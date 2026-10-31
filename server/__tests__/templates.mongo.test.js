/**
 * Runs the template stack against a real MongoDB: models and indexes, the idempotent seeder, the REST API,
 * template-based interview creation and the frozen session configuration.
 * Skipped unless SIRI_TEST_MONGO_URI is set; every run uses a throwaway database that is dropped afterwards.
 */
const mongoose = require("mongoose");
const express = require("express");
const request = require("supertest");

const URI = process.env.SIRI_TEST_MONGO_URI;
const suite = URI ? describe : describe.skip;

suite("interview templates on MongoDB", () => {
  let conn;
  let app;
  let models;
  let store;
  const gate = () => (_req, _res, next) => next();

  beforeAll(async () => {
    conn = await mongoose.createConnection(URI, { dbName: `siri_tpl_test_${Date.now()}` }).asPromise();
    const make = (name, file) => conn.model(name, require(file).schema);
    models = {
      InterviewTemplate: make("InterviewTemplate", "../models/interviewTemplate.model"),
      InterviewTopic: make("InterviewTopic", "../models/interviewTopic.model"),
      InterviewQuestionBank: make("InterviewQuestionBank", "../models/interviewQuestionBank.model"),
    };
    const Interview = make("Interview", "../models/Interview");
    const InterviewSession = make("InterviewSession", "../models/interviewSession.model");
    const InterviewAnswer = make("InterviewAnswer", "../models/interviewAnswer.model");
    const InterviewEvaluation = make("InterviewEvaluation", "../models/interviewEvaluation.model");
    await Promise.all(Object.values({ ...models, Interview, InterviewSession, InterviewAnswer }).map((m) => m.init())); // build the unique indexes

    const { createTemplateRoutes } = require("../routes/template.routes");
    const { createInterviewRoutes } = require("../routes/interview.routes");
    const { createSessionRoutes } = require("../routes/session.routes");
    const { createTemplateService } = require("../interviews/templates/service");
    const { createMongoStore } = require("../realtime/store");
    const auth = { gate, service: {} };
    app = express();
    app.use(express.json());
    app.use("/api/interview-templates", createTemplateRoutes({ models, auth }));
    app.use("/api/interviews", createInterviewRoutes({ Interview, auth, templates: createTemplateService(models) }));
    app.use("/api/interview-sessions", createSessionRoutes({ InterviewSession, Interview, auth }));
    store = createMongoStore({ InterviewSession, Interview, InterviewAnswer, InterviewEvaluation, ...models });
    models.Interview = Interview;
    models.InterviewSession = InterviewSession;
  }, 60_000);

  afterAll(async () => {
    await conn?.dropDatabase();
    await conn?.close();
  });

  const seed = () => {
    const { seedTemplates } = require("../interviews/templates/seeder");
    return seedTemplates({ models, definitions: require("../interviews/templates/definitions").TEMPLATE_DEFINITIONS, banks: require("../interviews/templates/banks") });
  };

  test("seeding creates the four templates, their topics and question banks", async () => {
    const results = await seed();
    expect(results.map((r) => r.action)).toEqual(["created", "created", "created", "created"]);
    expect(await models.InterviewTemplate.countDocuments()).toBe(4);
    const js = await models.InterviewTemplate.findOne({ slug: "javascript-developer" }).lean();
    expect(js).toMatchObject({ title: "JavaScript Developer Interview", durationMinutes: 30, totalQuestions: 15, followUpLimit: 2, status: "active", version: 1 });
    expect(js.topics).toHaveLength(10);
    const topics = await models.InterviewTopic.find({ interviewTemplateId: js._id }).sort({ sequence: 1 }).lean();
    expect(topics.reduce((sum, t) => sum + t.questionCount, 0)).toBe(15);
    expect(topics.reduce((sum, t) => sum + t.allocatedMinutes, 0)).toBeLessThanOrEqual(30);
    expect(await models.InterviewQuestionBank.countDocuments({ interviewTemplateId: js._id, isActive: true })).toBeGreaterThanOrEqual(60);
  });

  test("seeding again is a no-op", async () => {
    const counts = async () => [await models.InterviewTemplate.countDocuments(), await models.InterviewTopic.countDocuments(), await models.InterviewQuestionBank.countDocuments()];
    const before = await counts();
    expect((await seed()).map((r) => r.action)).toEqual(["unchanged", "unchanged", "unchanged", "unchanged"]);
    expect(await counts()).toEqual(before);
  });

  test("the unique indexes reject a duplicate question or topic sequence", async () => {
    const question = await models.InterviewQuestionBank.findOne().lean();
    await expect(models.InterviewQuestionBank.create({ ...question, _id: new mongoose.Types.ObjectId() })).rejects.toThrow(/duplicate key/);
    const topic = await models.InterviewTopic.findOne().lean();
    await expect(models.InterviewTopic.create({ ...topic, _id: new mongoose.Types.ObjectId(), slug: "another-slug" })).rejects.toThrow(/duplicate key/);
  });

  test("GET /interview-templates lists them and GET by slug returns topics with bank sizes", async () => {
    const list = await request(app).get("/api/interview-templates").expect(200);
    expect(list.body.templates.map((t) => t.slug).sort()).toEqual(["database-sql-nosql", "frontend-developer", "javascript-developer", "mern-stack-developer"]);
    const one = await request(app).get("/api/interview-templates/mern-stack-developer").expect(200);
    expect(one.body.template.totalQuestions).toBe(24);
    expect(one.body.template.topics).toHaveLength(14);
    expect(one.body.template.topics.every((t) => t.bankSize >= 6)).toBe(true);
    await request(app).get("/api/interview-templates/nope").expect(404);
    const topics = await request(app).get("/api/interview-templates/frontend-developer/topics").expect(200);
    expect(topics.body.topics).toHaveLength(12);
  });

  test("a topic's questions are paginated and filterable", async () => {
    const t = (await request(app).get("/api/interview-templates/javascript-developer")).body.template;
    const topic = t.topics.find((x) => x.slug === "event-loop-and-async");
    const page = await request(app).get(`/api/interview-templates/javascript-developer/topics/${topic.id}/questions?limit=4`).expect(200);
    expect(page.body.questions).toHaveLength(4);
    expect(page.body.total).toBe(topic.bankSize);
    const output = await request(app).get(`/api/interview-templates/javascript-developer/topics/${topic.id}/questions?type=OUTPUT_BASED`).expect(200);
    expect(output.body.questions.length).toBeGreaterThan(0);
    expect(output.body.questions.every((q) => q.questionType === "OUTPUT_BASED")).toBe(true);
    await request(app).get("/api/interview-templates/javascript-developer/topics/not-an-id/questions").expect(404);
  });

  test("create-interview with a templateId builds an interview from the template", async () => {
    const res = await request(app).post("/api/interviews/create-interview").send({ templateId: "javascript-developer" }).expect(201);
    const { interview } = res.body;
    expect(interview).toMatchObject({ title: "JavaScript Developer Interview", timeLimit: 30, status: "active" });
    expect(interview.settings.mainQuestions).toBe(15);
    expect(interview.settings.maxFollowUps).toBe(2);
    expect(interview.settings.topics).toHaveLength(10);
    expect(interview.settings.topics.reduce((s, t) => s + t.weight, 0)).toBe(100);
    expect(String(interview.templateId)).toBeTruthy();
    await request(app).post("/api/interviews/create-interview").send({ templateId: "missing" }).expect(404);
    // The original payload still works.
    await request(app).post("/api/interviews/create-interview").send({ title: "Legacy interview", description: "d", difficulty: "Beginner" }).expect(201);
    // Settings of a template interview come from the template.
    await request(app).put(`/api/interviews/${interview._id}`).send({ settings: interview.settings }).expect(409);
  });

  test("a session freezes the template: later edits change new sessions only", async () => {
    const created = await request(app).post("/api/interviews/create-interview").send({ templateId: "database-sql-nosql" }).expect(201);
    const interviewId = String(created.body.interview._id);

    const first = await store.getInterview(interviewId);
    expect(first.template.version).toBe(1);
    expect(first.timeLimit).toBe(45);
    expect(first.template.topics).toHaveLength(14);
    await store.createSession({ sessionId: "sess_freeze-test-0001", interviewId, interviewDetails: first, expiresAt: new Date(Date.now() + 3_600_000) });

    const template = (await request(app).get("/api/interview-templates/database-sql-nosql")).body.template;
    const edit = {
      ...template,
      durationMinutes: 50,
      topics: template.topics.map((t, i) => (i === 0 ? { ...t, allocatedMinutes: t.allocatedMinutes + 1 } : t)),
    };
    const put = await request(app).put("/api/interview-templates/database-sql-nosql").send(edit).expect(200);
    expect(put.body.template.version).toBe(2);
    expect(put.body.template.durationMinutes).toBe(50);

    const frozen = (await store.loadSession("sess_freeze-test-0001")).interviewDetails;
    expect(frozen.template.version).toBe(1);
    expect(frozen.timeLimit).toBe(45);
    expect((await models.InterviewSession.findOne({ sessionId: "sess_freeze-test-0001" }).lean()).templateVersion).toBe(1);
    const second = await store.getInterview(interviewId);
    expect(second.template.version).toBe(2);
    expect(second.timeLimit).toBe(50);
  });

  test("invalid template updates are rejected without changing anything", async () => {
    const template = (await request(app).get("/api/interview-templates/javascript-developer")).body.template;
    const bad = { ...template, topics: template.topics.map((t, i) => (i === 0 ? { ...t, weightage: 99 } : t)) };
    const res = await request(app).put("/api/interview-templates/javascript-developer").send(bad).expect(400);
    expect(res.body.message).toMatch(/weightage/);
    expect((await models.InterviewTemplate.findOne({ slug: "javascript-developer" }).lean()).version).toBe(1);
  });

  test("the question bank picks varied, unused reference questions", async () => {
    const template = (await request(app).get("/api/interview-templates/javascript-developer")).body.template;
    const topic = template.topics[0];
    const seen = new Set();
    for (let i = 0; i < 12; i += 1) {
      const picks = await store.pickBankQuestions({ templateId: template.id, topicId: topic.id, difficulty: "BEGINNER", questionType: "CONCEPTUAL", limit: 1 });
      expect(picks[0].text).toBeTruthy();
      expect(picks[0].suggestedAnswerPoints).toBeUndefined();
      seen.add(picks[0].id);
    }
    expect(seen.size).toBeGreaterThan(1);
    const used = [...seen];
    const rest = await store.pickBankQuestions({ templateId: template.id, topicId: topic.id, difficulty: "BEGINNER", questionType: "CONCEPTUAL", excludeIds: used, limit: 20 });
    expect(rest.some((q) => used.includes(q.id))).toBe(false);
  });

  test("session progress comes from persisted state", async () => {
    const interviewId = String((await models.Interview.findOne({ templateId: { $exists: true } }).lean())._id);
    const details = await store.getInterview(interviewId);
    const startedAt = Date.now() - 4 * 60_000;
    await store.createSession({ sessionId: "sess_progress-test-0001", interviewId, interviewDetails: details, expiresAt: new Date(Date.now() + 3_600_000) });
    await store.saveEngineState("sess_progress-test-0001", {
      engineState: { startedAt, mainCount: 2, topicCounts: { [details.template.topics[0].name]: 2 }, topicFollowUps: { [details.template.topics[0].name]: 1 }, currentQuestion: { id: "q4", type: "MAIN", topic: details.template.topics[0].name, text: "Q?" } },
      conversationState: "LISTENING",
    });
    const res = await request(app).get("/api/interview-sessions/sess_progress-test-0001/progress").expect(200);
    expect(res.body.progress.status).toBe("in_progress");
    expect(res.body.progress.mainQuestions.asked).toBe(2);
    expect(res.body.progress.followUpsAsked).toBe(1);
    expect(res.body.progress.time.elapsedMinutes).toBeGreaterThanOrEqual(4);
    expect(res.body.progress.time.remainingMinutes).toBeLessThan(res.body.progress.time.durationMinutes);
    await request(app).get("/api/interview-sessions/sess_missing-000001/progress").expect(404);
  });
});
