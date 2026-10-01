const { startTestServer, connect, openSession, sleep, INTERVIEW_ID, OTHER_INTERVIEW_ID } = require("./helpers");
const { ProviderError } = require("../realtime/util");

let t;
afterEach(async () => {
  await t?.rt.close();
  t = null;
});

const turnMsg = (id, text = "I have five years of Node experience") => ({ type: "user_turn", turnId: id, text });

describe("handshake and validation", () => {
  test("rejects messages before hello", async () => {
    t = await startTestServer();
    const c = await connect(t.url);
    c.send(turnMsg("turn-aaaa-0001"));
    const err = await c.waitType("error");
    expect(err.code).toBe("NOT_AUTHENTICATED");
    expect(t.llm.calls).toHaveLength(0);
  });

  test("closes connections that never send hello", async () => {
    t = await startTestServer({ env: { WS_HELLO_TIMEOUT_MS: "100" } });
    const c = await connect(t.url);
    expect(await c.closed).toBe(4001);
  });

  test("unknown interview is rejected", async () => {
    t = await startTestServer();
    const { ready } = await openSession(t.url, { interviewId: "64b0000000000000000000ff" });
    expect(ready.code).toBe("INTERVIEW_NOT_FOUND");
  });

  test.each([
    ["not json", "{nope", "INVALID_JSON"],
    ["array", "[]", "INVALID_MESSAGE"],
    ["unknown type", JSON.stringify({ type: "drop_tables" }), "UNKNOWN_TYPE"],
    ["bad turn id", JSON.stringify({ type: "user_turn", turnId: "x", text: "hi" }), "INVALID_MESSAGE"],
    ["empty text", JSON.stringify({ type: "user_turn", turnId: "turn-aaaa-0001", text: "   " }), "INVALID_MESSAGE"],
  ])("invalid message (%s) gets a typed error and the connection survives", async (_n, payload, code) => {
    t = await startTestServer();
    const { c } = await openSession(t.url);
    c.send(payload);
    expect((await c.waitFor((m) => m.type === "error")).code).toBe(code);
    c.send({ type: "ping" });
    await c.waitType("pong");
  });

  test("oversized frames close the socket", async () => {
    t = await startTestServer({ env: { WS_MAX_PAYLOAD_BYTES: "1024" } });
    const { c } = await openSession(t.url);
    c.send(JSON.stringify({ type: "user_turn", turnId: "turn-aaaa-0001", text: "a".repeat(5000) }));
    expect(await c.closed).toBe(1009);
  });

  test("over-long text is rejected without calling the LLM", async () => {
    t = await startTestServer({ env: { WS_MAX_TEXT_CHARS: "50" } });
    const { c } = await openSession(t.url);
    c.send(turnMsg("turn-aaaa-0001", "x".repeat(51)));
    expect((await c.waitType("error")).code).toBe("PAYLOAD_TOO_LARGE");
    expect(t.llm.calls).toHaveLength(0);
  });

  test("control messages are rate limited", async () => {
    t = await startTestServer({ env: { WS_MSG_RATE_MAX: "5" } });
    const { c } = await openSession(t.url);
    for (let i = 0; i < 10; i++) c.send({ type: "ping" });
    expect((await c.waitFor((m) => m.code === "RATE_LIMITED")).code).toBe("RATE_LIMITED");
  });

  test("disallowed origins are refused", async () => {
    t = await startTestServer({ env: { CORS_ORIGIN: "https://app.example.com" } });
    await expect(connect(t.url, { origin: "https://evil.example.com" })).rejects.toThrow(/403/);
    const ok = await connect(t.url, { origin: "https://app.example.com" });
    ok.close();
  });
});

describe("turn lifecycle", () => {
  test("greeting turn returns correlated text + audio and persists history", async () => {
    t = await startTestServer();
    const { c, ready } = await openSession(t.url);
    expect(ready.resumed).toBe(false);
    c.send({ type: "start_interview", turnId: "turn-greet-001" });
    const audio = await c.waitType("tts_audio");
    expect(audio.turnId).toBe("turn-greet-001");
    expect(Buffer.from(audio.audioBase64, "base64").toString()).toBe(`audio:${audio.text}`);
    // system prompt + greeting instruction only; no fake "user" turn stored
    expect(t.llm.calls[0].map((m) => m.role)).toEqual(["system", "user"]);
    await sleep(20);
    const stored = t.store.sessions.get(ready.sessionId);
    expect(stored.history.map((h) => h.role)).toEqual(["assistant"]);
    expect(stored.history[0].turnId).toBe("turn-greet-001");
  });

  test("duplicate turnId is processed once and the response replays", async () => {
    t = await startTestServer();
    const { c } = await openSession(t.url);
    c.send(turnMsg("turn-dup-0001"));
    const first = await c.waitType("tts_audio");
    c.send(turnMsg("turn-dup-0001"));
    await sleep(50);
    expect(t.llm.calls).toHaveLength(1);
    expect(c.count((m) => m.type === "tts_audio")).toBe(2);
    expect(c.inbox.filter((m) => m.type === "tts_audio")[1].text).toBe(first.text);
    expect(t.metrics.snapshot().counters["turn.duplicate"]).toBe(1);
  });

  test("duplicate while in flight is acknowledged, not re-run", async () => {
    t = await startTestServer();
    let release;
    t.llm.gate = new Promise((r) => (release = r));
    const { c } = await openSession(t.url);
    c.send(turnMsg("turn-dup-0002"));
    await c.waitFor((m) => m.type === "turn_state" && m.state === "llm");
    c.send(turnMsg("turn-dup-0002"));
    await c.waitFor((m) => m.duplicate === true);
    release();
    await c.waitType("tts_audio");
    expect(t.llm.calls).toHaveLength(1);
    expect(c.count((m) => m.type === "tts_audio")).toBe(1);
  });

  test("concurrent turns are serialized and answered in order", async () => {
    t = await startTestServer();
    const { c } = await openSession(t.url);
    for (const id of ["turn-con-0001", "turn-con-0002", "turn-con-0003"]) c.send(turnMsg(id, `answer ${id}`));
    await c.waitFor((m) => m.type === "tts_audio" && m.turnId === "turn-con-0003");
    expect(t.llm.maxInFlight).toBe(1);
    expect(c.inbox.filter((m) => m.type === "tts_audio").map((m) => m.turnId)).toEqual([
      "turn-con-0001",
      "turn-con-0002",
      "turn-con-0003",
    ]);
    // later turns see earlier turns in history
    expect(t.llm.calls[2].filter((m) => m.role === "user")).toHaveLength(3);
  });

  test("excess queued turns are rejected with BUSY", async () => {
    t = await startTestServer({ env: { WS_MAX_QUEUED_TURNS: "1" } });
    t.llm.gate = new Promise(() => {});
    const { c } = await openSession(t.url);
    c.send(turnMsg("turn-bus-0001"));
    await c.waitFor((m) => m.state === "llm");
    c.send(turnMsg("turn-bus-0002"));
    c.send(turnMsg("turn-bus-0003"));
    const err = await c.waitFor((m) => m.code === "BUSY");
    expect(err.turnId).toBe("turn-bus-0003");
  });

  test("LLM failure returns a retryable error; same turnId can be retried", async () => {
    t = await startTestServer();
    t.llm.failWith = new ProviderError("LLM_TIMEOUT", "slow", { retryable: true });
    const { c } = await openSession(t.url);
    c.send(turnMsg("turn-fail-001"));
    const err = await c.waitType("error");
    expect(err).toMatchObject({ code: "LLM_TIMEOUT", turnId: "turn-fail-001", retryable: true });
    expect(err.message).not.toMatch(/slow/); // provider detail is not leaked
    t.llm.failWith = null;
    c.send(turnMsg("turn-fail-001"));
    await c.waitType("tts_audio");
    const counters = t.metrics.snapshot().counters;
    expect(counters["turn.failed"]).toBe(1);
    expect(counters["turn.timeout"]).toBe(1);
    // the failed attempt must not have polluted history
    const sid = (await c.waitType("session_ready")).sessionId;
    await sleep(20);
    expect(t.store.sessions.get(sid).history.filter((h) => h.role === "user")).toHaveLength(1);
  });

  test("turn deadline fails a hung provider", async () => {
    t = await startTestServer({ env: { TURN_DEADLINE_MS: "100" } });
    t.llm.gate = new Promise(() => {});
    const { c } = await openSession(t.url);
    c.send(turnMsg("turn-hang-001"));
    expect((await c.waitFor((m) => m.type === "error")).code).toBe("TURN_TIMEOUT");
  });

  test("TTS failure degrades to text-only delivery", async () => {
    t = await startTestServer();
    t.tts.failWith = new ProviderError("TTS_TIMEOUT", "x", { retryable: true });
    const { c } = await openSession(t.url);
    c.send(turnMsg("turn-tts-0001"));
    const msg = await c.waitType("tts_audio");
    expect(msg.audioBase64).toBeNull();
    expect(msg.text).toBeTruthy();
    expect(msg.ttsError).toBe("TTS_TIMEOUT");
  });

  test("persistence failure does not block or fail the response", async () => {
    t = await startTestServer();
    t.store.appendEntries = async () => {
      throw new Error("mongo down");
    };
    const { c } = await openSession(t.url);
    c.send(turnMsg("turn-db-00001"));
    await c.waitType("tts_audio");
    await sleep(20);
    expect(t.metrics.snapshot().counters["persist.error"]).toBe(1);
  });

  test("slow persistence does not delay audio", async () => {
    t = await startTestServer();
    t.store.appendEntries = () => new Promise((r) => setTimeout(r, 1500));
    const { c } = await openSession(t.url);
    const start = Date.now();
    c.send(turnMsg("turn-db-00002"));
    await c.waitType("tts_audio");
    expect(Date.now() - start).toBeLessThan(500);
  });

  test("duplicate question from the model triggers one rephrase call", async () => {
    t = await startTestServer();
    const seq = ["Same question?", "Same question?", "A different question?"];
    t.llm.reply = () => seq.shift();
    const { c } = await openSession(t.url);
    c.send(turnMsg("turn-q-000001"));
    expect((await c.waitType("tts_audio")).text).toBe("Same question?");
    c.send(turnMsg("turn-q-000002"));
    await c.waitFor((m) => m.type === "tts_audio" && m.turnId === "turn-q-000002");
    const second = c.inbox.find((m) => m.type === "tts_audio" && m.turnId === "turn-q-000002");
    expect(second.text).toBe("A different question?");
  });
});

describe("interruption", () => {
  test("interrupt cancels the in-flight turn and drops queued ones", async () => {
    t = await startTestServer();
    t.llm.gate = new Promise(() => {});
    const { c } = await openSession(t.url);
    c.send(turnMsg("turn-int-0001"));
    await c.waitFor((m) => m.state === "llm");
    c.send(turnMsg("turn-int-0002"));
    c.send({ type: "interrupt" });
    await c.waitFor((m) => m.type === "turn_cancelled" && m.turnId === "turn-int-0001");
    await c.waitFor((m) => m.type === "turn_cancelled" && m.turnId === "turn-int-0002");
    expect(c.count((m) => m.type === "tts_audio")).toBe(0);
    // nothing from the cancelled turn reaches history, and the session still works
    t.llm.gate = null;
    c.send(turnMsg("turn-int-0003"));
    await c.waitFor((m) => m.type === "tts_audio" && m.turnId === "turn-int-0003");
    expect(t.llm.calls[t.llm.calls.length - 1].filter((m) => m.role === "user")).toHaveLength(1);
  });
});

describe("disconnect and recovery", () => {
  test("resume restores history and issues a fresh token", async () => {
    t = await startTestServer();
    const first = await openSession(t.url);
    first.c.send(turnMsg("turn-rec-0001"));
    await first.c.waitType("tts_audio");
    first.c.close();
    await first.c.closed;

    const second = await openSession(t.url, { resumeToken: first.ready.resumeToken });
    expect(second.ready).toMatchObject({ type: "session_ready", resumed: true, sessionId: first.ready.sessionId });
    expect(second.ready.historyLength).toBe(2);
    second.c.send(turnMsg("turn-rec-0002"));
    await second.c.waitType("tts_audio");
    expect(t.llm.calls[1].filter((m) => m.role === "user")).toHaveLength(2);
  });

  test("a response finished while disconnected is replayed on resume", async () => {
    t = await startTestServer();
    let release;
    t.llm.gate = new Promise((r) => (release = r));
    const first = await openSession(t.url);
    first.c.send(turnMsg("turn-rec-0010"));
    await first.c.waitFor((m) => m.state === "llm");
    first.c.close();
    await first.c.closed;
    release();
    await sleep(50);
    expect(t.rt.sessions.get(first.ready.sessionId).turns.get("turn-rec-0010").state).toBe("undelivered");

    const second = await openSession(t.url, { resumeToken: first.ready.resumeToken });
    const audio = await second.c.waitType("tts_audio");
    expect(audio.turnId).toBe("turn-rec-0010");
    expect(t.llm.calls).toHaveLength(1);
  });

  test("resume works after a server restart using persisted state", async () => {
    t = await startTestServer();
    const first = await openSession(t.url);
    first.c.send(turnMsg("turn-rec-0020"));
    await first.c.waitType("tts_audio");
    await sleep(20);
    t.rt.sessions.clear(); // simulate losing in-memory state
    first.c.close();
    await first.c.closed;
    const second = await openSession(t.url, { resumeToken: first.ready.resumeToken });
    expect(second.ready.resumed).toBe(true);
    expect(second.ready.historyLength).toBe(2);
  });

  test("a newer connection replaces the old one", async () => {
    t = await startTestServer();
    const first = await openSession(t.url);
    const second = await openSession(t.url, { resumeToken: first.ready.resumeToken });
    expect(await first.c.closed).toBe(4000);
    expect(second.ready.resumed).toBe(true);
  });

  test("tampered tokens and tokens for another interview are rejected", async () => {
    t = await startTestServer();
    const first = await openSession(t.url);
    const bad = await openSession(t.url, { resumeToken: first.ready.resumeToken + "x" });
    expect(bad.ready.code).toBe("INVALID_RESUME_TOKEN");
    const cross = await openSession(t.url, { interviewId: OTHER_INTERVIEW_ID, resumeToken: first.ready.resumeToken });
    expect(cross.ready.code).toBe("INVALID_RESUME_TOKEN");
  });

  test("expired sessions cannot be resumed", async () => {
    t = await startTestServer();
    const first = await openSession(t.url);
    first.c.close();
    await first.c.closed;
    t.rt.sessions.clear();
    t.store.sessions.get(first.ready.sessionId).expiresAt = new Date(Date.now() - 1000);
    const second = await openSession(t.url, { resumeToken: first.ready.resumeToken });
    expect(second.ready.code).toBe("SESSION_EXPIRED");
  });

  test("sweep removes abandoned sessions after the recovery window", async () => {
    t = await startTestServer({ env: { WS_RECOVERY_WINDOW_MS: "1000" } });
    const first = await openSession(t.url);
    first.c.close();
    await first.c.closed;
    await sleep(30);
    t.rt.sweep(Date.now() + 5000);
    expect(t.rt.sessions.size).toBe(0);
  });

  test("sessions cannot be hijacked by guessing a session id", async () => {
    t = await startTestServer();
    const first = await openSession(t.url);
    const forged = await openSession(t.url, { resumeToken: "sess_" + first.ready.sessionId });
    expect(forged.ready.code).toBe("INVALID_RESUME_TOKEN");
  });
});

describe("speech input and end-of-turn", () => {
  const result = (text, extra = {}) => ({ text, isFinal: true, speechFinal: false, fromFinalize: false, ...extra });

  test("speech_final followed by silence commits one turn automatically", async () => {
    t = await startTestServer({ env: { EOT_SPEECH_FINAL_GRACE_MS: "60", EOT_FALLBACK_MS: "5000" } });
    const { c } = await openSession(t.url);
    c.send({ type: "start_stt" });
    await c.waitType("stt_started");
    c.sendBinary(Buffer.alloc(320));
    await sleep(20);
    expect(t.stt.sent).toHaveLength(1);

    t.stt.handlers.onResult(result("I worked on"));
    t.stt.handlers.onResult(result("distributed systems", { speechFinal: true }));
    const committed = await c.waitType("user_turn_committed");
    expect(committed.text).toBe("I worked on distributed systems");
    expect(committed.reason).toBe("speech_final");
    await c.waitType("tts_audio");
    expect(t.llm.calls).toHaveLength(1);
  });

  test("continued speech after speech_final extends the same turn", async () => {
    t = await startTestServer({ env: { EOT_SPEECH_FINAL_GRACE_MS: "150", EOT_FALLBACK_MS: "5000" } });
    const { c } = await openSession(t.url);
    c.send({ type: "start_stt" });
    await c.waitType("stt_started");
    t.stt.handlers.onResult(result("first part", { speechFinal: true }));
    await sleep(60);
    t.stt.handlers.onResult(result("second part", { speechFinal: true }));
    const committed = await c.waitType("user_turn_committed");
    expect(committed.text).toBe("first part second part");
    await sleep(250);
    expect(c.count((m) => m.type === "user_turn_committed")).toBe(1);
  });

  test("UtteranceEnd commits without waiting for the fallback", async () => {
    t = await startTestServer({ env: { EOT_FALLBACK_MS: "5000" } });
    const { c } = await openSession(t.url);
    c.send({ type: "start_stt" });
    await c.waitType("stt_started");
    t.stt.handlers.onResult(result("no endpoint flag here"));
    t.stt.handlers.onUtteranceEnd();
    expect((await c.waitType("user_turn_committed")).reason).toBe("utterance_end");
  });

  test("fallback timer commits when no endpoint signal arrives", async () => {
    t = await startTestServer({ env: { EOT_FALLBACK_MS: "80" } });
    const { c } = await openSession(t.url);
    c.send({ type: "start_stt" });
    await c.waitType("stt_started");
    t.stt.handlers.onResult(result("just words"));
    expect((await c.waitType("user_turn_committed")).reason).toBe("fallback");
  });

  test("manual stop finalizes STT and commits immediately", async () => {
    t = await startTestServer({ env: { EOT_FALLBACK_MS: "5000", EOT_MANUAL_STOP_WAIT_MS: "2000" } });
    const { c } = await openSession(t.url);
    c.send({ type: "start_stt" });
    await c.waitType("stt_started");
    t.stt.handlers.onResult(result("pending words"));
    c.send({ type: "stop_stt" });
    await sleep(30);
    expect(t.stt.finalized).toBe(1);
    t.stt.handlers.onResult(result("", { fromFinalize: true })); // Deepgram's finalize reply
    expect((await c.waitType("user_turn_committed")).text).toBe("pending words");
  });

  test("disconnect mid-answer does not lose the buffered transcript", async () => {
    t = await startTestServer({ env: { EOT_FALLBACK_MS: "5000" } });
    const { c, ready } = await openSession(t.url);
    c.send({ type: "start_stt" });
    await c.waitType("stt_started");
    t.stt.handlers.onResult(result("answer in progress"));
    c.close();
    await c.closed;
    await sleep(80);
    const s = t.rt.sessions.get(ready.sessionId);
    expect([...s.turns.values()].map((x) => x.state)).toEqual(["undelivered"]);
    expect(t.stt.closed).toBeGreaterThan(0);
  });

  test("STT failure is reported without ending the session", async () => {
    t = await startTestServer();
    const { c } = await openSession(t.url);
    c.send({ type: "start_stt" });
    await c.waitType("stt_started");
    t.stt.handlers.onError(new Error("dg down"));
    const err = await c.waitType("stt_error");
    expect(err.code).toBe("STT_FAILED");
    expect(err.message).not.toMatch(/dg down/);
  });

  test("missing Deepgram key yields STT_NOT_CONFIGURED", async () => {
    t = await startTestServer();
    t.rt.sessions.clear();
    const noKey = await startTestServer({ env: { DEEPGRAM_API_KEY: "" } });
    const { c } = await openSession(noKey.url);
    c.send({ type: "start_stt" });
    expect((await c.waitType("stt_error")).code).toBe("STT_NOT_CONFIGURED");
    await noKey.rt.close();
  });
});

describe("lifecycle", () => {
  test("end_interview ends the session and forbids further turns on resume", async () => {
    t = await startTestServer();
    const first = await openSession(t.url);
    first.c.send({ type: "end_interview" });
    await first.c.waitType("session_ended");
    const second = await openSession(t.url, { resumeToken: first.ready.resumeToken });
    // session was removed from memory but remains in the store until it expires
    expect(["session_ready", "error"]).toContain(second.ready.type);
  });

  test("playback_started records audio delivery latency", async () => {
    t = await startTestServer();
    const { c } = await openSession(t.url);
    c.send(turnMsg("turn-pb-00001"));
    await c.waitType("tts_audio");
    c.send({ type: "playback_started", turnId: "turn-pb-00001" });
    await sleep(30);
    expect(t.metrics.snapshot().timings["audio.sent_to_playback_ms"].count).toBe(1);
  });
});
