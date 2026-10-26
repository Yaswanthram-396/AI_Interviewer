/**
 * Parsing and validation of the model's structured output. The model only *recommends*:
 * everything here is untrusted, bounded, and checked against closed enums before the
 * backend (policy.js) decides what actually happens.
 */
const ANSWER_QUALITY = Object.freeze([
  "CORRECT",
  "PARTIALLY_CORRECT",
  "INCORRECT",
  "UNANSWERED",
  "UNCLEAR",
  "OFF_TOPIC",
]);

const NEXT_ACTION = Object.freeze([
  "ASK_FOLLOW_UP",
  "ASK_NEXT_QUESTION",
  "ASK_CLARIFICATION",
  "REPEAT_QUESTION",
  "SKIP_QUESTION",
  "END_INTERVIEW",
]);

const DIFFICULTY = Object.freeze(["BEGINNER", "INTERMEDIATE", "ADVANCED"]);

const LIMITS = Object.freeze({ list: 5, item: 200, reason: 400, question: 500, topic: 80, summary: 800 });

/** Extracts the first JSON object from model text (tolerates code fences and stray prose). */
function parseJsonObject(text) {
  if (typeof text !== "string") return null;
  const unfenced = text.replace(/```(?:json)?/gi, "").trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const value = JSON.parse(unfenced.slice(start, end + 1));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

const clip = (value, max) => String(value).replace(/\s+/g, " ").trim().slice(0, max);

function stringList(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  return value
    .filter((item) => typeof item === "string" && item.trim())
    .slice(0, LIMITS.list)
    .map((item) => clip(item, LIMITS.item));
}

const fail = (error) => ({ ok: false, error });

/**
 * Validates the combined evaluation + decision object. Returns {ok, value} or {ok:false, error}.
 * With `nextQuestionOptional` (template interviews) the backend writes the next main question itself,
 * so ASK_NEXT_QUESTION needs no question text.
 */
function validateAnalysis(raw, { nextQuestionOptional = false } = {}) {
  if (!raw || typeof raw !== "object") return fail("not an object");
  const evaluation = raw.evaluation;
  const decision = raw.decision;
  if (!evaluation || typeof evaluation !== "object") return fail("evaluation missing");
  if (!decision || typeof decision !== "object") return fail("decision missing");

  const answerQuality = String(evaluation.answerQuality || "").toUpperCase();
  if (!ANSWER_QUALITY.includes(answerQuality)) return fail("answerQuality invalid");

  const score = Number(evaluation.score);
  if (!Number.isFinite(score)) return fail("score invalid");

  const strengths = stringList(evaluation.strengths);
  const missingConcepts = stringList(evaluation.missingConcepts);
  const incorrectConcepts = stringList(evaluation.incorrectConcepts);
  const suggestedFollowUpAreas = stringList(evaluation.suggestedFollowUpAreas);
  if (!strengths || !missingConcepts || !incorrectConcepts || !suggestedFollowUpAreas) return fail("list field invalid");

  const nextAction = String(decision.nextAction || "").toUpperCase();
  if (!NEXT_ACTION.includes(nextAction)) return fail("nextAction invalid");

  const question = typeof decision.question === "string" ? clip(decision.question, LIMITS.question) : "";
  const needsQuestion = nextAction === "ASK_FOLLOW_UP" || (nextAction === "ASK_NEXT_QUESTION" && !nextQuestionOptional) || nextAction === "ASK_CLARIFICATION";
  if (needsQuestion && !question) return fail("question missing for action");

  const difficulty = String(decision.difficulty || "").toUpperCase();

  return {
    ok: true,
    value: {
      evaluation: {
        status: "EVALUATED",
        answerQuality,
        score: Math.min(10, Math.max(0, Math.round(score))),
        strengths,
        missingConcepts,
        incorrectConcepts,
        reasoningSummary: clip(evaluation.reasoningSummary ?? "", LIMITS.reason),
        suggestedFollowUpAreas,
      },
      decision: {
        nextAction,
        reason: clip(decision.reason ?? "", LIMITS.reason),
        question,
        topic: clip(decision.topic ?? "", LIMITS.topic),
        difficulty: DIFFICULTY.includes(difficulty) ? difficulty : null,
      },
      summary: typeof raw.summary === "string" ? clip(raw.summary, LIMITS.summary) : null,
    },
  };
}

/** Validates a generated main question. */
function validateQuestion(raw) {
  if (!raw || typeof raw !== "object") return fail("not an object");
  const question = typeof raw.question === "string" ? clip(raw.question, LIMITS.question) : "";
  if (!question) return fail("question missing");
  const difficulty = String(raw.difficulty || "").toUpperCase();
  return {
    ok: true,
    value: {
      question,
      topic: clip(raw.topic ?? "", LIMITS.topic),
      difficulty: DIFFICULTY.includes(difficulty) ? difficulty : null,
      questionType: clip(raw.questionType ?? "", 40),
      evaluationCriteria: stringList(raw.evaluationCriteria) || [],
    },
  };
}

const sameText = (a, b) => String(a).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === String(b).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Validates a question generated for a template plan against that plan (the backend's configuration), not just its shape:
 * - the topic must be the planned topic (an off-topic question is rejected so the caller can retry);
 * - the question type must be one the topic allows, otherwise the planned type is used;
 * - it must be a main question (isFollowUp false, no parent);
 * - referenceId is kept only when it names one of the reference questions that were offered.
 * plan: { topic: {name, questionTypes}, questionType, difficulty, references: [{id, evaluationCriteria}] }
 */
function validateTemplateQuestion(raw, plan) {
  const base = validateQuestion(raw);
  if (!base.ok) return base;
  if (!sameText(base.value.topic, plan.topic.name)) return fail(`topic "${base.value.topic}" is not the planned topic "${plan.topic.name}"`);
  if (raw.isFollowUp === true || (raw.parentQuestionId !== undefined && raw.parentQuestionId !== null)) return fail("a follow-up was returned where a main question is required");
  const requested = String(base.value.questionType || "").toUpperCase();
  const questionType = plan.topic.questionTypes.includes(requested) ? requested : plan.questionType;
  const reference = (plan.references || []).find((r) => r.id === raw.referenceId) ?? null;
  const evaluationCriteria = base.value.evaluationCriteria.length ? base.value.evaluationCriteria : reference?.evaluationCriteria?.slice(0, LIMITS.list) ?? plan.topic.evaluationCriteria?.slice(0, LIMITS.list) ?? [];
  return {
    ok: true,
    value: {
      ...base.value,
      topic: plan.topic.name,
      difficulty: base.value.difficulty ?? plan.difficulty,
      questionType,
      typeCorrected: questionType !== requested,
      evaluationCriteria,
      reference,
    },
  };
}

module.exports = { ANSWER_QUALITY, NEXT_ACTION, DIFFICULTY, parseJsonObject, validateAnalysis, validateQuestion, validateTemplateQuestion };
