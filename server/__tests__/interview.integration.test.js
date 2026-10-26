const { startTestServer, openSession, sleep } = require("./helpers");
const { loadRealtimeConfig } = require("../realtime/config");

/** End-to-end over a real WebSocket, with a scripted model, fake TTS/STT and the in-memory store. */

const analysis = (over = {}) =>
  JSON.stringify({
    evaluation: {
      answerQuality: "CORRECT",
      score: 8,
      strengths: ["clear"],
      missingConcepts: [],
      incorrectConcepts: [],
      reasoningSummary: "Good.",
      suggestedFollowUpAreas: [],
      ...over.evaluation,
    },
    decision: { nextAction: "ASK_FOLLOW_UP", reason: "depth", question: "Can you give an example?", topic: "Indexes", difficulty: "INTERMEDIATE", ...over.decision },
    summary: "Doing well.",
  });
const question = (text) => JSON.stringify({ question: text, topic: "Indexes", difficulty: "INTERMEDIATE", questionType: "CONCEPTUAL", evaluationCriteria: [] });

const structured = (extra = {}) => ({ ...loadRealtimeConfig({}).interview, engine: "structured", ...extra });
const turn = (id, text) => ({ type: "user_turn", turnId: id, text });

describe("structured interview over WebSocket", () => {
  let t;
  afterEach(async () => {
    await t?.rt.close();
    t = null;
  });

  function script(replies) {
    t.llm.reply = (n) => {
      const next = replies[n - 1];
      if (next === undefined) throw new Error(`unscripted LLM call #${n}`);
      return next;
    };
  }

  test("opening, evaluation, follow-up and completion, with persistence", async () => {
    t = await startTestServer({ config: { interview: structured({ maxMainQuestions: 1 }) } });
    script([
      question("What is a database index?"), // after the introduction
      analysis(), // follow-up
      analysis({ decision: { nextAction: "ASK_NEXT_QUESTION", question: "ignored" } }), // budget spent -> end
    ]);
    const { c, ready } = await openSession(t.url);
    expect(ready).toMatchObject({ completed: false, conversationState: "INITIALIZING" });

    c.send({ type: "start_interview", turnId: "turn-open-0001" });
    const opening = await c.waitFor((m) => m.type === "tts_audio" && m.turnId === "turn-open-0001");
    expect(opening.text).toMatch(/introduce yourself/);
    expect(t.llm.calls).toHaveLength(0); // the opening needs no model call
    await c.waitFor((m) => m.type === "interview_state" && m.state === "AI_SPEAKING");

    c.send(turn("turn-ans-0001", "I build APIs."));
    const first = await c.waitFor((m) => m.type === "tts_audio" && m.turnId === "turn-ans-0001");
    expect(first.text).toMatch(/What is a database index\?/);
    await c.waitFor((m) => m.type === "next_question" && m.questionType === "MAIN");

    c.send(turn("turn-ans-0002", "It speeds up lookups with a B-tree."));
    const second = await c.waitFor((m) => m.type === "tts_audio" && m.turnId === "turn-ans-0002");
    expect(second.text).toBe("Can you give an example?");
    const evaluated = await c.waitFor((m) => m.type === "answer_evaluated" && m.turnId === "turn-ans-0002");
    expect(evaluated).toMatchObject({ status: "EVALUATED" });
    expect(JSON.stringify(c.inbox)).not.toMatch(/"score"|strengths/); // nothing evaluative reaches the candidate

    c.send(turn("turn-ans-0003", "SELECT * WHERE id = 5 uses the primary key index."));
    const closing = await c.waitFor((m) => m.type === "tts_audio" && m.turnId === "turn-ans-0003");
    expect(closing.text).toMatch(/concludes our interview/);
    await c.waitFor((m) => m.type === "interview_completed");
    await c.waitFor((m) => m.type === "interview_state" && m.state === "COMPLETED");

    await sleep(50); // persistence runs off the audio path
    const answers = [...t.store.answers.values()];
    expect(answers.map((a) => a.turnId).sort()).toEqual(["turn-ans-0001", "turn-ans-0002", "turn-ans-0003"]);
    expect(answers.find((a) => a.turnId === "turn-ans-0001")).toMatchObject({ questionType: "WARMUP", status: "RECORDED" });
    expect(answers.find((a) => a.turnId === "turn-ans-0002")).toMatchObject({ questionType: "MAIN", status: "EVALUATED", evaluation: { score: 8 } });

    const sessionId = ready.sessionId;
    expect(t.store.evaluations.get(sessionId)).toMatchObject({ evaluationStatus: "COMPLETE", overallScore: 8, answeredCount: 2, completionReason: "completed" });
    expect(t.store.sessions.get(sessionId)).toMatchObject({ conversationState: "COMPLETED", engineState: { completed: true } });

    c.send(turn("turn-ans-0004", "One more thing"));
    expect((await c.waitType("error")).code).toBe("SESSION_ENDED");
  });

  test("a duplicate turn id is evaluated once", async () => {
    t = await startTestServer({ config: { interview: structured() } });
    script([question("What is a database index?"), analysis()]);
    const { c } = await openSession(t.url);
    c.send({ type: "start_interview", turnId: "turn-open-0002" });
    await c.waitType("tts_audio");
    c.send(turn("turn-dup-0001", "I build APIs."));
    await c.waitFor((m) => m.type === "tts_audio" && m.turnId === "turn-dup-0001");
    c.send(turn("turn-dup-0002", "An index speeds up reads."));
    c.send(turn("turn-dup-0002", "An index speeds up reads."));
    c.send(turn("turn-dup-0002", "An index speeds up reads."));
    await c.waitFor((m) => m.type === "tts_audio" && m.turnId === "turn-dup-0002");
    await sleep(50);
    expect(t.llm.calls).toHaveLength(2); // question generation + one evaluation
    expect([...t.store.answers.values()].filter((a) => a.turnId === "turn-dup-0002")).toHaveLength(1);
  });

  test("a failed model call keeps the answer and the interview alive", async () => {
    t = await startTestServer({ config: { interview: structured() } });
    script([question("What is a database index?"), analysis()]);
    const { c } = await openSession(t.url);
    c.send({ type: "start_interview", turnId: "turn-open-0003" });
    await c.waitType("tts_audio");
    c.send(turn("turn-fail-0001", "I build APIs."));
    await c.waitFor((m) => m.type === "tts_audio" && m.turnId === "turn-fail-0001");

    t.llm.failWith = Object.assign(new Error("down"), { code: "LLM_TIMEOUT", retryable: true });
    c.send(turn("turn-fail-0002", "An index speeds up reads."));
    const err = await c.waitFor((m) => m.type === "error" && m.turnId === "turn-fail-0002");
    expect(err).toMatchObject({ code: "LLM_TIMEOUT", retryable: true });
    await sleep(50);
    expect(t.store.answers.get(`${[...t.store.sessions.keys()][0]}:turn-fail-0002`)).toMatchObject({
      transcript: "An index speeds up reads.",
      status: "EVALUATION_FAILED",
    });

    t.llm.failWith = null; // the model recovers; the same turn id can be retried
    script([question("unused"), analysis(), analysis()]);
    t.llm.calls.length = 0;
    t.llm.reply = () => analysis();
    c.send(turn("turn-fail-0002", "An index speeds up reads."));
    const retried = await c.waitFor((m) => m.type === "tts_audio" && m.turnId === "turn-fail-0002");
    expect(retried.text).toBe("Can you give an example?");
    await sleep(50);
    expect(t.store.answers.get(`${[...t.store.sessions.keys()][0]}:turn-fail-0002`)).toMatchObject({ status: "EVALUATED" });
  });

  test("after a server restart the interview resumes at the same question", async () => {
    t = await startTestServer({ config: { interview: structured() } });
    script([question("What is a database index?"), analysis({ decision: { question: "How do writes affect it?" } })]);
    const first = await openSession(t.url);
    first.c.send({ type: "start_interview", turnId: "turn-open-0004" });
    await first.c.waitType("tts_audio");
    first.c.send(turn("turn-rst-0001", "I build APIs."));
    await first.c.waitFor((m) => m.type === "tts_audio" && m.turnId === "turn-rst-0001");
    first.c.send(turn("turn-rst-0002", "It speeds up reads."));
    await first.c.waitFor((m) => m.type === "tts_audio" && m.turnId === "turn-rst-0002");
    await sleep(50);
    t.rt.sessions.clear(); // lose all in-memory state
    first.c.close();
    await first.c.closed;

    const second = await openSession(t.url, { resumeToken: first.ready.resumeToken });
    expect(second.ready).toMatchObject({ resumed: true, completed: false });
    expect(second.ready.conversationState).not.toMatch(/EVALUATING|DECIDING|TRANSCRIBING/); // in-flight states do not survive

    t.llm.calls.length = 0;
    script([analysis({ decision: { question: "And deletes?" } })]);
    second.c.send(turn("turn-rst-0003", "Writes have to update it too."));
    const reply = await second.c.waitFor((m) => m.type === "tts_audio" && m.turnId === "turn-rst-0003");
    expect(reply.text).toBe("And deletes?");
    const context = JSON.parse(t.llm.calls[0].at(-1).content);
    expect(context.currentQuestion.text).toBe("How do writes affect it?"); // restored, not restarted
    expect(context.summary).toBe("Doing well.");
  });

  test("ending the interview from the client still stores the evaluation so far", async () => {
    t = await startTestServer({ config: { interview: structured() } });
    script([question("What is a database index?"), analysis()]);
    const { c, ready } = await openSession(t.url);
    c.send({ type: "start_interview", turnId: "turn-open-0005" });
    await c.waitType("tts_audio");
    c.send(turn("turn-end-0001", "I build APIs."));
    await c.waitFor((m) => m.type === "tts_audio" && m.turnId === "turn-end-0001");
    c.send(turn("turn-end-0002", "It speeds up reads."));
    await c.waitFor((m) => m.type === "tts_audio" && m.turnId === "turn-end-0002");
    c.send({ type: "end_interview" });
    await c.waitType("session_ended");
    await sleep(50);
    expect(t.store.evaluations.get(ready.sessionId)).toMatchObject({ evaluationStatus: "COMPLETE", completionReason: "client_ended", answeredCount: 1 });
  });
});
