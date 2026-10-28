const int = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

function loadRealtimeConfig(env = process.env) {
  return {
    maxPayloadBytes: int(env.WS_MAX_PAYLOAD_BYTES, 128 * 1024),
    maxTextChars: int(env.WS_MAX_TEXT_CHARS, 4000),
    helloTimeoutMs: int(env.WS_HELLO_TIMEOUT_MS, 10000),
    heartbeatMs: int(env.WS_HEARTBEAT_MS, 30000),
    allowedOrigins: (env.CORS_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean),
    messageRate: { max: int(env.WS_MSG_RATE_MAX, 40), windowMs: int(env.WS_MSG_RATE_WINDOW_MS, 10000) },
    maxPendingInbound: int(env.WS_MAX_PENDING_INBOUND, 500),
    maxQueuedTurns: int(env.WS_MAX_QUEUED_TURNS, 3),
    maxOutboundBufferBytes: int(env.WS_MAX_OUTBOUND_BUFFER, 2 * 1024 * 1024),

    sessionTtlMs: int(env.SESSION_TTL_MS, 15 * 60 * 1000),
    recoveryWindowMs: int(env.WS_RECOVERY_WINDOW_MS, 2 * 60 * 1000),
    sweepIntervalMs: int(env.WS_SWEEP_INTERVAL_MS, 30 * 1000),
    resumeTokenTtlSec: int(env.WS_RESUME_TOKEN_TTL_SEC, 2 * 60 * 60),
    tokenSecret: env.WS_TOKEN_SECRET || null,

    turnDeadlineMs: int(env.TURN_DEADLINE_MS, 30000),

    endOfTurn: {
      // After Deepgram `speech_final`, wait this long for the candidate to continue.
      speechFinalGraceMs: int(env.EOT_SPEECH_FINAL_GRACE_MS, 1200),
      // Commit after Deepgram `UtteranceEnd` (silence of utteranceEndMs), after this grace.
      utteranceEndGraceMs: int(env.EOT_UTTERANCE_END_GRACE_MS, 0),
      // If no endpoint signal arrives, commit this long after the last final fragment.
      fallbackMs: int(env.EOT_FALLBACK_MS, 3000),
      // After a manual stop, wait this long for trailing results before committing.
      manualStopWaitMs: int(env.EOT_MANUAL_STOP_WAIT_MS, 600),
    },

    deepgram: {
      apiKey: env.DEEPGRAM_API_KEY || null,
      model: env.DEEPGRAM_MODEL || "nova-2",
      endpointingMs: int(env.DEEPGRAM_ENDPOINTING_MS, 500),
      // Deepgram requires utterance_end_ms >= 1000.
      utteranceEndMs: Math.max(1000, int(env.DEEPGRAM_UTTERANCE_END_MS, 1000)),
      keepAliveMs: 5000,
      maxBufferedBytes: int(env.DEEPGRAM_MAX_BUFFERED_BYTES, 1024 * 1024),
    },

    llm: {
      projectNumber: env.VERTEX_PROJECT_NUMBER || null,
      endpointId: env.VERTEX_ENDPOINT_ID || null,
      location: env.VERTEX_LOCATION || "us-central1",
      timeoutMs: int(env.LLM_TIMEOUT_MS, 15000),
      retries: int(env.LLM_RETRIES, 1),
      maxTokens: int(env.LLM_MAX_TOKENS, 50),
      temperature: 0.7,
      topP: 0.8,
    },

    tts: {
      timeoutMs: int(env.TTS_TIMEOUT_MS, 10000),
      retries: int(env.TTS_RETRIES, 1),
      languageCode: "en-US",
      voiceName: "en-US-Standard-C",
    },
  };
}

module.exports = { loadRealtimeConfig };
