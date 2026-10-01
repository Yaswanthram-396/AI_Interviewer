const crypto = require("crypto");
const { performance } = require("perf_hooks");
const { EndOfTurnDetector } = require("./endOfTurn");
const { buildSystemInstruction, GREETING_INSTRUCTION, REPHRASE_INSTRUCTION } = require("./prompt");

const TURN = Object.freeze({
  QUEUED: "queued",
  LLM: "llm",
  TTS: "tts",
  DELIVERED: "delivered",
  UNDELIVERED: "undelivered", // response ready but client was disconnected
  CANCELLED: "cancelled",
  FAILED: "failed",
});
const ACTIVE = new Set([TURN.QUEUED, TURN.LLM, TURN.TTS]);
const MAX_TURN_RECORDS = 200;

const norm = (s) => s.toLowerCase().trim();

/**
 * One interview, independent of any particular socket. Owns turn state,
 * serialization, STT/end-of-turn handling and persistence. A socket can attach,
 * detach and re-attach (session recovery) without losing state.
 */
class InterviewSession {
  constructor({ sessionId, interviewId, interviewDetails, history = [], expiresAt, deps }) {
    this.id = sessionId;
    this.interviewId = interviewId;
    this.details = interviewDetails;
    this.history = history.map((h) => ({ role: h.role, content: h.content }));
    this.expiresAt = expiresAt ? new Date(expiresAt).getTime() : Date.now() + deps.config.sessionTtlMs;
    this.deps = deps;
    this.log = deps.log.child({ sessionId });
    this.state = "active"; // active | ended
    this.ws = null;
    this.detachedAt = null;
    this.turns = new Map();
    this.queue = [];
    this.running = null; // { turn, abort }
    this.persistChain = Promise.resolve();
    this.stt = null;
    this.sttStopTimer = null;
    this.droppedAudio = 0;
    this.detector = new EndOfTurnDetector({
      ...deps.config.endOfTurn,
      onCommit: (c) => this._onSpeechCommit(c),
    });
  }

  // ---- socket attachment ---------------------------------------------------

  attach(ws) {
    if (this.ws && this.ws !== ws) {
      try {
        this.ws.close(4000, "replaced by a newer connection");
      } catch {
        /* ignore */
      }
    }
    this.ws = ws;
    this.detachedAt = null;
  }

  detach(ws) {
    if (this.ws !== ws) return;
    this.ws = null;
    this.detachedAt = Date.now();
    this._closeStt(); // flushes any buffered answer into a turn
  }

  /** Re-sends responses the client never received (called after a resume). */
  replayUndelivered() {
    for (const turn of this.turns.values()) {
      if (turn.state === TURN.UNDELIVERED) this._sendResponse(turn);
    }
  }

  send(msg) {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) return false;
    if (ws.bufferedAmount > this.deps.config.maxOutboundBufferBytes) {
      this.deps.metrics.inc("ws.outbound_backpressure");
      return false;
    }
    ws.send(JSON.stringify(msg));
    return true;
  }

  // ---- turns ---------------------------------------------------------------

  /**
   * Queue a turn. Idempotent per turnId: an in-flight duplicate is ignored, a
   * completed duplicate replays the stored response, a failed/cancelled turn re-runs.
   */
  submitTurn({ turnId, kind, text = "" }) {
    if (this.state !== "active") {
      return this.send({ type: "error", code: "SESSION_ENDED", message: "Session has ended", turnId });
    }
    const existing = this.turns.get(turnId);
    if (existing) {
      this.deps.metrics.inc("turn.duplicate");
      if (ACTIVE.has(existing.state)) {
        return this.send({ type: "turn_state", turnId, state: existing.state, duplicate: true });
      }
      if (existing.state === TURN.DELIVERED || existing.state === TURN.UNDELIVERED) {
        return this._sendResponse(existing);
      }
      // failed / cancelled: fall through and re-run with the same id
    }
    if (this.queue.length >= this.deps.config.maxQueuedTurns) {
      this.deps.metrics.inc("turn.rejected_busy");
      return this.send({ type: "error", code: "BUSY", message: "Too many pending turns", turnId, retryable: true });
    }
    const turn = { turnId, kind, text, state: TURN.QUEUED, createdAt: performance.now() };
    this.turns.set(turnId, turn);
    this._trimTurns();
    this.queue.push(turn);
    this.send({ type: "turn_state", turnId, state: TURN.QUEUED });
    this._pump();
  }

  /** Cancel the in-flight turn and drop queued ones (candidate interruption). */
  interrupt() {
    for (const t of this.queue.splice(0)) this._cancel(t, "interrupt");
    if (this.running) {
      this.running.turn.cancelReason = "interrupt";
      this.running.abort.abort();
    }
  }

  _cancel(turn, reason) {
    turn.state = TURN.CANCELLED;
    turn.cancelReason = reason;
    this.deps.metrics.inc("turn.cancelled");
    this.send({ type: "turn_cancelled", turnId: turn.turnId, reason });
  }

  _trimTurns() {
    if (this.turns.size <= MAX_TURN_RECORDS) return;
    for (const [id, t] of this.turns) {
      if (!ACTIVE.has(t.state)) this.turns.delete(id);
      if (this.turns.size <= MAX_TURN_RECORDS) break;
    }
  }

  async _pump() {
    if (this.running) return;
    while (this.queue.length && this.state === "active") {
      const turn = this.queue.shift();
      if (turn.state !== TURN.QUEUED) continue;
      await this._runTurn(turn);
    }
  }

  _setState(turn, state) {
    turn.state = state;
    this.send({ type: "turn_state", turnId: turn.turnId, state });
  }

  _buildMessages(turn) {
    const jobTitle = this.details?.title || "Software Engineer";
    const difficulty = jobTitle.toLowerCase().includes("senior") ? "Advanced" : this.details?.difficulty || "Beginner";
    const messages = [{ role: "system", content: buildSystemInstruction({ jobTitle, difficulty }) }, ...this.history];
    messages.push({ role: "user", content: turn.kind === "greeting" ? GREETING_INSTRUCTION : turn.text });
    return messages;
  }

  _isDuplicateQuestion(text) {
    const n = norm(text);
    return this.history.some((m) => m.role === "assistant" && norm(m.content) === n);
  }

  async _runTurn(turn) {
    const { config, llm, tts, metrics } = this.deps;
    const abort = new AbortController();
    this.running = { turn, abort };
    const deadline = setTimeout(() => {
      turn.cancelReason = "deadline";
      abort.abort();
    }, config.turnDeadlineMs);
    const log = this.log.child({ turnId: turn.turnId });
    const t0 = performance.now();
    try {
      this._setState(turn, TURN.LLM);
      const messages = this._buildMessages(turn);
      let reply = await llm.complete({ messages, signal: abort.signal, requestId: turn.turnId });
      metrics.observe("llm.duration_ms", reply.durationMs);
      if (this._isDuplicateQuestion(reply.text)) {
        metrics.inc("llm.duplicate_question");
        const retry = await llm.complete({
          messages: [...messages, { role: "user", content: REPHRASE_INSTRUCTION }],
          signal: abort.signal,
          requestId: turn.turnId,
        });
        metrics.observe("llm.duration_ms", retry.durationMs);
        if (retry.text && !this._isDuplicateQuestion(retry.text)) reply = retry;
      }
      if (abort.signal.aborted) throw Object.assign(new Error("aborted"), { code: "ABORTED" });

      turn.reply = reply.text;
      const entries = [];
      if (turn.kind === "answer") entries.push({ role: "user", content: turn.text, turnId: turn.turnId });
      entries.push({ role: "assistant", content: reply.text, turnId: turn.turnId });
      this.history.push(...entries.map(({ role, content }) => ({ role, content })));
      this.expiresAt = Date.now() + config.sessionTtlMs;
      this._persist(entries); // not awaited: persistence must not delay audio

      this._setState(turn, TURN.TTS);
      try {
        const audio = await tts.synthesize({ text: reply.text, signal: abort.signal, requestId: turn.turnId });
        metrics.observe("tts.duration_ms", audio.durationMs);
        turn.audioBase64 = audio.audioBase64;
      } catch (e) {
        if (abort.signal.aborted) throw e;
        // Degrade gracefully: deliver the text so the candidate is not stuck.
        metrics.inc("tts.error");
        log.warn("turn.tts_failed", { code: e.code });
        turn.audioBase64 = null;
        turn.ttsError = e.code || "TTS_FAILED";
      }
      if (abort.signal.aborted) throw Object.assign(new Error("aborted"), { code: "ABORTED" });

      turn.totalMs = performance.now() - t0;
      metrics.observe("turn.total_ms", turn.totalMs);
      metrics.inc("turn.completed");
      this._sendResponse(turn);
      log.info("turn.completed", { totalMs: Math.round(turn.totalMs), replyChars: reply.text.length, ttsError: turn.ttsError });
    } catch (e) {
      if (turn.cancelReason === "interrupt") {
        this._cancel(turn, "interrupt");
      } else {
        const code = turn.cancelReason === "deadline" ? "TURN_TIMEOUT" : e.code || "TURN_FAILED";
        turn.state = TURN.FAILED;
        metrics.inc("turn.failed");
        if (/TIMEOUT/.test(code)) metrics.inc("turn.timeout");
        log.error("turn.failed", { code });
        this.send({
          type: "error",
          code,
          turnId: turn.turnId,
          retryable: true,
          message: "The interviewer could not respond. Please try again.",
        });
      }
    } finally {
      clearTimeout(deadline);
      this.running = null;
    }
  }

  _sendResponse(turn) {
    const sent = this.send({
      type: "tts_audio",
      turnId: turn.turnId,
      text: turn.reply,
      audioBase64: turn.audioBase64 ?? null,
      ttsError: turn.ttsError,
    });
    turn.sentAt = sent ? performance.now() : turn.sentAt;
    turn.state = sent ? TURN.DELIVERED : TURN.UNDELIVERED;
    if (!sent) this.deps.metrics.inc("turn.undelivered");
  }

  notePlaybackStarted(turnId) {
    const turn = this.turns.get(turnId);
    if (turn?.sentAt && !turn.playbackRecorded) {
      turn.playbackRecorded = true;
      this.deps.metrics.observe("audio.sent_to_playback_ms", performance.now() - turn.sentAt);
    }
  }

  _persist(entries) {
    const { store, metrics } = this.deps;
    const expiresAt = new Date(this.expiresAt);
    this.persistChain = this.persistChain
      .then(() => store.appendEntries(this.id, { entries, expiresAt }))
      .catch((e) => {
        metrics.inc("persist.error");
        this.log.error("persist.failed", { message: e.message });
      });
  }

  // ---- speech input --------------------------------------------------------

  _onSpeechCommit({ text, reason, waitedMs }) {
    this.deps.metrics.observe("eot.final_to_commit_ms", waitedMs);
    this.deps.metrics.inc(`eot.reason.${reason}`);
    const turnId = `srv_${crypto.randomUUID()}`;
    this.send({ type: "user_turn_committed", turnId, text, reason });
    this.submitTurn({ turnId, kind: "answer", text });
  }

  startStt() {
    const { stt, config, metrics } = this.deps;
    if (!config.deepgram.apiKey) {
      return this.send({ type: "stt_error", code: "STT_NOT_CONFIGURED", message: "Speech recognition is not configured" });
    }
    this._closeStt();
    this.detector.reset();
    const stream = stt.open({
      onOpen: () => this.send({ type: "stt_started", sessionId: this.id }),
      onResult: ({ text, isFinal, speechFinal, fromFinalize, confidence }) => {
        if (text.trim()) {
          if (isFinal) {
            this.send({ type: "final_transcript", transcript: text, confidence });
            this.detector.addFinal(text, { speechFinal });
          } else {
            this.send({ type: "interim_transcript", transcript: text });
            this.detector.noteSpeech();
          }
        }
        if (fromFinalize) this.detector.flush("manual");
      },
      onUtteranceEnd: () => this.detector.utteranceEnd(),
      onSpeechStarted: () => {
        this.detector.noteSpeech();
        this.send({ type: "speech_started" });
      },
      onError: () => {
        metrics.inc("stt.error");
        this.send({ type: "stt_error", code: "STT_FAILED", message: "Speech recognition failed" });
      },
      onClose: () => {
        if (this.stt === stream) this.stt = null;
        this.detector.flush("stt_closed");
      },
    });
    this.stt = stream;
  }

  sendAudio(buf) {
    if (!this.stt || !this.stt.send(buf)) {
      this.droppedAudio += 1;
      if (this.droppedAudio % 100 === 1) this.deps.metrics.inc("stt.audio_dropped");
    }
  }

  /** Manual stop: finalize STT, then commit whatever was heard. */
  stopStt() {
    if (!this.stt) return this.detector.flush("manual");
    const stream = this.stt;
    stream.finalize();
    clearTimeout(this.sttStopTimer);
    this.sttStopTimer = setTimeout(() => {
      this.detector.flush("manual");
      stream.close();
      if (this.stt === stream) this.stt = null;
    }, this.deps.config.endOfTurn.manualStopWaitMs);
  }

  _closeStt() {
    clearTimeout(this.sttStopTimer);
    const stream = this.stt;
    this.stt = null;
    this.detector.flush("disconnect");
    stream?.close();
  }

  // ---- lifecycle -----------------------------------------------------------

  end(reason = "ended") {
    if (this.state === "ended") return;
    this.state = "ended";
    this.interrupt();
    this._closeStt();
    this.detector.reset();
    this.send({ type: "session_ended", reason, message: "Interview ended" });
  }

  get hasActiveTurn() {
    return !!this.running || this.queue.length > 0;
  }
}

module.exports = { InterviewSession, TURN };
