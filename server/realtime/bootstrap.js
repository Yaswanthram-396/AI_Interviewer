const crypto = require("crypto");
const { GoogleAuth } = require("google-auth-library");
const { TextToSpeechClient } = require("@google-cloud/text-to-speech");
const { loadRealtimeConfig } = require("./config");
const { createLogger } = require("./logger");
const { Metrics } = require("./metrics");
const { createMongoStore } = require("./store");
const { createVertexChat } = require("./providers/vertexChat");
const { createGoogleTts } = require("./providers/googleTts");
const { createDeepgramStt } = require("./providers/deepgramStt");
const { createRealtimeServer } = require("./server");

/** Wires real providers (Vertex, Google TTS, Deepgram, MongoDB) into the realtime server. */
function startRealtimeServer({ port, env = process.env } = {}) {
  const log = createLogger({ component: "realtime" });
  const config = loadRealtimeConfig(env);

  if (!config.tokenSecret) {
    if (env.NODE_ENV === "production") throw new Error("WS_TOKEN_SECRET must be set in production");
    config.tokenSecret = crypto.randomBytes(32).toString("hex");
    log.warn("config.ephemeral_token_secret", { note: "WS_TOKEN_SECRET not set; resume tokens reset on restart" });
  }
  for (const [k, v] of [
    ["DEEPGRAM_API_KEY", config.deepgram.apiKey],
    ["VERTEX_PROJECT_NUMBER", config.llm.projectNumber],
    ["VERTEX_ENDPOINT_ID", config.llm.endpointId],
  ]) {
    if (!v) log.warn("config.missing", { variable: k });
  }

  // GOOGLE_APPLICATION_CREDENTIALS is set by index.js from GCP_CREDENTIALS_JSON before this runs.
  const auth = new GoogleAuth({ scopes: "https://www.googleapis.com/auth/cloud-platform" });
  const getAccessToken = async () => {
    const t = await auth.getAccessToken(); // cached and refreshed by google-auth-library
    return t?.token || t;
  };

  const metrics = new Metrics();
  const deps = {
    config,
    log,
    metrics,
    store: createMongoStore({
      InterviewSession: require("../models/interviewSession.model"),
      Interview: require("../models/Interview"),
    }),
    llm: createVertexChat({ config: config.llm, getAccessToken, log }),
    tts: createGoogleTts({ client: new TextToSpeechClient(), config: config.tts, log }),
    stt: createDeepgramStt({ config: config.deepgram, log }),
  };
  const rt = createRealtimeServer({ deps, port });
  log.info("realtime.listening", { port });
  return { ...rt, metrics, config };
}

module.exports = { startRealtimeServer };
