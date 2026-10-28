const WebSocket = require("ws");
const { loadRealtimeConfig } = require("../realtime/config");
const { createLogger } = require("../realtime/logger");
const { Metrics } = require("../realtime/metrics");
const { createMemoryStore } = require("../realtime/store");
const { createRealtimeServer } = require("../realtime/server");

const INTERVIEW_ID = "64b000000000000000000001";
const OTHER_INTERVIEW_ID = "64b000000000000000000002";

/** Controllable fake LLM: records calls and lets a test hold/fail responses. */
function createFakeLlm() {
  const llm = {
    calls: [],
    inFlight: 0,
    maxInFlight: 0,
    gate: null, // promise to await before answering
    failWith: null,
    reply: (n) => `Question number ${n}?`,
    async complete({ messages, signal }) {
      llm.calls.push(messages);
      llm.inFlight += 1;
      llm.maxInFlight = Math.max(llm.maxInFlight, llm.inFlight);
      try {
        if (llm.gate) {
          await Promise.race([
            llm.gate,
            new Promise((_, rej) => signal?.addEventListener("abort", () => rej(Object.assign(new Error("a"), { code: "ABORTED" })))),
          ]);
        }
        if (llm.failWith) throw llm.failWith;
        return { text: llm.reply(llm.calls.length), durationMs: 5 };
      } finally {
        llm.inFlight -= 1;
      }
    },
  };
  return llm;
}

function createFakeTts() {
  const tts = {
    calls: 0,
    failWith: null,
    async synthesize({ text }) {
      tts.calls += 1;
      if (tts.failWith) throw tts.failWith;
      return { audioBase64: Buffer.from(`audio:${text}`).toString("base64"), durationMs: 3 };
    },
  };
  return tts;
}

/** Fake Deepgram: tests drive results through `stt.handlers`. */
function createFakeStt() {
  const stt = {
    handlers: null,
    sent: [],
    finalized: 0,
    closed: 0,
    open(handlers) {
      stt.handlers = handlers;
      setImmediate(() => handlers.onOpen?.());
      return {
        send: (b) => (stt.sent.push(b), true),
        finalize: () => {
          stt.finalized += 1;
        },
        close: () => {
          stt.closed += 1;
        },
      };
    },
  };
  return stt;
}

async function startTestServer(overrides = {}) {
  const config = loadRealtimeConfig({
    WS_TOKEN_SECRET: "test-secret",
    DEEPGRAM_API_KEY: "dg-test",
    WS_HEARTBEAT_MS: "60000",
    LLM_RETRIES: "0",
    ...overrides.env,
  });
  Object.assign(config, overrides.config);
  const store = overrides.store || createMemoryStore({
    interviews: {
      [INTERVIEW_ID]: { title: "Backend Engineer", description: "d", difficulty: "Beginner" },
      [OTHER_INTERVIEW_ID]: { title: "Other", description: "d", difficulty: "Beginner" },
    },
  });
  const llm = createFakeLlm();
  const tts = createFakeTts();
  const stt = createFakeStt();
  const metrics = new Metrics();
  const log = createLogger({}, { level: "error", write: () => {} });
  const rt = createRealtimeServer({ deps: { config, store, llm, tts, stt, metrics, log }, port: 0 });
  await new Promise((r) => rt.wss.on("listening", r));
  return { rt, config, store, llm, tts, stt, metrics, url: `ws://127.0.0.1:${rt.port()}` };
}

/** WS test client that queues received messages and lets tests await specific ones. */
function connect(url, options) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, options);
    const inbox = [];
    const waiters = [];
    ws.on("message", (data, isBinary) => {
      if (isBinary) return;
      const msg = JSON.parse(data.toString());
      inbox.push(msg);
      for (const w of [...waiters]) w.check();
    });
    const client = {
      ws,
      inbox,
      send: (m) => ws.send(typeof m === "string" ? m : JSON.stringify(m)),
      sendBinary: (b) => ws.send(b),
      /** Resolve with the first (already received or future) message matching `pred`. */
      waitFor(pred, timeoutMs = 2000) {
        return new Promise((res, rej) => {
          const w = {
            check: () => {
              const m = inbox.find(pred);
              if (m) {
                waiters.splice(waiters.indexOf(w), 1);
                clearTimeout(t);
                res(m);
              }
            },
          };
          const t = setTimeout(() => {
            waiters.splice(waiters.indexOf(w), 1);
            rej(new Error(`timeout waiting for message; inbox=${JSON.stringify(inbox.map((m) => m.type + (m.code ? ":" + m.code : "")))}`));
          }, timeoutMs);
          waiters.push(w);
          w.check();
        });
      },
      waitType: (type, timeoutMs) => client.waitFor((m) => m.type === type, timeoutMs),
      count: (pred) => inbox.filter(pred).length,
      closed: new Promise((r) => ws.on("close", (code) => r(code))),
      close: () => ws.close(),
    };
    ws.on("open", () => resolve(client));
    ws.on("error", reject);
  });
}

async function openSession(url, { interviewId = INTERVIEW_ID, resumeToken } = {}) {
  const c = await connect(url);
  c.send({ type: "hello", interviewId, resumeToken });
  const ready = await c.waitFor((m) => m.type === "session_ready" || m.type === "error");
  return { c, ready };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { startTestServer, connect, openSession, sleep, INTERVIEW_ID, OTHER_INTERVIEW_ID };
