const { ProviderError, raceAbort } = require("../util");
const { INTENT, detectIntent } = require("./intents");
const { parseJsonObject, validateAnalysis, validateQuestion, validateTemplateQuestion } = require("./analysis");
const { ACTION, isDuplicateQuestion, nextDifficulty, decideAction } = require("./policy");
const { buildAnalysisMessages, buildQuestionMessages, buildAssistMessages, PROMPT_VERSION, TEMPLATE_PROMPT_VERSION } = require("./prompts");
const { pickQuestionType, plannedDifficulty } = require("../../interviews/templates/selection");

const CLOSING_TEXT = "That concludes our interview. Thank you for your time.";
const CONFIRM_END_TEXT = "Are you sure you want to end the interview?";
const CLARIFY_FALLBACK_TEXT = "Thanks. Could you say a bit more about that?";
const MOVE_ON_PHRASES = ["No problem. Let's move on.", "That's fine. Let's try another topic.", "Understood. Moving on."];
const MAX_ASKED_KEPT = 50;
const MAX_RECENT_SCORES = 6;
const MAX_ASKED_BANK_IDS = 100;
const MAX_CRITERIA = 5;
// A pause longer than this (a dropped connection, a long think) is not counted against a topic's time.
const MAX_TICK_MS = 5 * 60_000;
const BANK_REFERENCES = 3;

const clip = (value, max) => String(value ?? "").slice(0, max);
const toDifficulty = (label) => {
  const upper = String(label || "").toUpperCase();
  return ["BEGINNER", "INTERMEDIATE", "ADVANCED"].includes(upper) ? upper : "INTERMEDIATE";
};

const STYLE = {
  professional: "formal, concise and neutral",
  friendly: "warm and encouraging",
  challenging: "probing; ask for depth and justification",
  balanced: "supportive but probing",
};

/**
 * Applies the admin's per-interview settings on top of the global defaults. The limits the backend
 * enforces (question budget, follow-ups, clarifications) come from the interview, not the model.
 */
function effectiveConfig(config, settings) {
  if (!settings) return config;
  const behavior = settings.behavior || {};
  return {
    ...config,
    maxMainQuestions: settings.mainQuestions ?? config.maxMainQuestions,
    maxFollowUps: behavior.contextualFollowUps === false ? 0 : (settings.maxFollowUps ?? config.maxFollowUps),
    maxClarifications: behavior.clarifications === false ? 0 : config.maxClarifications,
  };
}

/**
 * The interview brain. The model recommends; this class validates and decides.
 *
 * - No I/O besides `llm.complete` and the optional question `bank`; persistence goes through the `hooks` the session passes in.
 * - Template interviews (`details.template`): the backend owns the plan. It picks the topic, question type, difficulty and
 *   reference questions of every main question, enforces the per-topic counts, follow-up limit and time budget, and validates
 *   what the model returns against that plan. The model only phrases questions and evaluates answers.
 * - Nothing advances until the caller invokes `outcome.commit()`. Work happens on a draft and
 *   evaluation writes are deferred, so a cancelled, superseded or failed generation leaves the
 *   interview state and the database exactly as they were. The session commits only once the
 *   reply is ready to be delivered. The one write made early is the candidate's own transcript
 *   (status PENDING), because that is user input, not a result of the generation.
 * - `snapshot()` is small and JSON-safe (bounded arrays) for persistence and recovery.
 */
class InterviewEngine {
  /** bank: optional { pick({ templateId, topicId, difficulty, questionType, excludeIds, limit }) } returning reference questions. */
  constructor({ details, snapshot = null, config, llm, metrics, log, now = Date.now, bank = null }) {
    this.details = details;
    this.template = details?.template ?? null;
    this.bank = bank;
    this.baseDifficulty = toDifficulty(details?.difficulty);
    this.config = effectiveConfig(config, details?.settings);
    this.llm = llm;
    this.metrics = metrics;
    this.log = log;
    this.now = now;
    this.state = snapshot ? structuredClone(snapshot) : this._initialState();
  }

  _initialState() {
    return {
      version: 1,
      difficulty: toDifficulty(this.details?.difficulty),
      currentQuestion: null, // { id, text, type: WARMUP|MAIN|FOLLOW_UP, parentId, topic }
      questionSeq: 0,
      mainCount: 0,
      followUpCount: 0,
      clarificationCount: 0,
      repeatCount: 0,
      hintCount: 0,
      topicCounts: {}, // main questions asked per configured topic
      topicFollowUps: {}, // follow-ups asked per topic (they never count as main questions)
      topicSpentMs: {}, // time spent per topic, follow-ups included (backend clock)
      closedTopics: {}, // topics the time policy moved on from before their allocation was used up
      askedBankIds: [], // question-bank questions already used, so they are not offered again
      lastActivityAt: this.now(),
      askedQuestions: [], // { id, text, type }
      recentScores: [],
      summary: "",
      pendingEnd: false,
      completed: false,
      startedAt: this.now(),
    };
  }

  snapshot() {
    return structuredClone(this.state);
  }

  get isCompleted() {
    return this.state.completed;
  }

  /** Marks the interview over from outside the engine (candidate left, session expired). */
  finish() {
    this.state.completed = true;
    this.state.pendingEnd = false;
  }

  // ---- opening -------------------------------------------------------------

  /** Deterministic opening: no model call, so the first audio is as fast as possible. */
  openingTurn() {
    // A repeated or recovered start never restarts the interview: it re-asks where we are.
    const existing = this.state.currentQuestion;
    if (existing) return this._result({ text: existing.text, events: [] });
    const title = this.details?.title || "this";
    const text = `Hello, I'm SIRI. Thanks for joining the ${title} interview. To begin, please introduce yourself and tell me about your relevant background.`;
    const draft = structuredClone(this.state);
    const question = this._newQuestion(draft, { text, type: "WARMUP", topic: "Introduction" });
    draft.currentQuestion = question;
    const outcome = this._result({ text, events: [this._questionEvent(question, draft)] });
    outcome.commit = () => {
      this.state = draft;
    };
    return outcome;
  }

  // ---- time -------------------------------------------------------------------

  /** Charges the time since the last turn to the topic of the question that was being answered. */
  _tick(draft) {
    if (!this.template) return; // topic time only matters to template interviews
    const now = this.now();
    const elapsed = Math.min(Math.max(0, now - (draft.lastActivityAt ?? now)), MAX_TICK_MS);
    const topic = draft.currentQuestion?.topic;
    if (topic && elapsed > 0) draft.topicSpentMs = { ...draft.topicSpentMs, [topic]: (draft.topicSpentMs?.[topic] || 0) + elapsed };
    draft.lastActivityAt = now;
  }

  _templateTopic(name) {
    const wanted = String(name || "").toLowerCase();
    return this.template?.topics?.find((t) => t.name.toLowerCase() === wanted) ?? null;
  }

  /** True when the minutes left cannot cover the remaining main questions at their expected pace. */
  _timeTight(draft) {
    if (!this.template) return false;
    const remaining = this._minutesRemainingExact();
    if (remaining === null) return false;
    const { approxAnswerSeconds, transitionSeconds, closingMinutes } = this.template.timing;
    const mainLeft = Math.max(0, this.config.maxMainQuestions - draft.mainCount);
    return remaining <= (mainLeft * (approxAnswerSeconds + transitionSeconds)) / 60 + closingMinutes;
  }

  /** True when the current topic has used its whole allocation (follow-ups spend their parent topic's time). */
  _topicOverBudget(draft) {
    const topic = this._templateTopic(draft.currentQuestion?.topic);
    return !!topic && (draft.topicSpentMs?.[topic.name] || 0) >= topic.allocatedMinutes * 60_000;
  }

  /**
   * The time policy may move past a topic that has overrun badly, so later topics are not starved.
   * It only closes a topic while another topic still has questions to ask.
   */
  _closeOverrunTopics(draft) {
    if (!this.template) return;
    const factor = this.config.topicOverrunFactor ?? 1.5;
    const remaining = this.template.topics.filter((t) => t.questionCount > (draft.topicCounts?.[t.name] || 0));
    for (const topic of remaining) {
      const stillOpen = remaining.some((t) => t.name !== topic.name && !draft.closedTopics?.[t.name]);
      if (stillOpen && !draft.closedTopics?.[topic.name] && (draft.topicSpentMs?.[topic.name] || 0) >= topic.allocatedMinutes * 60_000 * factor) {
        draft.closedTopics = { ...draft.closedTopics, [topic.name]: true };
        this.metrics.inc("interview.topic_closed_by_time");
      }
    }
  }

  // ---- candidate turn --------------------------------------------------------

  /**
   * io: { signal, isCurrent(), requestId, recentMessages: [{role, content}], hooks: { saveAnswer(record) } }
   * `isCurrent()` says whether this generation is still the live one; it gates writes made after a failure.
   * Returns { text, completed, events, commit } where nothing has been applied until `commit()` runs.
   */
  async handleAnswer(turn, io) {
    if (this.state.completed) return this._result({ text: CLOSING_TEXT, events: [], completed: true });
    const draft = structuredClone(this.state);
    const deferred = [];
    this._tick(draft);
    const timings = { responseMs: draft.currentQuestion?.askedAt ? Math.max(0, this.now() - draft.currentQuestion.askedAt) : null };
    const outcome = await this._handle(draft, turn, { ...io, timings, defer: (write) => deferred.push(write) });
    outcome.commit = () => {
      this.state = draft;
      for (const write of deferred) write();
    };
    return outcome;
  }

  async _handle(draft, turn, io) {
    const text = turn.text;
    const awaitingEndConfirmation = draft.pendingEnd;
    draft.pendingEnd = false;
    const intent = detectIntent(text, { expectConfirmation: awaitingEndConfirmation });

    if (awaitingEndConfirmation && intent === INTENT.CONFIRM) return this._complete(draft);
    if (awaitingEndConfirmation && intent === INTENT.DENY) {
      return this._result({ text: `Okay, let's continue. ${draft.currentQuestion?.text ?? ""}`.trim(), events: [] });
    }

    switch (intent) {
      case INTENT.END_INTERVIEW:
        draft.pendingEnd = true;
        return this._result({ text: CONFIRM_END_TEXT, events: [] });
      case INTENT.REPEAT_QUESTION:
        return this._repeat(draft);
      case INTENT.EXPLAIN_QUESTION:
      case INTENT.HINT:
        return this._assist(draft, intent, io);
      case INTENT.SKIP_QUESTION:
        if (this.details?.settings?.behavior?.allowSkip === false) {
          return this._result({ text: "Skipping is not available in this interview. Please give it your best attempt.", events: [] });
        }
        return this._skipOrDontKnow(draft, turn, io, { skipped: true });
      case INTENT.DONT_KNOW:
        return this._skipOrDontKnow(draft, turn, io, { skipped: false });
      default:
        break;
    }

    if (draft.currentQuestion?.type === "WARMUP") return this._handleWarmupAnswer(draft, turn, io);
    return this._handleEvaluatedAnswer(draft, turn, io);
  }

  // ---- intents ----------------------------------------------------------------

  _repeat(draft) {
    if (this.details?.settings?.behavior?.allowRepeat === false) {
      return this._result({ text: "Repeating questions is not available in this interview. Please give it your best attempt.", events: [] });
    }
    const question = draft.currentQuestion;
    if (draft.repeatCount >= this.config.maxRepeats) {
      return this._result({ text: "I've repeated it a couple of times. Please give it your best attempt, or say skip to move on.", events: [] });
    }
    draft.repeatCount += 1;
    return this._result({ text: question?.text ?? "Please go ahead.", events: [] });
  }

  async _assist(draft, intent, io) {
    if (intent === INTENT.HINT && draft.hintCount >= 1) {
      return this._result({ text: "I can't give more hints on this one. Would you like to try, or skip?", events: [] });
    }
    const reply = await this._complete_text(
      "assist",
      buildAssistMessages({
        request: intent === INTENT.HINT ? "HINT" : "EXPLAIN",
        job: this._job(),
        currentQuestion: clip(draft.currentQuestion?.text, 500),
      }),
      io,
      this.config.assistMaxTokens
    );
    if (intent === INTENT.HINT) draft.hintCount += 1;
    return this._result({ text: reply, events: [] });
  }

  async _skipOrDontKnow(draft, turn, io, { skipped }) {
    const question = draft.currentQuestion;
    const isWarmup = question?.type === "WARMUP";
    const evaluation = skipped || isWarmup ? { status: "NOT_APPLICABLE" } : this._unansweredEvaluation();
    io.hooks.saveAnswer(this._answerRecord(draft, turn, { status: "PENDING", timing: io.timings }));
    const final = this._answerRecord(draft, turn, { skipped, evaluation, status: skipped || isWarmup ? "SKIPPED" : "EVALUATED", timing: io.timings });
    io.defer(() => io.hooks.saveAnswer(final));
    if (!skipped && !isWarmup) draft.recentScores = [...draft.recentScores, 0].slice(-MAX_RECENT_SCORES);
    const events = !skipped && !isWarmup ? [this._evaluatedEvent(turn, question, "EVALUATED")] : [];
    return this._moveToNewMainQuestion(draft, io, { prefix: this._moveOnPhrase(draft), events });
  }

  _unansweredEvaluation() {
    return {
      status: "EVALUATED",
      answerQuality: "UNANSWERED",
      score: 0,
      strengths: [],
      missingConcepts: [],
      incorrectConcepts: [],
      reasoningSummary: "The candidate said they did not know the answer.",
      suggestedFollowUpAreas: [],
    };
  }

  // ---- answers ----------------------------------------------------------------

  async _handleWarmupAnswer(draft, turn, io) {
    io.hooks.saveAnswer(this._answerRecord(draft, turn, { status: "PENDING", timing: io.timings }));
    const final = this._answerRecord(draft, turn, { evaluation: { status: "NOT_APPLICABLE" }, status: "RECORDED", timing: io.timings });
    io.defer(() => io.hooks.saveAnswer(final));
    draft.summary = clip(`Candidate introduction: ${turn.text}`, 400);
    return this._moveToNewMainQuestion(draft, io, { prefix: "Thanks for that.", introduction: clip(turn.text, 800) });
  }

  async _handleEvaluatedAnswer(draft, turn, io) {
    const question = draft.currentQuestion;
    io.hooks.saveAnswer(this._answerRecord(draft, turn, { status: "PENDING", timing: io.timings }));

    let analysis;
    try {
      const validate = this.template ? (raw) => validateAnalysis(raw, { nextQuestionOptional: true }) : validateAnalysis;
      analysis = await this._structured("analysis", buildAnalysisMessages(this._analysisContext(draft, turn.text, io)), validate, io, this.config.analysisMaxTokens);
    } catch (e) {
      if (e.code === "ABORTED") throw e;
      const failed = { turnId: turn.turnId, status: "EVALUATION_FAILED", evaluation: { status: "FAILED", errorCode: e.code || "LLM_FAILED" } };
      this.metrics.inc("interview.evaluation_failed");
      if (e.code !== "LLM_INVALID") {
        // Provider trouble: surface it like any failed turn. A superseded generation records nothing.
        if (io.isCurrent?.() ?? true) io.hooks.saveAnswer(failed);
        throw e;
      }
      // The model produced unusable output twice. Record that honestly and keep the interview moving.
      io.defer(() => io.hooks.saveAnswer(failed));
      return this._result({ text: CLARIFY_FALLBACK_TEXT, events: [this._evaluatedEvent(turn, question, "EVALUATION_FAILED")] });
    }

    const { action, overridden, reason } = decideAction({
      recommended: analysis.decision.nextAction,
      state: draft,
      limits: this.config,
      clock: { timeUp: this._timeUp(), timeTight: this._timeTight(draft), topicOverBudget: this._topicOverBudget(draft) },
    });
    this.metrics.inc(`interview.action.${action}`);
    if (overridden) this.metrics.inc(`interview.action_overridden.${reason}`);

    // An answer the interviewer asked to clarify is not scored: the clarified reply is the one that counts.
    const clarifying = action === ACTION.ASK_CLARIFICATION;
    const evaluated = {
      turnId: turn.turnId,
      status: clarifying ? "CLARIFICATION_REQUESTED" : "EVALUATED",
      evaluation: analysis.evaluation,
      timing: io.timings, // question generation time is added later in this same turn, before the commit
    };
    io.defer(() => io.hooks.saveAnswer(evaluated));
    const events = [this._evaluatedEvent(turn, question, clarifying ? "CLARIFICATION_REQUESTED" : "EVALUATED")];
    if (analysis.summary) draft.summary = analysis.summary;
    if (!clarifying && analysis.evaluation.answerQuality !== "UNCLEAR") {
      draft.recentScores = [...draft.recentScores, analysis.evaluation.score].slice(-MAX_RECENT_SCORES);
      draft.difficulty = nextDifficulty(draft.difficulty, draft.recentScores);
    }

    switch (action) {
      case ACTION.ASK_FOLLOW_UP:
        // A follow-up that cannot be asked (a repeat, after the one allowed re-ask) becomes the next main question.
        return this._askFollowUp(draft, analysis.decision, events) ?? this._askNext(draft, analysis.decision, true, io, events);
      case ACTION.ASK_CLARIFICATION:
        draft.clarificationCount += 1;
        return this._result({ text: analysis.decision.question, events });
      case ACTION.REPEAT_QUESTION:
        draft.repeatCount += 1;
        return this._result({ text: question.text, events });
      case ACTION.END_INTERVIEW:
        return this._complete(draft, events);
      default:
        return this._askNext(draft, analysis.decision, overridden, io, events);
    }
  }

  _askFollowUp(draft, decision, events) {
    if (isDuplicateQuestion(decision.question, draft.askedQuestions.map((q) => q.text))) {
      this.metrics.inc("interview.duplicate_followup");
      if (draft.clarificationCount >= this.config.maxClarifications) return null; // the model keeps repeating itself: move on
      draft.clarificationCount += 1;
      return this._result({ text: draft.currentQuestion.text, events });
    }
    const parentId = draft.currentQuestion.type === "FOLLOW_UP" ? draft.currentQuestion.parentId : draft.currentQuestion.id;
    draft.followUpCount += 1;
    const followTopic = draft.currentQuestion.topic;
    draft.topicFollowUps = { ...draft.topicFollowUps, [followTopic]: (draft.topicFollowUps?.[followTopic] || 0) + 1 };
    draft.clarificationCount = 0;
    draft.repeatCount = 0;
    draft.hintCount = 0;
    const question = this._newQuestion(draft, { text: decision.question, type: "FOLLOW_UP", parentId, topic: followTopic, extra: { followUpIndex: draft.followUpCount } });
    draft.currentQuestion = question;
    return this._result({ text: decision.question, events: [...events, this._questionEvent(question, draft)] });
  }

  /** Uses the model's own next question when it is acceptable, otherwise generates one. */
  async _askNext(draft, decision, overridden, io, events) {
    const asked = draft.askedQuestions.map((q) => q.text);
    // A template interview never takes the evaluator's own next question: the backend plans it.
    if (!this.template && !overridden && decision.question && !isDuplicateQuestion(decision.question, asked)) {
      return this._startMainQuestion(draft, { text: decision.question, topic: decision.topic || "General" }, events, "");
    }
    if (!this.template && decision.question && !overridden) this.metrics.inc("interview.duplicate_question");
    return this._moveToNewMainQuestion(draft, io, { prefix: "", events });
  }

  // ---- question flow ----------------------------------------------------------

  /** Generates a fresh main question, or ends the interview when none remain or one cannot be found. */
  async _moveToNewMainQuestion(draft, io, { prefix = "", events = [], introduction } = {}) {
    if (draft.mainCount >= this.config.maxMainQuestions || this._timeUp()) return this._complete(draft, events);
    const generated = await this._generateQuestion(draft, io, introduction);
    if (!generated) return this._complete(draft, events); // could not find a non-duplicate question
    return this._startMainQuestion(draft, { text: generated.question, topic: generated.topic || "General", difficulty: generated.difficulty, meta: generated.meta }, events, prefix);
  }

  async _generateQuestion(draft, io, introduction) {
    if (this.template) return this._generateTemplateQuestion(draft, io, introduction);
    const asked = draft.askedQuestions.map((q) => q.text);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const generated = await this._structured(
        "question",
        buildQuestionMessages({
          job: this._job(),
          difficulty: draft.difficulty,
          summary: draft.summary,
          introduction,
          askedQuestions: asked.slice(-15),
          avoidRepeats: attempt > 0,
          focusTopic: this._focusTopic(draft) ? { name: this._focusTopic(draft).name, difficulty: this._focusTopic(draft).difficulty } : null,
        }),
        validateQuestion,
        io,
        this.config.questionMaxTokens
      );
      if (!isDuplicateQuestion(generated.question, asked)) return generated;
      this.metrics.inc("interview.duplicate_question");
    }
    return null;
  }

  /**
   * The next configured topic that still has questions left, in the order the admin listed them.
   * A topic the time policy closed is only returned when nothing else is left to ask.
   */
  _focusTopic(draft) {
    const topics = this.template ? this.template.topics.map((t) => ({ ...t, questions: t.questionCount })) : this.details?.settings?.topics;
    if (!Array.isArray(topics)) return null;
    const remaining = topics.filter((t) => t.questions > (draft.topicCounts?.[t.name] || 0));
    return remaining.find((t) => !draft.closedTopics?.[t.name]) ?? remaining[0] ?? null;
  }

  // ---- template plan ------------------------------------------------------------

  /** Everything the backend decides about the next main question, plus reference questions from the bank. */
  async _planQuestion(draft, topic) {
    const ordinal = draft.topicCounts?.[topic.name] || 0;
    const questionType = pickQuestionType(topic.questionTypes, ordinal);
    const difficulty = plannedDifficulty(topic.difficulty, {
      current: draft.difficulty,
      base: this.baseDifficulty,
      adaptive: this.details?.settings?.behavior?.adaptiveDifficulty !== false,
    });
    let references = [];
    if (this.bank) {
      try {
        references = await this.bank.pick({ templateId: this.template.templateId, topicId: topic.id, difficulty, questionType, excludeIds: draft.askedBankIds || [], limit: BANK_REFERENCES });
      } catch (e) {
        // The bank only helps the model; an unavailable bank must not stop the interview.
        this.metrics.inc("interview.bank_unavailable");
        this.log?.warn("interview.bank_unavailable", { message: e.message });
      }
    }
    return { topic, ordinal, questionType, difficulty, references };
  }

  async _generateTemplateQuestion(draft, io, introduction) {
    this._closeOverrunTopics(draft);
    const topic = this._focusTopic(draft);
    if (!topic) return null;
    const plan = await this._planQuestion(draft, topic);
    const asked = draft.askedQuestions.map((q) => q.text);
    const result = (text, { questionType, difficulty, evaluationCriteria, reference }) => ({
      question: text,
      topic: topic.name,
      difficulty,
      meta: { questionKind: questionType, bankQuestionId: reference?.id ?? null, criteria: evaluationCriteria.slice(0, MAX_CRITERIA), expectedConcepts: (reference?.expectedConcepts ?? []).slice(0, MAX_CRITERIA) },
    });
    // The bank's own wording: a question the topic owns, used when the model cannot produce a valid one.
    const fromBank = () => {
      const reference = plan.references.find((r) => !isDuplicateQuestion(r.text, asked));
      if (!reference) return null;
      this.metrics.inc("interview.question_from_bank");
      return result(reference.text, { questionType: reference.questionType, difficulty: reference.difficulty, evaluationCriteria: reference.evaluationCriteria, reference });
    };
    const publicPlan = {
      topic: { name: topic.name, description: topic.description },
      questionType: plan.questionType,
      difficulty: plan.difficulty,
      questionNumberInTopic: plan.ordinal + 1,
      questionsInTopic: topic.questionCount,
      minutesRemaining: this._minutesRemaining(),
      referenceQuestions: plan.references.map((r) => ({ id: r.id, text: r.text, expectedConcepts: r.expectedConcepts })),
    };
    const validationPlan = { topic, questionType: plan.questionType, difficulty: plan.difficulty, references: plan.references };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      let generated;
      try {
        generated = await this._structured(
          "question",
          buildQuestionMessages({
            job: this._job(),
            template: this._templateContext(),
            plan: publicPlan,
            summary: draft.summary,
            introduction,
            askedQuestions: asked.slice(-15),
            avoidRepeats: attempt > 0,
          }),
          (raw) => validateTemplateQuestion(raw, validationPlan),
          io,
          this.config.questionMaxTokens
        );
      } catch (e) {
        if (e.code !== "LLM_INVALID") throw e;
        const fallback = fromBank();
        if (fallback) return fallback;
        throw e;
      }
      if (generated.typeCorrected) this.metrics.inc("interview.question_type_corrected");
      if (!isDuplicateQuestion(generated.question, asked)) return result(generated.question, generated);
      this.metrics.inc("interview.duplicate_question");
    }
    return fromBank();
  }

  _templateContext() {
    return { name: this.template.title, aiInstructions: clip(this.template.aiInstructions, 400), evaluationCriteria: (this.template.evaluationCriteria || []).slice(0, 4) };
  }

  _startMainQuestion(draft, { text, topic: modelTopic, difficulty, meta }, events, prefix) {
    // The backend decides the topic (so scoring matches the configuration); the model only writes the question.
    const focus = this._focusTopic(draft);
    const topic = focus?.name ?? modelTopic;
    draft.topicCounts = { ...(draft.topicCounts || {}), [topic]: (draft.topicCounts?.[topic] || 0) + 1 };
    draft.mainCount += 1;
    draft.followUpCount = 0;
    draft.clarificationCount = 0;
    draft.repeatCount = 0;
    draft.hintCount = 0;
    const question = this._newQuestion(draft, { text, type: "MAIN", topic, extra: meta });
    if (difficulty) question.difficulty = difficulty;
    if (meta?.bankQuestionId) draft.askedBankIds = [...(draft.askedBankIds || []), meta.bankQuestionId].slice(-MAX_ASKED_BANK_IDS);
    draft.currentQuestion = question;
    const spoken = prefix ? `${prefix} ${text}` : text;
    return this._result({ text: spoken, events: [...events, this._questionEvent(question, draft)] });
  }

  _complete(draft, events = []) {
    draft.completed = true;
    draft.pendingEnd = false;
    return this._result({ text: CLOSING_TEXT, events, completed: true });
  }

  // ---- helpers ----------------------------------------------------------------

  _newQuestion(draft, { text, type, parentId = null, topic = "", extra = null }) {
    draft.questionSeq += 1;
    const question = { id: `q${draft.questionSeq}`, text: clip(text, 500), type, parentId, topic: clip(topic, 80), askedAt: this.now(), ...extra };
    draft.askedQuestions = [...draft.askedQuestions, { id: question.id, text: question.text, type }].slice(-MAX_ASKED_KEPT);
    return question;
  }

  _job() {
    const settings = this.details?.settings;
    return {
      title: this.details?.title || "Software Engineer",
      description: clip(this.details?.description, 300),
      ...(settings?.role && { role: clip(settings.role, 100) }),
      ...(settings?.behavior?.personality?.length && { style: settings.behavior.personality.map((p) => STYLE[p]).filter(Boolean).join("; ") }),
      ...(Array.isArray(settings?.topics) && { topics: settings.topics.map((t) => ({ name: t.name, weight: t.weight })) }),
    };
  }

  _timeUp() {
    const minutes = Number(this.details?.timeLimit);
    return Number.isFinite(minutes) && minutes > 0 && this.now() - this.state.startedAt >= minutes * 60_000;
  }

  _minutesRemainingExact() {
    const minutes = Number(this.details?.timeLimit);
    if (!Number.isFinite(minutes) || minutes <= 0) return null;
    return Math.max(0, minutes - (this.now() - this.state.startedAt) / 60_000);
  }

  _minutesRemaining() {
    const exact = this._minutesRemainingExact();
    return exact === null ? null : Math.round(exact);
  }

  _moveOnPhrase(draft) {
    return MOVE_ON_PHRASES[draft.questionSeq % MOVE_ON_PHRASES.length];
  }

  /** Bounded context: summary + current question + a few recent messages, never the full transcript. */
  _analysisContext(draft, answerText, io) {
    const question = draft.currentQuestion;
    return {
      job: this._job(),
      difficulty: draft.difficulty,
      limits: {
        nextTopic: this._focusTopic(draft)?.name ?? null,
        followUpsRemaining: Math.max(0, this.config.maxFollowUps - draft.followUpCount),
        clarificationsRemaining: Math.max(0, this.config.maxClarifications - draft.clarificationCount),
        ...(this.template && { timePressure: this._timeTight(draft) || this._topicOverBudget(draft) }),
        mainQuestionsRemaining: Math.max(0, this.config.maxMainQuestions - draft.mainCount),
        minutesRemaining: this._minutesRemaining(),
      },
      summary: draft.summary,
      ...(this.template && { template: this._templateContext(), topic: this._topicContext(question?.topic) }),
      currentQuestion: {
        text: question?.text,
        type: question?.type,
        topic: question?.topic,
        ...(question?.criteria?.length && { evaluationCriteria: question.criteria }),
        ...(question?.expectedConcepts?.length && { expectedConcepts: question.expectedConcepts }),
      },
      askedQuestions: draft.askedQuestions.map((q) => q.text).slice(-15),
      recentExchanges: (io.recentMessages || [])
        .slice(-this.config.historyWindow)
        .map((m) => ({ role: m.role === "assistant" ? "interviewer" : "candidate", text: clip(m.content, 400) })),
      candidateAnswer: clip(answerText, 4000),
    };
  }

  _topicContext(name) {
    const topic = this._templateTopic(name);
    return topic ? { name: topic.name, description: topic.description, evaluationCriteria: (topic.evaluationCriteria || []).slice(0, 4) } : { name: name || "" };
  }

  _answerRecord(draft, turn, { status, evaluation, skipped = false, timing = null }) {
    const q = draft.currentQuestion || {};
    return {
      turnId: turn.turnId,
      questionId: q.id ?? null,
      questionText: q.text ?? "",
      questionType: q.type ?? "MAIN",
      parentQuestionId: q.parentId ?? null,
      topic: q.topic ?? "",
      difficulty: this.template ? q.difficulty || draft.difficulty : draft.difficulty,
      transcript: turn.text,
      status,
      skipped,
      ...(evaluation && { evaluation }),
      promptVersion: this.template ? TEMPLATE_PROMPT_VERSION : PROMPT_VERSION,
      ...(this.template && {
        questionKind: q.questionKind ?? null,
        bankQuestionId: q.bankQuestionId ?? null,
        followUpIndex: q.followUpIndex ?? 0,
        evaluationCriteria: q.criteria ?? [],
        timing,
      }),
    };
  }

  _evaluatedEvent(turn, question, status) {
    // Deliberately no score or feedback: the candidate must not see evaluations mid-interview.
    return { type: "answer_evaluated", turnId: turn.turnId, questionId: question?.id ?? null, status };
  }

  _questionEvent(question, draft) {
    return {
      type: "next_question",
      questionId: question.id,
      questionType: question.type,
      mainIndex: draft.mainCount,
      totalMain: this.config.maxMainQuestions,
      ...(this.template && { topic: question.topic }),
    };
  }

  _result({ text, events, completed = false }) {
    return { text, events, completed, commit: () => {} };
  }

  // ---- model calls ------------------------------------------------------------

  async _complete_text(kind, messages, io, maxTokens) {
    const reply = await raceAbort(this.llm.complete({ messages, signal: io.signal, requestId: io.requestId, maxTokens }), io.signal);
    this.metrics.observe(`interview.${kind}_ms`, reply.durationMs);
    const text = String(reply.text || "").trim();
    if (!text) throw new ProviderError("LLM_EMPTY", "LLM returned no text", { retryable: true });
    return text;
  }

  /** Calls the model for JSON, validates it, and retries once on malformed output. */
  async _structured(kind, messages, validate, io, maxTokens) {
    let lastError = "unknown";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const reply = await raceAbort(
        this.llm.complete({ messages, signal: io.signal, requestId: io.requestId, json: true, maxTokens }),
        io.signal
      );
      this.metrics.observe(`interview.${kind}_ms`, reply.durationMs);
      if (io.timings && Number.isFinite(reply.durationMs)) {
        const field = kind === "analysis" ? "evaluationMs" : "generationMs";
        io.timings[field] = (io.timings[field] || 0) + reply.durationMs;
      }
      const checked = validate(parseJsonObject(reply.text));
      if (checked.ok) return checked.value;
      lastError = checked.error;
      this.metrics.inc(`interview.${kind}_invalid`);
      this.log?.warn("interview.invalid_model_output", { kind, reason: lastError, requestId: io.requestId });
    }
    throw new ProviderError("LLM_INVALID", `Model output failed validation: ${lastError}`);
  }
}

module.exports = { InterviewEngine, CLOSING_TEXT };
