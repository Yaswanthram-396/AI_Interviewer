const { InterviewEngine } = require("../realtime/interview/engine");
const { loadRealtimeConfig } = require("../realtime/config");
const { Metrics } = require("../realtime/metrics");
const { createMemoryStore } = require("../realtime/store");
const { buildTemplateSnapshot, settingsFromSnapshot } = require("../interviews/templates/snapshot");
const { TEMPLATE_DEFINITIONS } = require("../interviews/templates/definitions");
const { normalizeDefinition } = require("../interviews/templates/seeder");
const banks = require("../interviews/templates/banks");
const { buildFinalEvaluation } = require("../realtime/interview/finalEvaluation");

const config = { ...loadRealtimeConfig({}).interview, engine: "structured" };
const JS = TEMPLATE_DEFINITIONS.find((t) => t.slug === "javascript-developer");

/** The configuration a session would freeze, built from the real JavaScript definition (ids are fake). */
function buildDetails(mutateTopics = (t) => t) {
  const def = normalizeDefinition(JS);
  const template = { _id: "tpl1", ...def, version: 1 };
  const topics = def.topics.map((t, i) => mutateTopics({ _id: `topic${i + 1}`, ...t, topicName: t.name }));
  const snapshot = buildTemplateSnapshot(template, topics);
  return { title: JS.title, description: JS.description, difficulty: "Intermediate", timeLimit: snapshot.durationMinutes, settings: settingsFromSnapshot(snapshot, { behavior: {} }), template: snapshot };
}

function bankFor(details) {
  const questions = [];
  details.template.topics.forEach((topic) => {
    banks["javascript-developer"][topic.slug].forEach((q, i) => questions.push({ id: `${topic.id}-b${i}`, topicId: topic.id, text: q.text, questionType: q.type, difficulty: q.difficulty, expectedConcepts: q.concepts, evaluationCriteria: q.criteria }));
  });
  return questions;
}

// Distinct wording per call: near-identical texts would (correctly) be treated as repeats.
const distinct = (n) => `term${n}x term${n * 3}y`;

const analysis = (nextAction, question = "") =>
  JSON.stringify({
    evaluation: { answerQuality: "CORRECT", score: 8, strengths: ["clear"], missingConcepts: [], incorrectConcepts: [], reasoningSummary: "ok", suggestedFollowUpAreas: [] },
    decision: { nextAction, reason: "r", question, topic: "ignored", difficulty: "INTERMEDIATE" },
    summary: "Doing fine.",
  });

/**
 * A model that behaves: analysis replies come from `onAnalysis(context)`, and question requests are answered for the
 * topic named in the backend's plan (with unique wording), optionally adapting a reference question.
 */
function fakeLlm({ onAnalysis = () => analysis("ASK_NEXT_QUESTION"), onQuestion } = {}) {
  let n = 0;
  const llm = {
    calls: [],
    async complete({ messages }) {
      const context = JSON.parse(messages[messages.length - 1].content);
      llm.calls.push(context);
      if (context.candidateAnswer !== undefined) return { text: onAnalysis(context), durationMs: 5 };
      n += 1;
      const plan = context.plan;
      const reply = onQuestion
        ? onQuestion(plan, n, context)
        : { question: `Explain ${distinct(n)} in the context of ${plan.topic.name}?`, topic: plan.topic.name, difficulty: plan.difficulty, questionType: plan.questionType, evaluationCriteria: ["accuracy"], isFollowUp: false, parentQuestionId: null, referenceId: plan.referenceQuestions[0]?.id ?? null };
      return { text: JSON.stringify(reply), durationMs: 7 };
    },
  };
  return llm;
}

/** The stored record per turn, as the database would hold it after both writes. */
const merged = (saved) => {
  const byTurn = new Map();
  for (const r of saved) byTurn.set(r.turnId, { ...byTurn.get(r.turnId), ...r, ...(r.status === "PENDING" && byTurn.get(r.turnId) ? { status: byTurn.get(r.turnId).status } : {}) });
  return [...byTurn.values()];
};

function makeRun({ details = buildDetails(), llm = fakeLlm(), snapshot = null, clock = { t: 1_000_000 }, store = null } = {}) {
  const metrics = new Metrics();
  const bankStore = store ?? createMemoryStore({ bankQuestions: bankFor(details) });
  const engine = new InterviewEngine({ details, snapshot, config, llm, metrics, now: () => clock.t, bank: { pick: (q) => bankStore.pickBankQuestions(q) } });
  const saved = [];
  let n = 0;
  const answer = async (text = "My answer", { advanceMs = 20_000 } = {}) => {
    clock.t += advanceMs;
    const out = await engine.handleAnswer({ turnId: `turn-${String(++n).padStart(4, "0")}`, text }, { requestId: "r", recentMessages: [], hooks: { saveAnswer: (r) => saved.push(JSON.parse(JSON.stringify(r))) } });
    out.commit();
    return out;
  };
  const open = () => engine.openingTurn().commit();
  return { engine, llm, metrics, saved, answer, open, clock, details };
}

/** Plays the whole interview and returns the main questions in the order they were asked. */
async function playToEnd(run, { maxTurns = 200 } = {}) {
  const mains = [];
  run.open();
  for (let turn = 0; turn < maxTurns && !run.engine.isCompleted; turn += 1) {
    await run.answer();
    const q = run.engine.state.currentQuestion;
    if (!run.engine.isCompleted && q.type === "MAIN" && mains[mains.length - 1]?.id !== q.id) mains.push({ ...q });
  }
  return mains;
}

describe("backend-controlled progression through a template", () => {
  test("asks exactly the configured number of main questions per topic, topic by topic", async () => {
    const run = makeRun();
    const mains = await playToEnd(run);
    expect(run.engine.isCompleted).toBe(true);
    expect(mains).toHaveLength(15);
    expect(run.engine.state.mainCount).toBe(15);
    const expected = Object.fromEntries(run.details.template.topics.map((t) => [t.name, t.questionCount]));
    expect(run.engine.state.topicCounts).toEqual(expected);
    // Topics appear in template order and a topic is finished before the next starts.
    const order = run.details.template.topics.map((t) => t.name);
    const sequence = mains.map((q) => order.indexOf(q.topic));
    expect(sequence).toEqual([...sequence].sort((a, b) => a - b));
    expect(new Set(mains.map((q) => q.text)).size).toBe(15);
  });

  test("the model cannot add questions: it is never asked for more than the plan, and the interview ends at the configured count", async () => {
    const run = makeRun({ llm: fakeLlm({ onAnalysis: () => analysis("ASK_NEXT_QUESTION", "Another question the model wanted to add") }) });
    const mains = await playToEnd(run);
    expect(mains).toHaveLength(15);
    expect(mains.some((q) => q.text.includes("model wanted"))).toBe(false); // the evaluator's own next question is never used
  });

  test("the model cannot end the interview early", async () => {
    const run = makeRun({ llm: fakeLlm({ onAnalysis: () => analysis("END_INTERVIEW") }) });
    const mains = await playToEnd(run);
    expect(mains).toHaveLength(15);
  });

  test("every question is planned for the topic, type and difficulty the backend chose, and is handed reference questions from the bank", async () => {
    const run = makeRun();
    await playToEnd(run);
    const plans = run.llm.calls.filter((c) => c.plan).map((c) => c.plan);
    expect(plans).toHaveLength(15);
    const types = new Map(run.details.template.topics.map((t) => [t.name, t.questionTypes]));
    for (const plan of plans) {
      expect(types.get(plan.topic.name)).toContain(plan.questionType);
      expect(plan.referenceQuestions.length).toBeGreaterThan(0);
      expect(plan.referenceQuestions.every((r) => r.expectedConcepts.length > 0)).toBe(true);
      expect(JSON.stringify(plan)).not.toContain("suggestedAnswerPoints"); // the answer key is never sent for generation
    }
    // The second question of a two-question topic uses the next type in rotation.
    const fundamentals = plans.filter((p) => p.topic.name === "JavaScript Fundamentals");
    expect(fundamentals.map((p) => p.questionType)).toEqual(["CONCEPTUAL", "PRACTICAL"]);
    expect(fundamentals.map((p) => p.questionNumberInTopic)).toEqual([1, 2]);
  });

  test("main questions record their topic, bank question, criteria and timing", async () => {
    const run = makeRun();
    run.open();
    await run.answer("I am a developer"); // introduction
    await run.answer("A real answer", { advanceMs: 42_000 });
    const record = merged(run.saved).filter((r) => r.status === "EVALUATED").pop();
    expect(record).toMatchObject({ topic: "JavaScript Fundamentals", questionType: "MAIN", questionKind: "CONCEPTUAL", promptVersion: "interview-v2-template" });
    expect(record.bankQuestionId).toMatch(/^topic1-b/);
    expect(record.evaluationCriteria).toEqual(["accuracy"]);
    expect(record.timing.responseMs).toBe(42_000);
    expect(record.timing.evaluationMs).toBe(5);
    expect(record.timing.generationMs).toBe(7);
  });

  test("a bank question is not offered again once it was used", async () => {
    const run = makeRun();
    const mains = await playToEnd(run);
    const ids = run.engine.state.askedBankIds;
    expect(ids).toHaveLength(15);
    expect(new Set(ids).size).toBe(15);
    expect(mains).toHaveLength(15);
  });
});

describe("follow-ups", () => {
  test("never exceed the limit per main question and never count as main questions", async () => {
    let n = 0;
    const run = makeRun({ llm: fakeLlm({ onAnalysis: () => analysis("ASK_FOLLOW_UP", `Why did you mention ${distinct((n += 1))} there?`) }) });
    const mains = await playToEnd(run);
    expect(mains).toHaveLength(15);
    const records = merged(run.saved);
    const followUps = records.filter((r) => r.questionType === "FOLLOW_UP");
    const bymain = new Map();
    for (const r of records.filter((x) => x.status === "EVALUATED")) {
      if (r.questionType === "FOLLOW_UP") bymain.set(r.parentQuestionId, (bymain.get(r.parentQuestionId) || 0) + 1);
    }
    expect(Math.max(...bymain.values())).toBeLessThanOrEqual(2);
    expect(followUps.length).toBeGreaterThan(0);
    const total = Object.values(run.engine.state.topicFollowUps).reduce((a, b) => a + b, 0);
    expect(total).toBe(30); // two per main question, tracked per topic
    expect(run.engine.state.mainCount).toBe(15);
    // Follow-ups link to their parent and know their position.
    const first = followUps[0];
    expect(first.parentQuestionId).toMatch(/^q\d+$/);
    expect([1, 2]).toContain(first.followUpIndex);
    expect(first.topic).toBe("JavaScript Fundamentals");
  });
});

describe("a model that keeps repeating its follow-up", () => {
  test("the repeat is re-asked once, then the interview moves to the next main question", async () => {
    const run = makeRun({ llm: fakeLlm({ onAnalysis: () => analysis("ASK_FOLLOW_UP", "Why did you pick that particular approach here?") }) });
    run.open();
    await run.answer("intro");
    await run.answer("first answer"); // a first follow-up is fine
    await run.answer("second answer"); // identical wording: re-asked once
    await run.answer("third answer"); // still identical: move on
    expect(run.engine.state.mainCount).toBe(2);
    expect(run.engine.state.currentQuestion.type).toBe("MAIN");
    expect(run.engine.state.followUpCount).toBe(0);
  });
});

describe("a model that breaks the plan", () => {
  test("an off-topic question is rejected and the bank question for the topic is used instead", async () => {
    const run = makeRun({ llm: fakeLlm({ onQuestion: (plan) => ({ question: "How do MongoDB indexes work in depth?", topic: "MongoDB", difficulty: "INTERMEDIATE", questionType: "CONCEPTUAL", evaluationCriteria: [], isFollowUp: false, parentQuestionId: null }) }) });
    run.open();
    await run.answer("intro");
    const q = run.engine.state.currentQuestion;
    expect(q.topic).toBe("JavaScript Fundamentals");
    expect(q.text).not.toMatch(/MongoDB/);
    expect(q.bankQuestionId).toMatch(/^topic1-b/);
    expect(run.metrics.snapshot().counters["interview.question_from_bank"]).toBe(1);
  });

  test("a repeated question is not asked twice", async () => {
    const run = makeRun({ llm: fakeLlm({ onQuestion: (plan) => ({ question: "Explain what a closure is in one sentence please?", topic: plan.topic.name, difficulty: plan.difficulty, questionType: plan.questionType, evaluationCriteria: [], isFollowUp: false, parentQuestionId: null }) }) });
    const mains = await playToEnd(run);
    const texts = mains.map((q) => q.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  test("a model that returns a main question flagged as a follow-up is rejected", async () => {
    const run = makeRun({ llm: fakeLlm({ onQuestion: (plan) => ({ question: "Tell me more about that?", topic: plan.topic.name, isFollowUp: true, parentQuestionId: "q1" }) }) });
    run.open();
    await run.answer("intro");
    expect(run.engine.state.currentQuestion.text).not.toBe("Tell me more about that?");
    expect(run.engine.state.mainCount).toBe(1);
  });
});

describe("interview time", () => {
  const minutes = (m) => m * 60_000;

  test("the model is told how much time is left, and follow-ups stop when the remaining questions need the time", async () => {
    const clock = { t: 1_000_000 };
    const run = makeRun({ clock, llm: fakeLlm({ onAnalysis: () => analysis("ASK_FOLLOW_UP", "Can you say more?") }) });
    run.open();
    await run.answer("intro", { advanceMs: 1_000 });
    expect(run.llm.calls.find((c) => c.plan).plan.minutesRemaining).toBe(30);
    // 12 minutes in with 14 main questions still to ask: 14 x 85 s + 1 min closing is more than the 18 left.
    const out = await run.answer("answer", { advanceMs: minutes(5) });
    await run.answer("answer", { advanceMs: minutes(5) });
    await run.answer("answer", { advanceMs: minutes(2) });
    expect(out.completed).toBe(false);
    const analysisCall = run.llm.calls.filter((c) => c.candidateAnswer !== undefined).pop();
    expect(analysisCall.limits.timePressure).toBe(true);
    expect(run.engine.state.followUpCount).toBe(0); // the last turns moved straight to main questions
    expect(run.metrics.snapshot().counters["interview.action_overridden.time_pressure"]).toBeGreaterThan(0);
  });

  test("the interview completes when the duration has run out, whatever the model says", async () => {
    const clock = { t: 1_000_000 };
    const run = makeRun({ clock });
    run.open();
    await run.answer("intro");
    const out = await run.answer("late answer", { advanceMs: minutes(31) });
    expect(out.completed).toBe(true);
    expect(run.engine.isCompleted).toBe(true);
  });

  test("a topic that overran badly is moved past, and its remaining question is still asked before the end", async () => {
    const details = buildDetails((t) => (t.sequence === 1 ? { ...t, allocatedMinutes: 2 } : t)); // topic 1: 2 questions, 2 minutes
    const clock = { t: 1_000_000 };
    const run = makeRun({ details, clock });
    run.open();
    await run.answer("intro", { advanceMs: 1_000 });
    expect(run.engine.state.currentQuestion.topic).toBe("JavaScript Fundamentals");
    await run.answer("slow answer", { advanceMs: minutes(4) }); // 4 min >= 1.5 x 2 min
    expect(run.engine.state.closedTopics["JavaScript Fundamentals"]).toBe(true);
    expect(run.engine.state.currentQuestion.topic).toBe("Variables, Scope and Hoisting");
    // Finish the interview quickly: the postponed question of topic 1 is asked, so the distribution still holds.
    while (!run.engine.isCompleted) await run.answer("quick", { advanceMs: 5_000 });
    expect(run.engine.state.topicCounts["JavaScript Fundamentals"]).toBe(2);
    expect(run.engine.state.mainCount).toBe(15);
  });

  test("time spent while disconnected is not charged to a topic", async () => {
    const run = makeRun();
    run.open();
    await run.answer("intro", { advanceMs: 1_000 });
    await run.answer("after a long pause", { advanceMs: minutes(25) });
    expect(run.engine.state.topicSpentMs["JavaScript Fundamentals"]).toBe(minutes(5)); // capped, not 25 minutes
  });
});

describe("reconnection and frozen configuration", () => {
  test("a restored engine continues with the same counters, bank usage and topic", async () => {
    const run = makeRun();
    run.open();
    for (let i = 0; i < 6; i += 1) await run.answer("answer");
    const snapshot = run.engine.snapshot();
    const resumed = makeRun({ details: run.details, snapshot, clock: run.clock });
    expect(resumed.engine.state.mainCount).toBe(snapshot.mainCount);
    while (!resumed.engine.isCompleted) await resumed.answer("answer");
    expect(resumed.engine.state.mainCount).toBe(15);
    expect(resumed.engine.state.topicCounts).toEqual(Object.fromEntries(run.details.template.topics.map((t) => [t.name, t.questionCount])));
    expect(new Set(resumed.engine.state.askedBankIds).size).toBe(resumed.engine.state.askedBankIds.length);
  });

  test("an engine uses the configuration frozen in its details, not a later edit of the template", async () => {
    const original = buildDetails();
    const edited = buildDetails((t) => ({ ...t, questionCount: t.questionCount + 1 })); // the template was changed afterwards
    const run = makeRun({ details: original });
    const mains = await playToEnd(run);
    expect(mains).toHaveLength(15);
    expect(edited.settings.mainQuestions).toBe(15); // sanity: the edit changes topic counts only, so compare per topic
    expect(Object.values(run.engine.state.topicCounts).reduce((a, b) => a + b, 0)).toBe(15);
    expect(original.template.topics[0].questionCount).toBe(2);
    expect(edited.template.topics[0].questionCount).toBe(3);
  });

  test("an unavailable question bank does not stop the interview", async () => {
    const details = buildDetails();
    const llm = fakeLlm();
    const engine = new InterviewEngine({ details, config, llm, metrics: new Metrics(), bank: { pick: async () => { throw new Error("db down"); } } });
    engine.openingTurn().commit();
    const out = await engine.handleAnswer({ turnId: "turn-0001", text: "intro" }, { requestId: "r", recentMessages: [], hooks: { saveAnswer() {} } });
    out.commit();
    expect(engine.state.currentQuestion.type).toBe("MAIN");
    expect(engine.state.currentQuestion.bankQuestionId).toBeNull();
  });
});

describe("scoring uses the template's topic weightage", () => {
  test("the final score weights topic averages by the template's weightage", () => {
    const details = buildDetails();
    const answers = [
      { topic: "JavaScript Fundamentals", status: "EVALUATED", evaluation: { status: "EVALUATED", score: 10, strengths: [], missingConcepts: [], incorrectConcepts: [], suggestedFollowUpAreas: [] } },
      { topic: "Functions and Closures", status: "EVALUATED", evaluation: { status: "EVALUATED", score: 4, strengths: [], missingConcepts: [], incorrectConcepts: [], suggestedFollowUpAreas: [] } },
    ];
    // weights 10 and 12: (10*10 + 4*12) / 22 = 6.7
    expect(buildFinalEvaluation(answers, details.settings).overallScore).toBe(6.7);
  });
});
