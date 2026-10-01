const { EndOfTurnDetector } = require("../realtime/endOfTurn");
const { Metrics } = require("../realtime/metrics");
const { parseClientMessage } = require("../realtime/messages");
const { createVertexChat, extractText } = require("../realtime/providers/vertexChat");
const { createGoogleTts } = require("../realtime/providers/googleTts");
const { ProviderError, withRetry } = require("../realtime/util");

describe("EndOfTurnDetector", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  const make = () => {
    const commits = [];
    const d = new EndOfTurnDetector({
      speechFinalGraceMs: 1000,
      utteranceEndGraceMs: 0,
      fallbackMs: 3000,
      onCommit: (c) => commits.push(c),
    });
    return { d, commits };
  };

  test("commits after speech_final grace", () => {
    const { d, commits } = make();
    d.addFinal("hello there", { speechFinal: true });
    jest.advanceTimersByTime(999);
    expect(commits).toHaveLength(0);
    jest.advanceTimersByTime(2);
    expect(commits).toEqual([expect.objectContaining({ text: "hello there", reason: "speech_final" })]);
  });

  test("new speech cancels the pending commit and fragments are joined", () => {
    const { d, commits } = make();
    d.addFinal("one", { speechFinal: true });
    jest.advanceTimersByTime(500);
    d.noteSpeech();
    jest.advanceTimersByTime(5000);
    expect(commits).toHaveLength(0);
    d.addFinal("two", { speechFinal: true });
    jest.advanceTimersByTime(1000);
    expect(commits[0].text).toBe("one two");
  });

  test("fallback fires without endpoint signals; utteranceEnd is faster", () => {
    const a = make();
    a.d.addFinal("x");
    jest.advanceTimersByTime(3000);
    expect(a.commits[0].reason).toBe("fallback");
    const b = make();
    b.d.addFinal("y");
    b.d.utteranceEnd();
    jest.advanceTimersByTime(0);
    expect(b.commits[0].reason).toBe("utterance_end");
  });

  test("flush commits once; empty flush and empty fragments do nothing", () => {
    const { d, commits } = make();
    d.addFinal("   ");
    d.flush();
    d.addFinal("a");
    d.flush();
    d.flush();
    jest.runAllTimers();
    expect(commits.map((c) => c.text)).toEqual(["a"]);
  });
});

describe("Metrics", () => {
  test("percentiles are withheld until enough samples exist", () => {
    const m = new Metrics();
    for (let i = 1; i <= 4; i++) m.observe("x", i);
    expect(m.snapshot().timings.x.p50).toBeNull();
    for (let i = 5; i <= 100; i++) m.observe("x", i);
    const s = m.snapshot().timings.x;
    expect(s).toMatchObject({ count: 100, p50: 50, p95: 95, p99: 99 });
  });
});

describe("parseClientMessage", () => {
  test("binary frames become audio; empty/oversized are rejected", () => {
    expect(parseClientMessage(Buffer.alloc(10), true).msg.type).toBe("audio_chunk");
    expect(parseClientMessage(Buffer.alloc(0), true).ok).toBe(false);
    expect(parseClientMessage(Buffer.alloc(200), true, { maxBytes: 100 }).ok).toBe(false);
  });
  test("hello requires an ObjectId-shaped interviewId", () => {
    expect(parseClientMessage("{\"type\":\"hello\",\"interviewId\":\"../etc\"}", false).ok).toBe(false);
    expect(parseClientMessage("{\"type\":\"hello\",\"interviewId\":\"64b000000000000000000001\"}", false).ok).toBe(true);
  });
  test("prototype-pollution style payloads are just invalid", () => {
    expect(parseClientMessage("{\"__proto__\":{\"x\":1}}", false).ok).toBe(false);
  });
});

describe("vertexChat", () => {
  const cfg = { projectNumber: "123", endpointId: "456", location: "us-central1", timeoutMs: 100, retries: 1, maxTokens: 50, temperature: 0.7, topP: 0.8 };
  const ok = (content) => ({ data: { predictions: { choices: [{ message: { content } }] } } });

  test("extracts both documented response shapes", () => {
    expect(extractText(ok("  hi ").data)).toBe("hi");
    expect(extractText({ predictions: [{ choices: [{ message: { content: "arr" } }] }] })).toBe("arr");
    expect(extractText({})).toBe("");
  });

  test("retries 5xx once then succeeds", async () => {
    const post = jest.fn().mockRejectedValueOnce({ response: { status: 503 } }).mockResolvedValueOnce(ok("fine"));
    const llm = createVertexChat({ config: cfg, getAccessToken: async () => "tok", http: { post } });
    const r = await llm.complete({ messages: [] });
    expect(r.text).toBe("fine");
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[0][2].headers.Authorization).toBe("Bearer tok");
  });

  test("does not retry 4xx", async () => {
    const post = jest.fn().mockRejectedValue({ response: { status: 400 } });
    const llm = createVertexChat({ config: cfg, getAccessToken: async () => "t", http: { post } });
    await expect(llm.complete({ messages: [] })).rejects.toMatchObject({ code: "LLM_UPSTREAM", retryable: false });
    expect(post).toHaveBeenCalledTimes(1);
  });

  test("times out a hung request and aborts the HTTP call", async () => {
    let aborted = false;
    const post = jest.fn((_u, _b, { signal }) => new Promise((_, rej) => signal.addEventListener("abort", () => ((aborted = true), rej({ code: "ERR_CANCELED" })))));
    const llm = createVertexChat({ config: { ...cfg, retries: 0 }, getAccessToken: async () => "t", http: { post } });
    await expect(llm.complete({ messages: [] })).rejects.toMatchObject({ code: "LLM_TIMEOUT" });
    expect(aborted).toBe(true);
  });

  test("caller abort is reported as ABORTED, not a timeout", async () => {
    const post = jest.fn((_u, _b, { signal }) => new Promise((_, rej) => signal.addEventListener("abort", () => rej({ code: "ERR_CANCELED" }))));
    const llm = createVertexChat({ config: { ...cfg, timeoutMs: 5000 }, getAccessToken: async () => "t", http: { post } });
    const ac = new AbortController();
    const p = llm.complete({ messages: [], signal: ac.signal });
    setTimeout(() => ac.abort(), 10);
    await expect(p).rejects.toMatchObject({ code: "ABORTED" });
  });

  test("empty model output is an error, not a canned reply", async () => {
    const post = jest.fn().mockResolvedValue(ok("   "));
    const llm = createVertexChat({ config: { ...cfg, retries: 0 }, getAccessToken: async () => "t", http: { post } });
    await expect(llm.complete({ messages: [] })).rejects.toMatchObject({ code: "LLM_EMPTY" });
  });

  test("missing endpoint configuration fails clearly", async () => {
    const llm = createVertexChat({ config: { ...cfg, endpointId: null }, getAccessToken: async () => "t", http: { post: jest.fn() } });
    await expect(llm.complete({ messages: [] })).rejects.toMatchObject({ code: "LLM_CONFIG" });
  });
});

describe("googleTts", () => {
  const cfg = { timeoutMs: 50, retries: 1, languageCode: "en-US", voiceName: "v" };
  test("times out and retries", async () => {
    const client = { synthesizeSpeech: jest.fn().mockReturnValueOnce(new Promise(() => {})).mockResolvedValueOnce([{ audioContent: Buffer.from("abc") }]) };
    const r = await createGoogleTts({ client, config: cfg }).synthesize({ text: "hi" });
    expect(Buffer.from(r.audioBase64, "base64").toString()).toBe("abc");
    expect(client.synthesizeSpeech).toHaveBeenCalledTimes(2);
  });
  test("empty audio is an error", async () => {
    const client = { synthesizeSpeech: jest.fn().mockResolvedValue([{ audioContent: Buffer.alloc(0) }]) };
    await expect(createGoogleTts({ client, config: { ...cfg, retries: 0 } }).synthesize({ text: "hi" })).rejects.toMatchObject({ code: "TTS_EMPTY" });
  });
});

describe("withRetry", () => {
  test("never retries non-retryable errors", async () => {
    const fn = jest.fn().mockRejectedValue(new ProviderError("X", "x", { retryable: false }));
    await expect(withRetry(fn, { retries: 3, backoffMs: 1 })).rejects.toThrow("x");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
