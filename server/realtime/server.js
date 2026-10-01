const crypto = require("crypto");
const WebSocket = require("ws");
const { parseClientMessage } = require("./messages");
const { InterviewSession } = require("./session");
const { createTokenService } = require("./sessionToken");

/**
 * WebSocket transport. Responsibilities: origin check, hello/resume handshake,
 * message validation and rate limiting, heartbeat, and mapping sockets to sessions.
 * All interview logic lives in InterviewSession.
 *
 * deps: { config, store, llm, tts, stt, metrics, log }
 */
function createRealtimeServer({ deps, port, server }) {
  const { config, store, metrics, log } = deps;
  const tokens = createTokenService({ secret: config.tokenSecret, ttlSec: config.resumeTokenTtlSec });
  const sessions = new Map();

  const wss = new WebSocket.Server({
    ...(server ? { server } : { port }),
    maxPayload: config.maxPayloadBytes,
    verifyClient: ({ origin }, done) => {
      if (config.allowedOrigins.length && !config.allowedOrigins.includes(origin)) {
        metrics.inc("ws.origin_rejected");
        return done(false, 403, "Origin not allowed");
      }
      done(true);
    },
  });

  const sessionDeps = { ...deps };
  const sendRaw = (ws, msg) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg));
  const sendError = (ws, code, message, extra = {}) => sendRaw(ws, { type: "error", code, message, ...extra });

  async function handleHello(ws, ctx, msg) {
    if (ctx.session) return sendError(ws, "ALREADY_INITIALIZED", "hello already completed");
    let session = null;
    let resumed = false;

    if (msg.resumeToken) {
      const claims = tokens.verify(msg.resumeToken);
      if (!claims || claims.interviewId !== msg.interviewId) {
        metrics.inc("ws.resume_rejected");
        return sendError(ws, "INVALID_RESUME_TOKEN", "Resume token is invalid or expired");
      }
      session = sessions.get(claims.sessionId);
      if (!session) {
        const doc = await store.loadSession(claims.sessionId);
        if (!doc || new Date(doc.expiresAt).getTime() < Date.now()) {
          return sendError(ws, "SESSION_EXPIRED", "Session expired; start a new interview");
        }
        session = new InterviewSession({
          sessionId: doc.sessionId,
          interviewId: doc.interviewId,
          interviewDetails: doc.interviewDetails,
          history: doc.history,
          expiresAt: doc.expiresAt,
          deps: sessionDeps,
        });
        sessions.set(session.id, session);
      } else if (session.state === "ended" || session.expiresAt < Date.now()) {
        return sendError(ws, "SESSION_EXPIRED", "Session expired; start a new interview");
      }
      resumed = true;
      metrics.inc("ws.session_resumed");
    } else {
      const details = await store.getInterview(msg.interviewId);
      if (!details) return sendError(ws, "INTERVIEW_NOT_FOUND", "Interview not found");
      const sessionId = `sess_${crypto.randomUUID()}`;
      const expiresAt = new Date(Date.now() + config.sessionTtlMs);
      await store.createSession({ sessionId, interviewId: msg.interviewId, interviewDetails: details, expiresAt });
      session = new InterviewSession({
        sessionId,
        interviewId: msg.interviewId,
        interviewDetails: details,
        expiresAt,
        deps: sessionDeps,
      });
      sessions.set(sessionId, session);
      metrics.inc("ws.session_created");
    }

    if (ws.readyState !== WebSocket.OPEN) return session.detach(ws);
    ctx.session = session;
    clearTimeout(ctx.helloTimer);
    session.attach(ws);
    sendRaw(ws, {
      type: "session_ready",
      sessionId: session.id,
      resumeToken: tokens.sign(session.id, session.interviewId),
      resumed,
      historyLength: session.history.length,
      endOfTurn: config.endOfTurn,
    });
    if (resumed) session.replayUndelivered();
  }

  function dispatch(ws, ctx, msg) {
    if (msg.type === "ping") return sendRaw(ws, { type: "pong", t: Date.now() });
    if (msg.type === "hello") return handleHello(ws, ctx, msg);
    const s = ctx.session;
    if (!s) return sendError(ws, "NOT_AUTHENTICATED", "Send hello first");
    switch (msg.type) {
      case "start_interview":
        return s.submitTurn({ turnId: msg.turnId, kind: "greeting" });
      case "user_turn":
        return s.submitTurn({ turnId: msg.turnId, kind: "answer", text: msg.text });
      case "start_stt":
        return s.startStt();
      case "audio_chunk":
        return s.sendAudio(msg.audio);
      case "stop_stt":
        return s.stopStt();
      case "interrupt":
        return s.interrupt();
      case "playback_started":
        return s.notePlaybackStarted(msg.turnId);
      case "end_interview":
        s.end("client_ended");
        sessions.delete(s.id);
        return;
    }
  }

  wss.on("connection", (ws) => {
    metrics.inc("ws.connections");
    const ctx = { session: null, chain: Promise.resolve(), pending: 0, windowStart: Date.now(), count: 0 };
    ws.isAlive = true;
    ws.on("pong", () => (ws.isAlive = true));
    ctx.helloTimer = setTimeout(() => ws.close(4001, "hello timeout"), config.helloTimeoutMs);

    ws.on("message", (data, isBinary) => {
      // Audio is high-frequency and exempt from the control-message rate limit.
      const parsed = parseClientMessage(data, isBinary, {
        maxTextChars: config.maxTextChars,
        maxBytes: config.maxPayloadBytes,
      });
      if (!parsed.ok) {
        metrics.inc("ws.invalid_message");
        return sendError(ws, parsed.code, parsed.message);
      }
      const { msg } = parsed;
      if (msg.type !== "audio_chunk") {
        const now = Date.now();
        if (now - ctx.windowStart > config.messageRate.windowMs) Object.assign(ctx, { windowStart: now, count: 0 });
        if (++ctx.count > config.messageRate.max) {
          metrics.inc("ws.rate_limited");
          return sendError(ws, "RATE_LIMITED", "Too many messages", { retryable: true });
        }
      }
      if (ctx.pending >= config.maxPendingInbound) {
        metrics.inc("ws.inbound_dropped");
        return;
      }
      ctx.pending += 1;
      // Handle each connection's messages in arrival order.
      ctx.chain = ctx.chain
        .then(() => dispatch(ws, ctx, msg))
        .catch((e) => {
          log.error("ws.handler_failed", { message: e.message });
          sendError(ws, "INTERNAL", "Internal error");
        })
        .finally(() => {
          ctx.pending -= 1;
        });
    });

    ws.on("close", () => {
      clearTimeout(ctx.helloTimer);
      ctx.session?.detach(ws);
    });
    ws.on("error", (e) => log.warn("ws.socket_error", { message: e.message }));
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        metrics.inc("ws.heartbeat_terminated");
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, config.heartbeatMs);
  heartbeat.unref();

  /** Drops expired sessions and sessions detached longer than the recovery window. */
  function sweep(now = Date.now()) {
    for (const [id, s] of sessions) {
      const expired = s.expiresAt < now && !s.hasActiveTurn;
      const abandoned = !s.ws && s.detachedAt && now - s.detachedAt > config.recoveryWindowMs && !s.hasActiveTurn;
      if (expired || abandoned) {
        s.end(expired ? "expired" : "abandoned");
        sessions.delete(id);
        metrics.inc(expired ? "session.expired" : "session.abandoned");
      }
    }
  }
  const sweeper = setInterval(sweep, config.sweepIntervalMs);
  sweeper.unref();

  async function close() {
    clearInterval(heartbeat);
    clearInterval(sweeper);
    for (const s of sessions.values()) s.end("server_shutdown");
    sessions.clear();
    for (const ws of wss.clients) ws.terminate();
    await new Promise((r) => wss.close(r));
  }

  return { wss, sessions, sweep, close, port: () => wss.address()?.port };
}

module.exports = { createRealtimeServer };
