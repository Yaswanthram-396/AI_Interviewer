const { startTestServer, openSession, connect, sleep } = require("./helpers");
const { loadRealtimeConfig } = require("../realtime/config");
const { CandidateTurnTracker, CANDIDATE_TURN } = require("../realtime/interview/candidateTurn");
const { raceAbort, ProviderError } = require("../realtime/util");

/**
 * Turn-taking, cancellation and race conditions, end to end over a real WebSocket.
 * The LLM and TTS are controlled by hand: every call stays pending until a test releases it, so a
 * test decides exactly when a "late" response arrives. The TTS fake ignores its abort signal, like
 * the real Google client (which has no cancellation): invalidation, not termination.
 */

const questionJson = (question) =>
  JSON.stringify({ question, topic: "General", difficulty: "BEGINNER", questionType: "CONCEPTUAL", evaluationCriteria: [] });

const structured = (extra = {}) => ({ ...loadRealtimeConfig({}).interview, engine: "structured", ...extra });

async function until(predicate, label = "condition", timeoutMs = 2000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await sleep(5);
  }
}

/** Replaces the server's LLM and TTS with hand-controlled fakes. */
function controlProviders(t, { llmHonorsAbort = true } = {}) {
  const llm = [];
  const tts = [];
  t.llm.complete = ({ messages, signal, json }) =>
    new Promise((resolve, reject) => {
      const call = { messages, json, signal, resolve: (text) => resolve({ text, durationMs: 1 }) };
      llm.push(call);
      if (llmHonorsAbort) {
        signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { code: "ABORTED" })), { once: true });
      }
    });
  t.tts.synthesize = ({ text, signal }) =>
    new Promise((resolve) => {
      tts.push({ text, signal, resolve: () => resolve({ audioBase64: Buffer.from(`audio:${text}`).toString("base64"), durationMs: 1 }) });
    });
  let llmNext = 0;
  let ttsNext = 0;
  return {
    llm,
    tts,
    /** Waits for the next unreleased LLM call, releases it with `text` and returns it. */
    async releaseLlm(text) {
      await until(() => llm.length > llmNext, `LLM call #${llmNext + 1}`);
      const call = llm[llmNext++];
      call.resolve(text);
      return call;
    },
    async releaseTts() {
      await until(() => tts.length > ttsNext, `TTS call #${ttsNext + 1}`);
      const call = tts[ttsNext++];
      call.resolve();
      return call;
    },
    skipLlm: (n = 1) => (llmNext += n),
    skipTts: (n = 1) => (ttsNext += n),
  };
}

const answer = (turnId, text) => ({ type: "user_turn", turnId, text });
const introduction = (call) => JSON.parse(call.messages.at(-1).content).introduction;

/** Opens a session, controls the providers and plays the deterministic opening to the candidate. */
async function startInterview(t, providerOptions) {
  const p = controlProviders(t, providerOptions);
  const { c, ready } = await openSession(t.url);
  const session = t.rt.sessions.get(ready.sessionId);
  c.send({ type: "start_interview", turnId: "turn-open-0001" });
  await p.releaseTts();
  const opening = await c.waitFor((m) => m.type === "tts_audio" && m.turnId === "turn-open-0001");
  return { c, ready, p, session, opening };
}

describe("generation ids and stale acknowledgements", () => {
  let t;
  afterEach(async () => {
    await t?.rt.close();
    t = null;
  });

  test("every reply has its own generation id, repeated on turn_state, and stale acks are ignored", async () => {
    t = await startTestServer({ config: { interview: structured() } });
    const { c, p, session, opening } = await startInterview(t);
    expect(opening.generationId).toMatch(/^gen_/);
    expect((await c.waitFor((m) => m.type === "turn_state" && m.turnId === "turn-open-0001" && m.state === "llm")).generationId).toBe(opening.generationId);

    c.send(answer("turn-gen-0001", "I build APIs."));
    await p.releaseLlm(questionJson("What is an index?"));
    await p.releaseTts();
    const second = await c.waitFor((m) => m.type === "tts_audio" && m.turnId === "turn-gen-0001");
    expect(second.generationId).toMatch(/^gen_/);
    expect(second.generationId).not.toBe(opening.generationId);
    expect(session.conv.current).toBe("AI_SPEAKING");

    // The first reply finishes playing only now, after the backend moved on to the second one.
    c.send({ type: "playback_ended", turnId: "turn-open-0001", generationId: opening.generationId });
    // Right turn, wrong generation.
    c.send({ type: "playback_ended", turnId: "turn-gen-0001", generationId: "gen_00000000-0000-0000-0000-000000000000" });
    await sleep(40);
    expect(session.conv.current).toBe("AI_SPEAKING");
    expect(t.metrics.snapshot().counters["playback.stale_ack"]).toBe(2);

    c.send({ type: "playback_ended", turnId: "turn-gen-0001", generationId: second.generationId });
    await until(() => session.conv.current === "LISTENING", "LISTENING after the real ack");
  });

  test("a malformed generation id is rejected", async () => {
    t = await startTestServer({ config: { interview: structured() } });
    const { c } = await startInterview(t);
    c.send({ type: "playback_ended", turnId: "turn-open-0001", generationId: "not-a-generation" });
    expect((await c.waitType("error")).code).toBe("INVALID_MESSAGE");
  });
});

describe("superseding an unfinished answer", () => {
  let t;
  afterEach(async () => {
    await t?.rt.close();
    t = null;
  });

  test("a new answer aborts the pending LLM call, merges the text and only the new reply is delivered", async () => {
    t = await startTestServer({ config: { interview: structured() } });
    const { c, p, session } = await startInterview(t);
    c.send(answer("turn-sup-0001", "I build APIs."));
    await until(() => p.llm.length === 1, "first LLM call");

    c.send(answer("turn-sup-0002", "And I run the infrastructure."));
    await until(() => p.llm[0].signal.aborted, "the first LLM request to be aborted");
    await c.waitFor((m) => m.type === "turn_cancelled" && m.turnId === "turn-sup-0001");
    expect((await c.waitFor((m) => m.type === "turn_cancelled" && m.turnId === "turn-sup-0001")).reason).toBe("superseded");

    await until(() => p.llm.length === 2, "second LLM call");
    expect(introduction(p.llm[1])).toBe("I build APIs. And I run the infrastructure."); // nothing the candidate said is dropped
    p.skipLlm(1);
    await p.releaseLlm(questionJson("What is an index?"));
    await p.releaseTts();
    await c.waitFor((m) => m.type === "tts_audio" && m.turnId === "turn-sup-0002");

    expect(c.count((m) => m.type === "tts_audio" && m.turnId === "turn-sup-0001")).toBe(0);
    expect(session.engine.snapshot()).toMatchObject({ mainCount: 1, currentQuestion: { text: "What is an index?" } });
    await sleep(30);
    const statuses = Object.fromEntries([...t.store.answers.values()].map((a) => [a.turnId, a.status]));
    expect(statuses).toEqual({ "turn-sup-0001": "SUPERSEDED", "turn-sup-0002": "RECORDED" });
    expect(session.history.filter((h) => h.role === "user")).toEqual([
      { role: "user", content: "I build APIs. And I run the infrastructure." },
    ]);
  });

  test("an LLM that ignores the abort signal still cannot affect the newer turn when it finally answers", async () => {
    t = await startTestServer({ config: { interview: structured() } });
    const { c, p, session } = await startInterview(t, { llmHonorsAbort: false });
    c.send(answer("turn-ign-0001", "first"));
    await until(() => p.llm.length === 1, "first LLM call");
    c.send(answer("turn-ign-0002", "second"));
    // The first call never rejects, yet the new turn is not blocked behind it.
    await until(() => p.llm.length === 2, "second LLM call without waiting for the first");
    expect(p.llm[0].signal.aborted).toBe(true);

    p.skipLlm(1);
    await p.releaseLlm(questionJson("Fresh question?"));
    await p.releaseTts();
    await c.waitFor((m) => m.type === "tts_audio" && m.turnId === "turn-ign-0002");

    p.llm[0].resolve(questionJson("STALE question?")); // the cancelled request returns after cancellation
    await sleep(60);
    expect(p.tts).toHaveLength(2); // opening + the new reply; no synthesis for the stale answer
    expect(c.count((m) => m.type === "tts_audio")).toBe(2);
    const snapshot = session.engine.snapshot();
    expect(snapshot.currentQuestion.text).toBe("Fresh question?");
    expect(snapshot.askedQuestions.map((q) => q.text)).not.toContain("STALE question?");
  });

  test("LLM finished just before the abort, TTS still running: late audio is discarded and nothing was committed", async () => {
    t = await startTestServer({ config: { interview: structured() } });
    const { c, p, session } = await startInterview(t);
    c.send(answer("turn-race-0001", "I build APIs."));
    await p.releaseLlm(questionJson("Question for the first answer?"));
    await until(() => p.tts.length === 2, "TTS for the first reply to start"); // opening + this one
    const before = session.engine.snapshot();

    c.send(answer("turn-race-0002", "Wait, one more thing."));
    await until(() => p.tts[1].signal.aborted, "TTS signal to be aborted");
    expect(session.engine.snapshot()).toEqual(before); // the cancelled generation changed no interview state

    await until(() => p.llm.length === 2, "second LLM call");
    p.skipTts(1); // the first answer's TTS call was aborted and is never released through the driver
    await p.releaseLlm(questionJson("Question for the second answer?"));
    await p.releaseTts();
    await c.waitFor((m) => m.type === "tts_audio" && m.turnId === "turn-race-0002");

    // The first TTS call (which cannot be cancelled) finally completes, after a new question has started.
    p.tts[1].resolve();
    await sleep(60);
    expect(c.count((m) => m.type === "tts_audio")).toBe(2);
    expect(c.inbox.filter((m) => m.type === "tts_audio").map((m) => m.turnId)).toEqual(["turn-open-0001", "turn-race-0002"]);
    const snapshot = session.engine.snapshot();
    expect(snapshot.currentQuestion.text).toBe("Question for the second answer?");
    expect(snapshot.askedQuestions.map((q) => q.text)).not.toContain("Question for the first answer?");
    expect(session.history.map((h) => h.role)).toEqual(["assistant", "user", "assistant"]); // opening, merged answer, reply
    expect(session.history.at(-1).content).toMatch(/Question for the second answer\?/);
  });

  test("five answers in quick succession produce one reply to the combined answer", async () => {
    t = await startTestServer({ config: { interview: structured() } });
    const { c, p, session } = await startInterview(t);
    for (let i = 1; i <= 5; i += 1) c.send(answer(`turn-burst-000${i}`, `part${i}`));
    await sleep(120);
    const last = p.llm.at(-1);
    expect(last.signal.aborted).toBe(false);
    expect(introduction(last)).toBe("part1 part2 part3 part4 part5");
    expect(p.llm.slice(0, -1).every((call) => call.signal.aborted)).toBe(true);

    p.skipLlm(p.llm.length - 1);
    await p.releaseLlm(questionJson("What is an index?"));
    await p.releaseTts();
    await c.waitFor((m) => m.type === "tts_audio" && m.turnId === "turn-burst-0005");
    await sleep(30);
    expect(c.inbox.filter((m) => m.type === "tts_audio").map((m) => m.turnId)).toEqual(["turn-open-0001", "turn-burst-0005"]);
    expect(c.count((m) => m.type === "turn_cancelled" && m.reason === "superseded")).toBe(4);
    expect(session.history.filter((h) => h.role === "user")).toHaveLength(1);
    expect([...t.store.answers.values()].filter((a) => a.status === "RECORDED")).toHaveLength(1);
  });

  test("an interrupt while the reply is being synthesized commits nothing and keeps what was said", async () => {
    t = await startTestServer({ config: { interview: structured() } });
    const { c, p, session } = await startInterview(t);
    c.send(answer("turn-intr-0001", "I build APIs."));
    await p.releaseLlm(questionJson("Question for the first answer?"));
    await until(() => p.tts.length === 2, "TTS to start");
    const before = session.engine.snapshot();

    c.send({ type: "interrupt" });
    expect((await c.waitFor((m) => m.type === "turn_cancelled" && m.turnId === "turn-intr-0001")).reason).toBe("interrupt");
    p.tts[1].resolve(); // synthesis finishes after the interrupt
    await sleep(40);
    expect(c.count((m) => m.type === "tts_audio")).toBe(1);
    expect(session.engine.snapshot()).toEqual(before);

    p.skipLlm(1);
    p.skipTts(2);
    c.send(answer("turn-intr-0002", "plus some more."));
    await until(() => p.llm.length === 2, "LLM call for the next answer");
    expect(introduction(p.llm[1])).toBe("I build APIs. plus some more.");

    // The interrupted answer must not stay PENDING forever: its text now lives in the merged answer.
    await sleep(30);
    const statuses = Object.fromEntries([...t.store.answers.values()].map((a) => [a.turnId, a.status]));
    expect(statuses["turn-intr-0001"]).toBe("SUPERSEDED");
    expect(statuses["turn-intr-0002"]).toBe("PENDING"); // being worked on
  });

  test("a duplicate of the turn being synthesized is acknowledged, not re-run", async () => {
    t = await startTestServer({ config: { interview: structured() } });
    const { c, p } = await startInterview(t);
    c.send(answer("turn-dup-1001", "I build APIs."));
    await p.releaseLlm(questionJson("What is an index?"));
    await until(() => p.tts.length === 2, "TTS to start");
    c.send(answer("turn-dup-1001", "I build APIs."));
    c.send(answer("turn-dup-1001", "I build APIs."));
    await c.waitFor((m) => m.duplicate === true && m.state === "tts");
    await p.releaseTts();
    await c.waitFor((m) => m.type === "tts_audio" && m.turnId === "turn-dup-1001");
    await sleep(30);
    expect(p.llm).toHaveLength(1);
    expect(c.count((m) => m.type === "tts_audio" && m.turnId === "turn-dup-1001")).toBe(1);
  });
});

describe("strict turn-taking and the microphone", () => {
  let t;
  afterEach(async () => {
    await t?.rt.close();
    t = null;
  });

  const heard = (text) => ({ text, isFinal: true, speechFinal: false, fromFinalize: false });

  async function aiIsSpeaking(t) {
    const ctx = await startInterview(t);
    ctx.c.send({ type: "start_stt" });
    await ctx.c.waitType("stt_started");
    return ctx; // the opening was delivered and not yet acknowledged: the AI holds the floor
  }

  test("audio and speech are ignored while the AI is speaking and accepted once playback has ended", async () => {
    t = await startTestServer({ config: { interview: structured() } });
    const { c, session, opening } = await aiIsSpeaking(t);
    expect(session.conv.current).toBe("AI_SPEAKING");

    c.sendBinary(Buffer.alloc(320));
    t.stt.handlers.onSpeechStarted();
    t.stt.handlers.onResult(heard("talking over the interviewer"));
    await sleep(40);
    expect(t.stt.sent).toHaveLength(0);
    expect(c.count((m) => m.type === "speech_started" || m.type === "interim_transcript" || m.type === "final_transcript")).toBe(0);
    const counters = t.metrics.snapshot().counters;
    expect(counters["audio.rejected_ai_speaking"]).toBe(1);
    expect(counters["stt.ignored_while_ai_speaking"]).toBe(2);

    c.send({ type: "playback_ended", turnId: "turn-open-0001", generationId: opening.generationId });
    await until(() => session.conv.current === "LISTENING", "LISTENING");
    c.sendBinary(Buffer.alloc(320));
    t.stt.handlers.onSpeechStarted();
    await c.waitType("speech_started");
    await until(() => t.stt.sent.length === 1, "audio to reach STT");
  });

  test("with barge-in enabled the microphone stays live while the AI speaks", async () => {
    t = await startTestServer({ config: { interview: structured({ bargeIn: true }) } });
    const { c, session } = await aiIsSpeaking(t);
    expect(session.conv.current).toBe("AI_SPEAKING");
    c.sendBinary(Buffer.alloc(320));
    t.stt.handlers.onSpeechStarted();
    await c.waitType("speech_started");
    await until(() => t.stt.sent.length === 1, "audio to reach STT");
    expect(t.metrics.snapshot().counters["audio.rejected_ai_speaking"]).toBeUndefined();
  });

  test("rapid start_stt calls open a single stream; a stop followed by a start reopens it", async () => {
    t = await startTestServer({ config: { interview: structured() }, env: { EOT_MANUAL_STOP_WAIT_MS: "40" } });
    let opened = 0;
    const open = t.stt.open;
    t.stt.open = (handlers) => {
      opened += 1;
      return open(handlers);
    };
    const { c } = await openSession(t.url);
    for (let i = 0; i < 4; i += 1) c.send({ type: "start_stt" });
    await until(() => c.count((m) => m.type === "stt_started") === 4, "every start to be acknowledged");
    expect(opened).toBe(1);
    expect(t.metrics.snapshot().counters["stt.duplicate_start"]).toBe(3);

    c.send({ type: "stop_stt" });
    c.send({ type: "start_stt" });
    await until(() => opened === 2, "the stream to be reopened after a stop");
    await sleep(80); // the old stream's delayed close must not tear down the new one
    c.send({ type: "start_stt" });
    await until(() => c.count((m) => m.type === "stt_started") === 6, "ack for a start on the live stream");
    expect(opened).toBe(2);
  });

  test("if the client never reports playback finished, the candidate gets the floor back", async () => {
    t = await startTestServer({ config: { interview: structured({ playbackAckTimeoutMs: 60 }) } });
    const { session } = await startInterview(t);
    expect(session.conv.current).toBe("AI_SPEAKING");
    await until(() => session.conv.current === "LISTENING", "the watchdog to return the floor");
    expect(t.metrics.snapshot().counters["playback.ack_timeout"]).toBe(1);
  });

  test("a reconnect while the AI was speaking returns the floor (the old audio is gone)", async () => {
    t = await startTestServer({ config: { interview: structured() } });
    const first = await startInterview(t);
    first.c.close();
    await first.c.closed;
    const second = await openSession(t.url, { resumeToken: first.ready.resumeToken });
    expect(second.ready.resumed).toBe(true);
    expect(first.session.conv.current).toBe("LISTENING");
  });
});

describe("disconnects and the end of the interview while requests are pending", () => {
  let t;
  afterEach(async () => {
    await t?.rt.close();
    t = null;
  });

  test("a socket that drops during cancellation does not break the session; only the newest reply is replayed", async () => {
    t = await startTestServer({ config: { interview: structured() } });
    const { c, ready, p, session } = await startInterview(t);
    c.send(answer("turn-dc-0001", "first"));
    await until(() => p.llm.length === 1, "first LLM call");
    c.send(answer("turn-dc-0002", "second"));
    await until(() => p.llm.length === 2, "second LLM call");
    c.close();
    await c.closed;

    p.skipLlm(1);
    await p.releaseLlm(questionJson("What is an index?"));
    await p.releaseTts();
    await until(() => session.turns.get("turn-dc-0002")?.state === "undelivered", "the reply to be held for replay");
    expect(session.turns.get("turn-dc-0001").state).toBe("cancelled");

    const resumed = await openSession(t.url, { resumeToken: ready.resumeToken });
    const replay = await resumed.c.waitType("tts_audio");
    expect(replay.turnId).toBe("turn-dc-0002");
    expect(replay.text).toMatch(/What is an index\?/);
    await sleep(40);
    expect(resumed.c.count((m) => m.type === "tts_audio")).toBe(1);
    expect(session.conv.current).toBe("AI_SPEAKING"); // the replayed reply is now the one being played
  });

  test("ending the interview while the LLM is pending: the late reply changes nothing", async () => {
    t = await startTestServer({ config: { interview: structured() } });
    const { c, ready, p, session } = await startInterview(t, { llmHonorsAbort: false });
    c.send(answer("turn-end-0001", "I build APIs."));
    await until(() => p.llm.length === 1, "LLM call");
    c.send({ type: "end_interview" });
    await c.waitType("session_ended");

    p.llm[0].resolve(questionJson("Late question?"));
    await sleep(60);
    expect(p.tts).toHaveLength(1); // only the opening was ever synthesized
    expect(session.engine.snapshot()).toMatchObject({ mainCount: 0, currentQuestion: { type: "WARMUP" } });
    const afterEnd = c.inbox.slice(c.inbox.findIndex((m) => m.type === "session_ended") + 1);
    expect(afterEnd.filter((m) => m.type === "tts_audio" || m.type === "next_question")).toEqual([]);
    expect([...t.store.answers.values()].some((a) => a.status === "RECORDED" || a.status === "EVALUATED")).toBe(false);
    expect(t.store.evaluations.get(ready.sessionId)).toMatchObject({ evaluationStatus: "INSUFFICIENT_DATA", completionReason: "client_ended" });
  });

  test("ending the interview while TTS is running: the late audio is dropped and history is untouched", async () => {
    t = await startTestServer({ config: { interview: structured() } });
    const { c, ready, p } = await startInterview(t);
    await sleep(20);
    c.send(answer("turn-end-0002", "I build APIs."));
    await p.releaseLlm(questionJson("Question?"));
    await until(() => p.tts.length === 2, "TTS to start");
    c.send({ type: "end_interview" });
    await c.waitType("session_ended");

    p.tts[1].resolve();
    await sleep(60);
    expect(c.count((m) => m.type === "tts_audio")).toBe(1); // just the opening
    expect(t.store.sessions.get(ready.sessionId).history.map((h) => h.role)).toEqual(["assistant"]);
  });
});

describe("candidate turn lifecycle", () => {
  const { IDLE, RECORDING, TRANSCRIBING, ANSWER_FINALIZED, EVALUATING, COMPLETED, CANCELLED } = CANDIDATE_TURN;

  test("follows IDLE -> RECORDING -> TRANSCRIBING -> ANSWER_FINALIZED -> EVALUATING -> COMPLETED", () => {
    const seen = [];
    const tracker = new CandidateTurnTracker({ onChange: ({ to }) => seen.push(to) });
    expect(tracker.state).toBe(IDLE);
    tracker.startRecording();
    tracker.transcribing();
    tracker.finalize("turn-1");
    tracker.evaluating("turn-1");
    tracker.complete("turn-1");
    expect(seen).toEqual([RECORDING, TRANSCRIBING, ANSWER_FINALIZED, EVALUATING, COMPLETED]);
  });

  test("never has two active turns: a different turn must cancel the active one first", () => {
    const tracker = new CandidateTurnTracker();
    tracker.finalize("turn-1");
    expect(() => tracker.finalize("turn-2")).toThrow(/still active/);
    expect(tracker.finalize("turn-1")).toBe(false); // the same turn again is a duplicate, not a second turn
    tracker.evaluating("turn-1");
    expect(() => tracker.finalize("turn-2")).toThrow(/still active/);
    expect(tracker.cancel("turn-1")).toBe(true);
    expect(tracker.state).toBe(CANCELLED);
    expect(tracker.finalize("turn-2")).toBe(true);
  });

  test("speech during evaluation does not start a second turn, and late signals about old turns are ignored", () => {
    const tracker = new CandidateTurnTracker();
    tracker.finalize("turn-1");
    tracker.evaluating("turn-1");
    expect(tracker.startRecording()).toBe(false);
    expect(tracker.transcribing()).toBe(false);
    expect(tracker.complete("turn-0")).toBe(false);
    expect(tracker.cancel("turn-0")).toBe(false);
    expect(tracker.state).toBe(EVALUATING);
    expect(tracker.evaluating("turn-9")).toBe(false);
  });

  test("a completed or cancelled turn lets the next utterance start fresh", () => {
    const tracker = new CandidateTurnTracker();
    tracker.finalize("turn-1");
    tracker.evaluating("turn-1");
    tracker.complete("turn-1");
    expect(tracker.startRecording()).toBe(true);
    expect(tracker.state).toBe(RECORDING);
  });
});

describe("raceAbort", () => {
  test("rejects with ABORTED immediately and swallows the late result of the abandoned promise", async () => {
    const controller = new AbortController();
    let finish;
    const slow = new Promise((resolve) => (finish = resolve));
    const raced = raceAbort(slow, controller.signal);
    controller.abort();
    await expect(raced).rejects.toMatchObject({ code: "ABORTED" });
    finish("too late"); // must not throw or leak an unhandled rejection
    await sleep(5);
  });

  test("an already-aborted signal rejects without waiting, and a late rejection is swallowed", async () => {
    const controller = new AbortController();
    controller.abort();
    let fail;
    const slow = new Promise((_, reject) => (fail = reject));
    await expect(raceAbort(slow, controller.signal)).rejects.toBeInstanceOf(ProviderError);
    fail(new Error("provider blew up after cancellation"));
    await sleep(5);
  });

  test("passes results and errors through when not aborted", async () => {
    const controller = new AbortController();
    await expect(raceAbort(Promise.resolve(7), controller.signal)).resolves.toBe(7);
    await expect(raceAbort(Promise.reject(new Error("boom")), controller.signal)).rejects.toThrow("boom");
  });
});

// keep the unused-import linter honest: `connect` is part of the shared helpers used by other suites
void connect;
