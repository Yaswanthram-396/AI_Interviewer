const { TEMPLATE_DEFINITIONS } = require("../interviews/templates/definitions");
const banks = require("../interviews/templates/banks");
const { validateBank, minBankSize } = require("../interviews/templates/bank");
const { validateTemplateConfig, normalizeTemplateInput, timeBudget, difficultyDistribution } = require("../interviews/templates/validate");
const { normalizeDefinition, seedTemplates } = require("../interviews/templates/seeder");
const { pickQuestionType, plannedDifficulty, rankCandidates } = require("../interviews/templates/selection");
const { computeProgress } = require("../interviews/progress");
const { validateTemplateQuestion } = require("../realtime/interview/analysis");
const { fakeTemplateModels } = require("./templateFakes");

const bySlug = (slug) => TEMPLATE_DEFINITIONS.find((t) => t.slug === slug);

describe("the four predefined templates", () => {
  const EXPECTED = {
    "javascript-developer": { title: "JavaScript Developer Interview", minutes: 30, questions: 15, topics: ["JavaScript Fundamentals", "Variables, Scope and Hoisting", "Functions and Closures", "Objects and Prototypes", "Arrays and Important Methods", "ES6+ Features", "Event Loop and Asynchronous JavaScript", "Promises and Async/Await", "DOM and Browser Concepts", "Output-based and Problem-solving Questions"] },
    "frontend-developer": { title: "Frontend Developer — JavaScript, React and Scenarios", minutes: 45, questions: 18, topics: ["JavaScript Fundamentals", "Advanced JavaScript", "HTML5 and CSS3 Fundamentals", "React Fundamentals", "Components, Props and State", "Hooks and Lifecycle", "State Management", "React Rendering and Performance Optimization", "API Integration and Error Handling", "Routing and Application Architecture", "Frontend Security", "Scenario-based Problem Solving"] },
    "mern-stack-developer": { title: "MERN Stack Full-Stack Developer Interview", minutes: 60, questions: 24, topics: ["JavaScript Fundamentals", "React.js", "React Hooks and State Management", "Node.js Architecture", "Express.js and Middleware", "REST API Design", "Authentication and Authorization", "MongoDB and Mongoose", "Database Modeling and Aggregation", "SQL vs NoSQL Databases", "Backend Error Handling and Security", "API Integration", "WebSockets and Real-time Communication", "Full-stack Architecture and Scenario-based Questions"] },
    "database-sql-nosql": { title: "Database Engineering — SQL and NoSQL Interview", minutes: 45, questions: 18, topics: ["DBMS Fundamentals", "Relational Database Concepts", "SQL Joins", "Subqueries and CTEs", "Window Functions", "Aggregation and Grouping", "Database Normalization", "Indexing and Query Optimization", "ACID Properties and Transactions", "SQL vs NoSQL", "MongoDB Architecture and Aggregation", "Data Modeling", "Database Scaling and Replication", "Real-world Database Design Scenarios"] },
  };

  test("there are exactly the four requested templates", () => {
    expect(TEMPLATE_DEFINITIONS.map((t) => t.slug).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  test.each(Object.entries(EXPECTED))("%s has the requested title, duration, question count and topics in order", (slug, expected) => {
    const t = bySlug(slug);
    const normalized = normalizeDefinition(t);
    expect(t.title).toBe(expected.title);
    expect(t.durationMinutes).toBe(expected.minutes);
    expect(normalized.totalQuestions).toBe(expected.questions);
    expect(t.followUpLimit).toBe(2);
    expect(t.topics.map((x) => x.name)).toEqual(expected.topics);
  });

  test.each(TEMPLATE_DEFINITIONS.map((t) => [t.slug, t]))("%s: topic allocations add up, weights total 100 and time fits the duration", (slug, t) => {
    const normalized = normalizeDefinition(t);
    expect(validateTemplateConfig(normalized)).toEqual([]);
    const budget = timeBudget(normalized);
    expect(budget.allocatedMinutes).toBeLessThanOrEqual(t.durationMinutes);
    expect(budget.slackMinutes).toBeGreaterThanOrEqual(0); // opening + closing + transitions fit too
    expect(t.topics.reduce((sum, x) => sum + x.questionCount, 0)).toBe(normalized.totalQuestions);
    expect(t.topics.reduce((sum, x) => sum + x.weightage, 0)).toBe(100);
    const dist = difficultyDistribution(normalized.topics);
    expect(dist.BEGINNER + dist.INTERMEDIATE + dist.ADVANCED).toBe(normalized.totalQuestions);
  });

  test("the JavaScript template distributes its 15 questions as designed", () => {
    expect(bySlug("javascript-developer").topics.map((t) => t.questionCount)).toEqual([2, 1, 2, 2, 1, 1, 2, 2, 1, 1]);
  });

  test.each(TEMPLATE_DEFINITIONS.map((t) => [t.slug, t]))("%s: the question bank is valid and large enough to vary between candidates", (slug, t) => {
    expect(validateBank(t, banks[slug])).toEqual([]);
    for (const topic of t.topics) {
      expect(banks[slug][topic.slug].length).toBeGreaterThanOrEqual(minBankSize(topic));
      expect(banks[slug][topic.slug].length).toBeGreaterThanOrEqual(topic.questionCount * 3);
    }
  });

  test("the frontend scenarios and MERN scenarios cover every requested situation", () => {
    const text = (slug, topic) => banks[slug][topic].map((q) => q.text.toLowerCase()).join(" | ");
    const fe = text("frontend-developer", "scenario-problem-solving");
    for (const word of ["re-render", "apis", "debounc", "authentication", "fail", "reusable", "global state", "rows", "websocket", "production"]) expect(fe).toContain(word);
    const mern = text("mern-stack-developer", "fullstack-scenarios");
    for (const word of ["authentication", "concurrent", "schema", "slow", "pagination", "halfway", "upload", "real-time", "integration"]) expect(mern).toContain(word);
  });

  test("every bank question carries an answer key and evaluation criteria", () => {
    for (const [slug, bank] of Object.entries(banks)) {
      for (const list of Object.values(bank)) {
        for (const q of list) {
          expect(q.concepts.length).toBeGreaterThanOrEqual(2);
          expect(q.criteria.length).toBeGreaterThanOrEqual(2);
          expect(q.points.length).toBeGreaterThanOrEqual(2);
        }
      }
      expect(slug).toBeTruthy();
    }
  });
});

describe("template validation rejects inconsistent configurations", () => {
  const base = () => normalizeDefinition(bySlug("javascript-developer"));

  test("question counts must add up to totalQuestions", () => {
    expect(validateTemplateConfig({ ...base(), totalQuestions: 14 })[0]).toMatch(/add up to 15/);
  });
  test("weightage must total 100", () => {
    const config = base();
    config.topics[0] = { ...config.topics[0], weightage: 11 };
    expect(validateTemplateConfig(config).join()).toMatch(/weightage must total 100/);
  });
  test("topic time may not exceed the duration", () => {
    const config = base();
    config.topics = config.topics.map((t) => ({ ...t, allocatedMinutes: t.allocatedMinutes * 2 }));
    expect(validateTemplateConfig(config).join()).toMatch(/exceeds the 30 minute duration/);
  });
  test("opening, closing and transitions count against the duration too", () => {
    const config = base();
    config.durationMinutes = 27; // topics alone (26.25) fit, with the fixed minutes they do not
    expect(validateTemplateConfig(config).join()).toMatch(/plus opening, closing and transitions/);
  });
  test("API input is normalized, bounded and validated", () => {
    const def = bySlug("database-sql-nosql");
    const good = normalizeTemplateInput({ ...def, topics: def.topics.map((t) => ({ ...t, extra: "dropped" })), slug: undefined });
    expect(good.ok).toBe(true);
    expect(good.value.totalQuestions).toBe(18);
    expect(good.value.topics[0].extra).toBeUndefined();
    expect(normalizeTemplateInput({ ...def, durationMinutes: 1 }).ok).toBe(false);
    expect(normalizeTemplateInput({ ...def, topics: [] }).ok).toBe(false);
    expect(normalizeTemplateInput({ ...def, topics: [{ ...def.topics[0], questionTypes: ["TRIVIA"] }] }).ok).toBe(false);
    expect(normalizeTemplateInput("nope").ok).toBe(false);
  });
});

describe("question planning helpers", () => {
  test("question types rotate through the topic's configured types", () => {
    expect([0, 1, 2, 3].map((i) => pickQuestionType(["CONCEPTUAL", "PRACTICAL"], i))).toEqual(["CONCEPTUAL", "PRACTICAL", "CONCEPTUAL", "PRACTICAL"]);
  });

  test("difficulty stays at the configured level unless performance moved it, and then by at most one step", () => {
    expect(plannedDifficulty("INTERMEDIATE", { current: "INTERMEDIATE", base: "INTERMEDIATE" })).toBe("INTERMEDIATE");
    expect(plannedDifficulty("INTERMEDIATE", { current: "ADVANCED", base: "BEGINNER" })).toBe("ADVANCED"); // two steps up is capped at one
    expect(plannedDifficulty("ADVANCED", { current: "ADVANCED", base: "BEGINNER" })).toBe("ADVANCED");
    expect(plannedDifficulty("BEGINNER", { current: "BEGINNER", base: "ADVANCED" })).toBe("BEGINNER");
    expect(plannedDifficulty("INTERMEDIATE", { current: "ADVANCED", base: "INTERMEDIATE", adaptive: false })).toBe("INTERMEDIATE");
  });

  test("ranking prefers the planned type and difficulty and varies between calls", () => {
    const pool = [
      { id: "a", questionType: "CONCEPTUAL", difficulty: "INTERMEDIATE" },
      { id: "b", questionType: "CONCEPTUAL", difficulty: "INTERMEDIATE" },
      { id: "c", questionType: "PRACTICAL", difficulty: "INTERMEDIATE" },
      { id: "d", questionType: "CONCEPTUAL", difficulty: "BEGINNER" },
    ];
    const ranked = rankCandidates(pool, { difficulty: "INTERMEDIATE", questionType: "CONCEPTUAL", limit: 3, random: () => 0.1 });
    expect(ranked.map((q) => q.id).slice(0, 2).sort()).toEqual(["a", "b"]);
    expect(ranked[2].id).toBe("d");
    const firsts = new Set(Array.from({ length: 30 }, (_, i) => rankCandidates(pool, { difficulty: "INTERMEDIATE", questionType: "CONCEPTUAL", limit: 1, random: () => (i % 10) / 10 })[0].id));
    expect(firsts.size).toBe(2);
  });
});

describe("generated question validation against the plan", () => {
  const plan = { topic: { name: "Event Loop", questionTypes: ["CONCEPTUAL", "OUTPUT_BASED"], evaluationCriteria: ["topic criterion"] }, questionType: "CONCEPTUAL", difficulty: "ADVANCED", references: [{ id: "r1", evaluationCriteria: ["ref criterion"] }] };
  const raw = (over = {}) => ({ question: "Explain the event loop.", topic: "Event Loop", difficulty: "INTERMEDIATE", questionType: "CONCEPTUAL", evaluationCriteria: ["call stack"], isFollowUp: false, parentQuestionId: null, ...over });

  test("accepts a question for the planned topic", () => {
    const result = validateTemplateQuestion(raw({ referenceId: "r1" }), plan);
    expect(result.ok).toBe(true);
    expect(result.value.reference.id).toBe("r1");
    expect(result.value.topic).toBe("Event Loop");
  });
  test("rejects another topic", () => {
    expect(validateTemplateQuestion(raw({ topic: "MongoDB" }), plan).ok).toBe(false);
  });
  test("rejects a follow-up where a main question is required", () => {
    expect(validateTemplateQuestion(raw({ isFollowUp: true }), plan).ok).toBe(false);
    expect(validateTemplateQuestion(raw({ parentQuestionId: "q3" }), plan).ok).toBe(false);
  });
  test("a type outside the topic's types is corrected to the planned type; an unknown reference is dropped", () => {
    const result = validateTemplateQuestion(raw({ questionType: "CODING", referenceId: "zzz" }), plan);
    expect(result.value.questionType).toBe("CONCEPTUAL");
    expect(result.value.typeCorrected).toBe(true);
    expect(result.value.reference).toBeNull();
  });
  test("falls back to the topic's criteria when the model gives none", () => {
    expect(validateTemplateQuestion(raw({ evaluationCriteria: [] }), plan).value.evaluationCriteria).toEqual(["topic criterion"]);
  });
});

describe("seeder", () => {
  const run = (models, definitions = TEMPLATE_DEFINITIONS) => seedTemplates({ models, definitions, banks });
  const totalQuestions = Object.values(banks).reduce((sum, bank) => sum + Object.values(bank).reduce((s, list) => s + list.length, 0), 0);

  test("seeds all four templates with topics and questions", async () => {
    const models = fakeTemplateModels();
    const results = await run(models);
    expect(results.map((r) => r.action)).toEqual(["created", "created", "created", "created"]);
    expect(models.InterviewTemplate.docs).toHaveLength(4);
    expect(models.InterviewTopic.docs).toHaveLength(TEMPLATE_DEFINITIONS.reduce((sum, t) => sum + t.topics.length, 0));
    expect(models.InterviewQuestionBank.docs).toHaveLength(totalQuestions);
    for (const template of models.InterviewTemplate.docs) {
      expect(template.topics).toHaveLength(bySlug(template.slug).topics.length);
      expect(template.version).toBe(1);
      expect(template.status).toBe("active");
    }
  });

  test("running it again changes nothing and creates no duplicates", async () => {
    const models = fakeTemplateModels();
    await run(models);
    const before = JSON.stringify(models.InterviewTemplate.docs);
    const results = await run(models);
    expect(results.map((r) => r.action)).toEqual(["unchanged", "unchanged", "unchanged", "unchanged"]);
    expect(JSON.stringify(models.InterviewTemplate.docs)).toBe(before);
    expect(models.InterviewQuestionBank.docs).toHaveLength(totalQuestions);
    expect(models.InterviewTopic.docs).toHaveLength(TEMPLATE_DEFINITIONS.reduce((sum, t) => sum + t.topics.length, 0));
  });

  test("a changed definition updates the template, bumps its version and keeps topics unique", async () => {
    const models = fakeTemplateModels();
    await run(models);
    const js = bySlug("javascript-developer");
    const moved = { ...js, durationMinutes: 35, topics: [js.topics[1], js.topics[0], ...js.topics.slice(2)] }; // re-ordered topics
    const results = await run(models, [moved]);
    expect(results[0]).toMatchObject({ action: "updated", version: 2 });
    const template = models.InterviewTemplate.docs.find((t) => t.slug === "javascript-developer");
    expect(template.durationMinutes).toBe(35);
    const topics = models.InterviewTopic.docs.filter((t) => t.interviewTemplateId === template._id).sort((a, b) => a.sequence - b.sequence);
    expect(topics.map((t) => t.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(topics[0].slug).toBe(js.topics[1].slug);
    expect(template.topics.map(String)).toEqual(topics.map((t) => String(t._id)));
  });

  test("a topic removed from a definition is retired along with its questions", async () => {
    const models = fakeTemplateModels();
    await run(models);
    const js = bySlug("javascript-developer");
    const smaller = { ...js, topics: js.topics.slice(0, 9).map((t, i) => (i === 0 ? { ...t, weightage: t.weightage + 12 } : t)) };
    const { "output-and-problem-solving": _dropped, ...smallerBank } = banks["javascript-developer"];
    await seedTemplates({ models, definitions: [smaller], banks: { "javascript-developer": smallerBank } });
    const retired = models.InterviewQuestionBank.docs.filter((q) => !q.isActive);
    expect(retired).toHaveLength(banks["javascript-developer"]["output-and-problem-solving"].length);
    const template = models.InterviewTemplate.docs.find((t) => t.slug === "javascript-developer");
    expect(template.topics).toHaveLength(9);
    expect(models.InterviewTopic.docs.filter((t) => t.interviewTemplateId === template._id)).toHaveLength(9);
  });

  test("a custom template that uses a seeded slug is never touched", async () => {
    const models = fakeTemplateModels();
    await models.InterviewTemplate.create({ slug: "javascript-developer", title: "My own JS interview", seeded: false, version: 3, topics: [] });
    const results = await run(models);
    expect(results[0].action).toBe("skipped");
    expect(models.InterviewTemplate.docs.find((t) => t.slug === "javascript-developer")).toMatchObject({ title: "My own JS interview", version: 3 });
    expect(models.InterviewTopic.docs.every((t) => String(t.interviewTemplateId) !== String(models.InterviewTemplate.docs[0]._id))).toBe(true);
  });

  test("a question an admin deactivated stays deactivated after re-seeding", async () => {
    const models = fakeTemplateModels();
    await run(models);
    const question = models.InterviewQuestionBank.docs[0];
    await models.InterviewQuestionBank.updateOne({ _id: question._id }, { $set: { isActive: false } });
    await run(models);
    expect(models.InterviewQuestionBank.docs.find((q) => q._id === question._id).isActive).toBe(false);
  });

  test("an invalid definition is rejected before anything is written", async () => {
    const models = fakeTemplateModels();
    const broken = { ...bySlug("javascript-developer"), topics: bySlug("javascript-developer").topics.map((t, i) => (i === 0 ? { ...t, weightage: 50 } : t)) };
    await expect(run(models, [broken])).rejects.toThrow(/weightage must total 100/);
    expect(models.InterviewTemplate.docs).toHaveLength(0);
  });
});

describe("progress", () => {
  const d = normalizeDefinition(bySlug("javascript-developer"));
  const details = {
    timeLimit: 30,
    settings: { mainQuestions: 15 },
    template: { templateId: "t1", slug: d.slug, version: 1, title: d.title, totalQuestions: 15, topics: d.topics.map((t) => ({ name: t.name, sequence: t.sequence, questionCount: t.questionCount, allocatedMinutes: t.allocatedMinutes, weightage: t.weightage })) },
  };

  test("is not_started before the engine exists", () => {
    expect(computeProgress({ details, engineState: null }).status).toBe("not_started");
  });

  test("reports counts per topic, the current topic and the backend clock", () => {
    const startedAt = 1_000_000;
    const engineState = {
      startedAt,
      mainCount: 3,
      topicCounts: { "JavaScript Fundamentals": 2, "Variables, Scope and Hoisting": 1 },
      topicFollowUps: { "JavaScript Fundamentals": 1 },
      topicSpentMs: { "JavaScript Fundamentals": 150_000 },
      currentQuestion: { id: "q5", type: "MAIN", topic: "Variables, Scope and Hoisting", text: "What is hoisting?" },
    };
    const progress = computeProgress({ details, engineState, now: startedAt + 8 * 60_000 });
    expect(progress.status).toBe("in_progress");
    expect(progress.mainQuestions).toEqual({ total: 15, asked: 3, remaining: 12 });
    expect(progress.followUpsAsked).toBe(1);
    expect(progress.currentTopic).toEqual({ name: "Variables, Scope and Hoisting", asked: 1, questionCount: 1, remaining: 0 });
    expect(progress.topics[0]).toMatchObject({ asked: 2, remaining: 0, followUpsAsked: 1, spentMinutes: 2.5 });
    expect(progress.time).toMatchObject({ durationMinutes: 30, elapsedMinutes: 8, remainingMinutes: 22 });
  });

  test("a completed interview stops its clock", () => {
    const progress = computeProgress({ details, engineState: { startedAt: 0, completed: true, mainCount: 15, topicCounts: {} }, now: 99 * 60_000, completedAt: new Date(20 * 60_000) });
    expect(progress.status).toBe("completed");
    expect(progress.time.elapsedMinutes).toBe(20);
  });
});
