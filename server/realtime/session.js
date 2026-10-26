const crypto = require("crypto");
const { performance } = require("perf_hooks");
const { EndOfTurnDetector } = require("./endOfTurn");
const { buildSystemInstruction, GREETING_INSTRUCTION, REPHRASE_INSTRUCTION } = require("./prompt");
const { InterviewEngine } = require("./interview/engine");
const { ConversationState, STATE } = require("./interview/states");
const { CandidateTurnTracker } = require("./interview/candidateTurn");
const { buildFinalEvaluation } = require("./interview/finalEvaluation");
const { ProviderError, raceAbort } = require("./util");

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
// Conversation states in which the candidate's microphone is allowed to be heard (strict turn-taking).
const MIC_OPEN_STATES = new Set([STATE.LISTENING, STATE.TRANSCRIBING, STATE.EVALUATING, STATE.DECIDING_NEXT_ACTION]);

const norm = (s) => s.toLowerCase().trim();
const joinText = (...parts) => parts.filter(Boolean).join(" ");

/**
 * One interview, independent of any particular socket. Owns turn state, cancellation,
 * STT/end-of-turn handling and persistence. A socket can attach, detach and re-attach
 * (session recovery) without losing state.
 *
 * Turn-taking rules:
 * - Every AI response is produced by a *generation* with its own id and AbortController.
 * - A newer candidate answer supersedes any unfinished one: the old generation is aborted and its
 *   text is carried into the new turn, so nothing the candidate said is dropped and nothing overlaps.
 * - A generation changes state (interview state, history, MongoDB) only at a single synchronous
 *   commit point, reached after the LLM *and* TTS have finished while it is still the live
 *   generation. Anything arriving later is stale and discarded.
 */
class InterviewSession {
  constructor({
    sessionId,
    interviewId,
    interviewDetails,
    history = [],
    expiresAt,
    userId = null,
    userEmail = null,
    userName = null,
    engineSnapshot = null,
    conversationState = null,
    deps,
  }) {
    this.id = sessionId;
    this.userId = userId;
    this.userEmail = userEmail;
    this.userName = userName;
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
    this.running = null; // the live generation: { turn, abort, generationId }
    this.carry = ""; // text of answers that were interrupted before being answered
    this.carriedTurnIds = []; // the turns that text came from
    this.delivered = null; // { turnId, generationId } of the reply the client is playing (awaiting playback_ended)
    this.playbackTimer = null;
    this.persistChain = Promise.resolve();
    this.stt = null;
    this.sttStopping = false;
    this.sttStopTimer = null;
    this.droppedAudio = 0;
    this.detector = new EndOfTurnDetector({
      ...deps.config.endOfTurn,
      onCommit: (c) => this._onSpeechCommit(c),
    });
    this.tracker = new CandidateTurnTracker();

    // Structured interview engine (null in "freeform" rollback mode).
    this.engine =
      deps.config.interview?.engine === "structured"
        ? new InterviewEngine({
            details: interviewDetails,
            snapshot: engineSnapshot,
            config: deps.config.interview,
            llm: deps.llm,
            metrics: deps.metrics,
            log: this.log,
            bank: deps.store.pickBankQuestions ? { pick: (query) => deps.store.pickBankQuestions(query) } : null,
          })
        : null;
    this.bargeIn = !!deps.config.interview?.bargeIn;
    this.completed = !!this.engine?.isCompleted;
    this.finalized = this.completed; // a restored, already-completed interview was finalized before
    this.conv = new ConversationState(this._restoredConversationState(conversationState), {
      onChange: ({ from, to, reason }) => {
        this.log.info("conversation.transition", { from, to, reason });
        this.send({ type: "interview_state", state: to, previous: from, reason });
      },
      onRejected: ({ from, to, reason }) => {
        deps.metrics.inc("conversation.invalid_transition");
        this.log.warn("conversation.invalid_transition", { from, to, reason });
      },
    });
    this.hooks = {
      saveAnswer: (record) => this._enqueue("answer", () => deps.store.saveAnswer(this.id, this.interviewId, record)),
    };
  }

  /** In-flight states do not survive a restart: the candidate is simply listening again. */
  _restoredConversationState(saved) {
    if (!saved) return STATE.INITIALIZING;
    if (this.completed) return STATE.COMPLETED;
    if ([STATE.TRANSCRIBING, STATE.EVALUATING, STATE.DECIDING_NEXT_ACTION, STATE.FAILED].includes(saved)) return STATE.LISTENING;
    return saved;
  }

  /** Moves the conversation state when the move is valid; races between STT events and turns are benign. */
  _convTo(state, reason) {
    if (this.conv.canTransition(state)) this.conv.transition(state, reason);
  }

  /** Strict turn-taking: the candidate's microphone is ignored while the AI speaks (unless barge-in is enabled). */
  get _isStrict() {
    return !!this.engine && !this.bargeIn;
  }

  _micOpen() {
    return !this._isStrict || MIC_OPEN_STATES.has(this.conv.current);
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
    let resent = false;
    for (const turn of this.turns.values()) {
      if (turn.state === TURN.UNDELIVERED) {
        this._sendResponse(turn);
        resent = true;
      }
    }
    // A new socket has no audio playing: if the old one died mid-playback the candidate has the floor again.
    if (!resent && this.engine && this.conv.current === STATE.AI_SPEAKING) {
      this._clearPlaybackWatch();
      this._convTo(STATE.LISTENING, "reattached");
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
   * Submit a turn. Idempotent per turnId: an in-flight duplicate is ignored, a completed duplicate
   * replays the stored response, a failed/cancelled turn re-runs. A *different* answer turn supersedes
   * any unfinished one (see class comment), so at most one answer is ever being processed.
   */
  submitTurn({ turnId, kind, text = "" }) {
    if (this.state !== "active" || this.completed) {
      return this.send({ type: "error", code: "SESSION_ENDED", message: "Session has ended", turnId });
    }
    const existing = this.turns.get(turnId);
    if (existing) {
      this.deps.metrics.inc("turn.duplicate");
      if (ACTIVE.has(existing.state)) {
        return this.send({ type: "turn_state", turnId, state: existing.state, generationId: existing.generationId, duplicate: true });
      }
      if (existing.state === TURN.DELIVERED) return this._sendResponse(existing, { replay: true });
      if (existing.state === TURN.UNDELIVERED) return this._sendResponse(existing);
      // failed / cancelled: fall through and re-run with the same id
    }

    let turnText = text;
    if (kind === "greeting") {
      if (this.running || this.queue.length) {
        this.deps.metrics.inc("turn.rejected_busy");
        return this.send({ type: "error", code: "BUSY", message: "Another turn is in progress", turnId, retryable: true });
      }
    } else {
      turnText = this._supersedePending(turnId, text);
      this.tracker.finalize(turnId);
    }

    const turn = { turnId, kind, text: turnText, state: TURN.QUEUED, createdAt: performance.now() };
    this.turns.set(turnId, turn);
    this._trimTurns();
    this.queue.push(turn);
    this.send({ type: "turn_state", turnId, state: TURN.QUEUED });
    this._pump();
  }

  /**
   * Cancels every unfinished answer and returns `newText` with their text prepended, oldest first.
   * The running generation is aborted (invalidated); queued ones never start.
   */
  _supersedePending(newTurnId, newText) {
    const older = [];
    const live = this.running;
    if (live && live.turn.kind === "answer") {
      if (!live.turn.carried) {
        // (An earlier interrupt() may already have cancelled and carried it; it is only unwinding.)
        live.turn.cancelReason = "superseded";
        live.turn.carried = true;
        older.push(live.turn);
      }
      this.tracker.cancel(live.turn.turnId);
      live.abort.abort();
    }
    for (const queued of this.queue.splice(0)) {
      if (queued.kind !== "answer") {
        this.queue.push(queued); // a pending greeting is not superseded by an answer
        continue;
      }
      queued.carried = true;
      older.push(queued);
      this._cancel(queued, "superseded");
    }
    const carried = joinText(this.carry, ...older.map((t) => t.text));
    this.carry = "";
    // Every answer whose text is now merged into the new turn, including ones an earlier interrupt() carried over.
    const mergedTurnIds = [...new Set([...this.carriedTurnIds, ...older.map((t) => t.turnId)])];
    this.carriedTurnIds = [];
    for (const turnId of mergedTurnIds) {
      this.tracker.cancel(turnId);
      this.deps.metrics.inc("turn.superseded");
      this._enqueue("supersede", async () => this.deps.store.markAnswerSuperseded?.(this.id, turnId, newTurnId));
    }
    return joinText(carried, newText);
  }

  /** Candidate interruption: cancel the in-flight generation and drop queued turns, keeping what was said. */
  interrupt() {
    for (const queued of this.queue.splice(0)) {
      this._carryFrom(queued);
      this._cancel(queued, "interrupt");
    }
    if (this.running) {
      this.running.turn.cancelReason = "interrupt";
      this._carryFrom(this.running.turn);
      this.running.abort.abort();
    }
  }

  _carryFrom(turn) {
    if (turn.kind !== "answer" || turn.carried || this.state !== "active") return;
    turn.carried = true;
    this.carry = joinText(this.carry, turn.text);
    this.carriedTurnIds.push(turn.turnId); // marked SUPERSEDED once the text is merged into a later answer
  }

  _cancel(turn, reason) {
    turn.state = TURN.CANCELLED;
    turn.cancelReason = reason;
    this.tracker.cancel(turn.turnId);
    this.deps.metrics.inc("turn.cancelled");
    this.send({ type: "turn_cancelled", turnId: turn.turnId, generationId: turn.generationId, reason });
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
    this.send({ type: "turn_state", turnId: turn.turnId, state, generationId: turn.generationId });
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

  /**
   * Runs one generation: LLM -> TTS -> commit -> deliver. Every await is raced against the abort
   * signal so a cancelled generation unwinds at once even if an SDK ignores the signal. Whether the
   * upstream computation actually stops is up to the provider; what this guarantees is that nothing
   * from a superseded generation is applied or sent.
   */
  async _runTurn(turn) {
    const { config, tts, metrics } = this.deps;
    const abort = new AbortController();
    const generation = { turn, abort, generationId: `gen_${crypto.randomUUID()}` };
    turn.generationId = generation.generationId;
    this.running = generation;
    const isCurrent = () => this.running === generation && !abort.signal.aborted && this.state === "active";
    const assertCurrent = () => {
      if (!isCurrent()) throw new ProviderError("ABORTED", "Generation is no longer current");
    };
    const deadline = setTimeout(() => {
      turn.cancelReason = "deadline";
      abort.abort();
    }, config.turnDeadlineMs);
    const log = this.log.child({ turnId: turn.turnId, generationId: generation.generationId });
    const t0 = performance.now();
    try {
      this._setState(turn, TURN.LLM);
      if (turn.kind === "answer") this.tracker.evaluating(turn.turnId);
      const reply = this.engine
        ? await this._respondStructured(turn, generation, isCurrent)
        : await this._respondFreeform(turn, abort);
      assertCurrent();

      this._setState(turn, TURN.TTS);
      try {
        const audio = await raceAbort(tts.synthesize({ text: reply.text, signal: abort.signal, requestId: turn.turnId }), abort.signal);
        metrics.observe("tts.duration_ms", audio.durationMs);
        turn.audioBase64 = audio.audioBase64;
      } catch (e) {
        if (!isCurrent()) throw e;
        // Degrade gracefully: deliver the text so the candidate is not stuck.
        metrics.inc("tts.error");
        log.warn("turn.tts_failed", { code: e.code });
        turn.audioBase64 = null;
        turn.ttsError = e.code || "TTS_FAILED";
      }
      assertCurrent();

      // ---- commit point: no await from here to the end, so no abort can slip in between ----
      this._commitTurn(turn, generation, reply);
      turn.totalMs = performance.now() - t0;
      metrics.observe("turn.total_ms", turn.totalMs);
      metrics.inc("turn.completed");
      this._sendResponse(turn);
      if (turn.kind === "answer") this.tracker.complete(turn.turnId);
      log.info("turn.completed", { totalMs: Math.round(turn.totalMs), replyChars: reply.text.length, ttsError: turn.ttsError });
    } catch (e) {
      // The interview carries on after a cancelled or failed turn: back to listening.
      if (this.engine && !this.completed && this.running === generation) this._convTo(STATE.LISTENING, "turn_aborted");
      const cancelledBy = turn.cancelReason === "interrupt" || turn.cancelReason === "superseded" ? turn.cancelReason : null;
      if (cancelledBy) {
        this._cancel(turn, cancelledBy);
      } else if (e.code === "ABORTED" && turn.cancelReason !== "deadline") {
        this._cancel(turn, "aborted"); // e.g. the session ended underneath it
      } else {
        const code = turn.cancelReason === "deadline" ? "TURN_TIMEOUT" : e.code || "TURN_FAILED";
        turn.state = TURN.FAILED;
        this.tracker.cancel(turn.turnId); // a retry of the same turn may now be finalized again
        metrics.inc("turn.failed");
        if (/TIMEOUT/.test(code)) metrics.inc("turn.timeout");
        log.error("turn.failed", { code });
        this.send({
          type: "error",
          code,
          turnId: turn.turnId,
          generationId: generation.generationId,
          retryable: true,
          message: "The interviewer could not respond. Please try again.",
        });
      }
    } finally {
      clearTimeout(deadline);
      if (this.running === generation) this.running = null;
    }
  }

  /** The single place where a finished generation changes interview state, history and the database. */
  _commitTurn(turn, generation, reply) {
    reply.commit?.();
    turn.reply = reply.text;
    turn.completesInterview = !!reply.completed;
    for (const event of reply.events ?? []) this.send({ ...event, generationId: generation.generationId });
    const entries = [];
    if (turn.kind === "answer") entries.push({ role: "user", content: turn.text, turnId: turn.turnId });
    entries.push({ role: "assistant", content: reply.text, turnId: turn.turnId });
    this.history.push(...entries.map(({ role, content }) => ({ role, content })));
    this.expiresAt = Date.now() + this.deps.config.sessionTtlMs;
    this._persist(entries); // not awaited: persistence must not delay audio
    this._persistEngine();
  }

  // ---- structured and freeform responders -------------------------------------

  async _respondStructured(turn, generation, isCurrent) {
    if (turn.kind === "greeting") return this.engine.openingTurn();
    this.conv.transition(STATE.EVALUATING, "answer_committed");
    const outcome = await this.engine.handleAnswer(turn, {
      signal: generation.abort.signal,
      isCurrent,
      requestId: turn.turnId,
      recentMessages: this.history.slice(-this.deps.config.interview.historyWindow),
      hooks: this.hooks,
    });
    this._convTo(STATE.DECIDING_NEXT_ACTION, "decision_ready");
    return outcome;
  }

  /** Legacy prompt-only behaviour, kept as a rollback switch (INTERVIEW_ENGINE=freeform). */
  async _respondFreeform(turn, abort) {
    const { llm, metrics } = this.deps;
    const call = (messages) => raceAbort(llm.complete({ messages, signal: abort.signal, requestId: turn.turnId }), abort.signal);
    const messages = this._buildMessages(turn);
    let reply = await call(messages);
    metrics.observe("llm.duration_ms", reply.durationMs);
    if (this._isDuplicateQuestion(reply.text)) {
      metrics.inc("llm.duplicate_question");
      const retry = await call([...messages, { role: "user", content: REPHRASE_INSTRUCTION }]);
      metrics.observe("llm.duration_ms", retry.durationMs);
      if (retry.text && !this._isDuplicateQuestion(retry.text)) reply = retry;
    }
    return { text: reply.text, events: [], completed: false };
  }

  /** `replay` re-sends an already delivered reply (client retry) without touching turn-taking state. */
  _sendResponse(turn, { replay = false } = {}) {
    const sent = this.send({
      type: "tts_audio",
      turnId: turn.turnId,
      generationId: turn.generationId,
      text: turn.reply,
      audioBase64: turn.audioBase64 ?? null,
      ttsError: turn.ttsError,
    });
    turn.sentAt = sent ? performance.now() : turn.sentAt;
    turn.state = sent ? TURN.DELIVERED : TURN.UNDELIVERED;
    if (!sent) this.deps.metrics.inc("turn.undelivered");
    if (this.engine && !replay) this._afterResponse(turn, sent);
  }

  /** The reply is out (or queued for replay): the interviewer is now speaking, or the interview is over. */
  _afterResponse(turn, sent) {
    if (turn.completesInterview) return this._completeInterview("completed");
    this._convTo(STATE.AI_SPEAKING, "response_sent");
    if (sent) this._watchPlayback(turn);
  }

  /**
   * The AI keeps the floor until the *client* reports it finished playing (not merely until the
   * backend finished generating). A watchdog returns the floor if that report never arrives.
   */
  _watchPlayback(turn) {
    this._clearPlaybackWatch();
    this.delivered = { turnId: turn.turnId, generationId: turn.generationId };
    const timeoutMs = this.deps.config.interview?.playbackAckTimeoutMs;
    if (!timeoutMs) return;
    this.playbackTimer = setTimeout(() => {
      if (this.delivered?.generationId !== turn.generationId) return;
      this.deps.metrics.inc("playback.ack_timeout");
      this.delivered = null;
      this._convTo(STATE.LISTENING, "playback_ack_timeout");
    }, timeoutMs);
    this.playbackTimer.unref?.();
  }

  _clearPlaybackWatch() {
    clearTimeout(this.playbackTimer);
    this.playbackTimer = null;
    this.delivered = null;
  }

  /** True when `turnId`/`generationId` name the reply the client is currently playing. */
  _isCurrentPlayback(turnId, generationId) {
    const d = this.delivered;
    return !!d && d.turnId === turnId && (!generationId || d.generationId === generationId);
  }

  /** The candidate has the floor again. A report for anything but the current reply is stale and ignored. */
  notePlaybackEnded(turnId, generationId) {
    if (this.completed) return;
    if (!this._isCurrentPlayback(turnId, generationId)) {
      this.deps.metrics.inc("playback.stale_ack");
      return;
    }
    this._clearPlaybackWatch();
    // Only hand the floor back if the AI still holds it; a candidate who already started speaking keeps theirs.
    if (this.conv.current === STATE.AI_SPEAKING) this._convTo(STATE.LISTENING, "playback_ended");
  }

  /** Marks the interview finished (once), persists the final evaluation and tells the client. */
  _completeInterview(reason) {
    if (this.completed) return;
    this.completed = true;
    this.engine.finish();
    this._clearPlaybackWatch();
    this._convTo(STATE.COMPLETED, reason);
    this.detector.reset(); // drop buffered speech first so closing STT cannot start a new turn
    this._closeStt();
    this._finalizeInterview(reason);
    this.send({ type: "interview_completed", reason });
  }

  /** Builds and stores the final evaluation from the persisted answers; safe to call more than once. */
  _finalizeInterview(reason) {
    if (!this.engine || this.finalized) return;
    this.finalized = true;
    const { store } = this.deps;
    this._enqueue("finalize", async () => {
      const answers = await store.loadAnswers(this.id);
      const evaluation = buildFinalEvaluation(answers, this.details?.settings);
      await store.saveFinalEvaluation(this.id, {
        ...evaluation,
        interviewId: this.interviewId,
        userId: this.userId,
        userEmail: this.userEmail,
        userName: this.userName,
        completionReason: reason,
        createdAt: new Date(),
      });
      // A finished interview with scored answers completes the candidate's assignment (so reports are reachable).
      if (this.userId && evaluation.evaluationStatus === "COMPLETE" && ["completed", "client_ended"].includes(reason)) {
        await store.markAssignment?.(this.interviewId, { id: this.userId, email: this.userEmail }, { status: "completed", completedAt: new Date(), sessionId: this.id });
      }
      await store.saveEngineState(this.id, {
        engineState: this.engine.snapshot(),
        conversationState: this.conv.current,
        completedAt: new Date(),
      });
    });
  }

  _persistEngine() {
    if (!this.engine) return;
    const { store } = this.deps;
    const engineState = this.engine.snapshot();
    const conversationState = this.conv.current;
    this._enqueue("engine_state", () => store.saveEngineState(this.id, { engineState, conversationState }));
  }

  notePlaybackStarted(turnId, generationId) {
    const turn = this.turns.get(turnId);
    if (generationId && turn?.generationId !== generationId) {
      this.deps.metrics.inc("playback.stale_ack");
      return;
    }
    if (turn?.sentAt && !turn.playbackRecorded) {
      turn.playbackRecorded = true;
      this.deps.metrics.observe("audio.sent_to_playback_ms", performance.now() - turn.sentAt);
    }
  }

  _persist(entries) {
    const { store } = this.deps;
    const expiresAt = new Date(this.expiresAt);
    this._enqueue("history", () => store.appendEntries(this.id, { entries, expiresAt }));
  }

  /** Persistence runs on one ordered chain, off the audio path; a failure is logged and counted, never thrown. */
  _enqueue(label, task) {
    this.persistChain = this.persistChain.then(task).catch((e) => {
      this.deps.metrics.inc("persist.error");
      this.log.error("persist.failed", { task: label, message: e.message });
    });
  }

  // ---- speech input --------------------------------------------------------

  _onSpeechCommit({ text, reason, waitedMs }) {
    this.deps.metrics.observe("eot.final_to_commit_ms", waitedMs);
    this.deps.metrics.inc(`eot.reason.${reason}`);
    if (this._isStrict && this.conv.current === STATE.AI_SPEAKING) this.deps.metrics.inc("turn.committed_while_ai_speaking");
    const turnId = `srv_${crypto.randomUUID()}`;
    this.send({ type: "user_turn_committed", turnId, text, reason });
    this.submitTurn({ turnId, kind: "answer", text });
  }

  startStt() {
    const { stt, config, metrics } = this.deps;
    if (!config.deepgram.apiKey) {
      return this.send({ type: "stt_error", code: "STT_NOT_CONFIGURED", message: "Speech recognition is not configured" });
    }
    // Rapid repeated starts (double click, retry) must not reopen the stream and flush the answer in progress.
    if (this.stt && !this.sttStopping) {
      metrics.inc("stt.duplicate_start");
      this.send({ type: "stt_started", sessionId: this.id }); // the stream is already open; just re-acknowledge
      return;
    }
    this._closeStt();
    this.detector.reset();
    const stream = stt.open({
      onOpen: () => this.send({ type: "stt_started", sessionId: this.id }),
      onResult: ({ text, isFinal, speechFinal, fromFinalize, confidence }) => {
        if (!this._micOpen()) return void metrics.inc("stt.ignored_while_ai_speaking");
        if (text.trim()) {
          this._convTo(STATE.TRANSCRIBING, "speech");
          this.tracker.transcribing();
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
      onUtteranceEnd: () => {
        if (this._micOpen()) this.detector.utteranceEnd();
      },
      onSpeechStarted: () => {
        if (!this._micOpen()) return void metrics.inc("stt.ignored_while_ai_speaking");
        this._convTo(STATE.TRANSCRIBING, "speech_started");
        this.tracker.startRecording();
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
    if (!this._micOpen()) {
      // Overlapping speech is refused here even if a client misbehaves; the client also stops sending.
      this.deps.metrics.inc("audio.rejected_ai_speaking");
      return;
    }
    if (!this.stt || !this.stt.send(buf)) {
      this.droppedAudio += 1;
      if (this.droppedAudio % 100 === 1) this.deps.metrics.inc("stt.audio_dropped");
    }
  }

  /** Manual stop: finalize STT, then commit whatever was heard. */
  stopStt() {
    if (!this.stt) return this.detector.flush("manual");
    const stream = this.stt;
    this.sttStopping = true;
    stream.finalize();
    clearTimeout(this.sttStopTimer);
    this.sttStopTimer = setTimeout(() => {
      this.detector.flush("manual");
      stream.close();
      if (this.stt === stream) {
        this.stt = null;
        this.sttStopping = false;
      }
    }, this.deps.config.endOfTurn.manualStopWaitMs);
  }

  _closeStt() {
    clearTimeout(this.sttStopTimer);
    const stream = this.stt;
    this.stt = null;
    this.sttStopping = false;
    this.detector.flush("disconnect");
    stream?.close();
  }

  // ---- lifecycle -----------------------------------------------------------

  end(reason = "ended") {
    if (this.state === "ended") return;
    this.state = "ended";
    this.interrupt();
    this._clearPlaybackWatch();
    this._closeStt();
    this.detector.reset();
    // A session that is over for good keeps what was answered so far; a server shutdown does not (it can be resumed).
    if (this.engine && ["client_ended", "expired", "abandoned"].includes(reason) && !this.completed) {
      this.completed = true;
      this.engine.finish();
      this._convTo(STATE.COMPLETED, reason);
      this._finalizeInterview(reason);
    }
    this.send({ type: "session_ended", reason, message: "Interview ended" });
  }

  get hasActiveTurn() {
    return !!this.running || this.queue.length > 0;
  }
}

module.exports = { InterviewSession, TURN };
