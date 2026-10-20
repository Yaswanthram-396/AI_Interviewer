/**
 * Validation of an interview template configuration. Used by the seeder, the template API and the tests,
 * so every template in the database satisfies the same invariants:
 *  - totalQuestions is exactly the sum of the topics' question counts;
 *  - topic weightage totals 100;
 *  - topic time (plus opening, closing and topic transitions) fits inside the duration.
 */
const { DIFFICULTIES, QUESTION_TYPE_LIST } = require("./constants");

const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const num = (value, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const int = (value, min, max) => {
  const n = num(value, min, max);
  return n !== null && Number.isInteger(n) ? n : null;
};
const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
const round2 = (n) => Math.round(n * 100) / 100;

/** Minutes spent moving between topics. */
const transitionMinutes = (topicCount, transitionSeconds) => (Math.max(0, topicCount - 1) * transitionSeconds) / 60;

/** Main questions per difficulty, derived from the topics. */
function difficultyDistribution(topics) {
  const out = { BEGINNER: 0, INTERMEDIATE: 0, ADVANCED: 0 };
  for (const t of topics) out[t.difficulty] += t.questionCount;
  return out;
}

/** Where the interview's minutes go. `slackMinutes` must not be negative. */
function timeBudget({ durationMinutes, timing, topics }) {
  const allocated = round2(topics.reduce((sum, t) => sum + t.allocatedMinutes, 0));
  const transitions = round2(transitionMinutes(topics.length, timing.transitionSeconds));
  const fixed = round2(timing.openingMinutes + timing.closingMinutes + transitions);
  return { allocatedMinutes: allocated, transitionMinutes: transitions, fixedMinutes: fixed, slackMinutes: round2(durationMinutes - allocated - fixed) };
}

/**
 * Checks a normalized configuration. Returns a list of problems (empty when valid).
 * Expects: { durationMinutes, totalQuestions, followUpLimit, timing, topics: [{ name, slug, questionCount, allocatedMinutes, weightage, ... }] }
 */
function validateTemplateConfig(config) {
  const errors = [];
  const { topics } = config;
  if (!Array.isArray(topics) || topics.length === 0) return ["at least one topic is required"];

  const questionTotal = topics.reduce((sum, t) => sum + t.questionCount, 0);
  if (questionTotal !== config.totalQuestions) errors.push(`topic question counts add up to ${questionTotal}, but totalQuestions is ${config.totalQuestions}`);

  const weightTotal = topics.reduce((sum, t) => sum + t.weightage, 0);
  if (Math.abs(weightTotal - 100) > 1e-9) errors.push(`topic weightage must total 100 (currently ${weightTotal})`);

  const budget = timeBudget(config);
  if (budget.allocatedMinutes > config.durationMinutes) errors.push(`topic time (${budget.allocatedMinutes} min) exceeds the ${config.durationMinutes} minute duration`);
  else if (budget.slackMinutes < 0) errors.push(`topic time plus opening, closing and transitions (${round2(budget.allocatedMinutes + budget.fixedMinutes)} min) exceeds the ${config.durationMinutes} minute duration`);

  const names = new Set();
  const slugs = new Set();
  topics.forEach((t, i) => {
    if (names.has(t.name.toLowerCase())) errors.push(`duplicate topic name: ${t.name}`);
    if (slugs.has(t.slug)) errors.push(`duplicate topic slug: ${t.slug}`);
    names.add(t.name.toLowerCase());
    slugs.add(t.slug);
    if (t.sequence !== i + 1) errors.push(`topic "${t.name}" has sequence ${t.sequence}, expected ${i + 1}`);
    if (t.questionCount > 0 && t.allocatedMinutes <= 0) errors.push(`topic "${t.name}" has questions but no allocated time`);
  });
  return errors;
}

/**
 * Normalizes untrusted template input (API request). Unknown keys are dropped, strings are bounded and enums are closed.
 * Returns { ok: true, value } or { ok: false, message }. `totalQuestions` is always derived from the topics.
 */
function normalizeTemplateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, message: "body must be an object" };
  const title = text(input.title, 100);
  if (title.length < 5) return { ok: false, message: "title must be 5-100 characters" };
  const description = text(input.description, 1000);
  if (!description) return { ok: false, message: "description is required" };
  const category = slugify(text(input.category, 40));
  if (!category) return { ok: false, message: "category is required" };
  const durationMinutes = num(input.durationMinutes, 5, 240);
  if (durationMinutes === null) return { ok: false, message: "durationMinutes must be between 5 and 240" };
  const followUpLimit = int(input.followUpLimit ?? 2, 0, 5);
  if (followUpLimit === null) return { ok: false, message: "followUpLimit must be between 0 and 5" };
  const difficulty = input.difficulty === undefined ? "INTERMEDIATE" : String(input.difficulty).toUpperCase();
  if (!DIFFICULTIES.includes(difficulty)) return { ok: false, message: "difficulty must be BEGINNER, INTERMEDIATE or ADVANCED" };

  const rawTiming = input.timing || {};
  const timing = {
    openingMinutes: num(rawTiming.openingMinutes ?? 1, 0, 30),
    closingMinutes: num(rawTiming.closingMinutes ?? 1, 0, 30),
    transitionSeconds: num(rawTiming.transitionSeconds ?? 10, 0, 300),
    approxAnswerSeconds: num(rawTiming.approxAnswerSeconds ?? 90, 10, 600),
  };
  if (Object.values(timing).includes(null)) return { ok: false, message: "timing values are out of range" };

  if (!Array.isArray(input.topics) || input.topics.length === 0 || input.topics.length > 30) return { ok: false, message: "topics must be a list of 1-30 topics" };
  const topics = [];
  for (const [i, raw] of input.topics.entries()) {
    const name = text(raw?.name ?? raw?.topicName, 80);
    const questionCount = int(raw?.questionCount, 0, 20);
    const allocatedMinutes = num(raw?.allocatedMinutes, 0, 240);
    const weightage = num(raw?.weightage, 0, 100);
    const topicDifficulty = raw?.difficulty === undefined ? "INTERMEDIATE" : String(raw.difficulty).toUpperCase();
    const questionTypes = Array.isArray(raw?.questionTypes) ? [...new Set(raw.questionTypes.map((t) => String(t).toUpperCase()))] : [];
    if (!name || questionCount === null || allocatedMinutes === null || weightage === null) return { ok: false, message: `topic ${i + 1} needs a name, questionCount, allocatedMinutes and weightage` };
    if (!DIFFICULTIES.includes(topicDifficulty)) return { ok: false, message: `topic "${name}" has an invalid difficulty` };
    if (questionTypes.length === 0 || !questionTypes.every((t) => QUESTION_TYPE_LIST.includes(t))) return { ok: false, message: `topic "${name}" needs valid questionTypes (${QUESTION_TYPE_LIST.join(", ")})` };
    topics.push({
      name,
      slug: slugify(raw?.slug || name),
      description: text(raw?.description, 600) || name,
      questionCount,
      allocatedMinutes,
      difficulty: topicDifficulty,
      weightage,
      sequence: i + 1,
      questionTypes,
      evaluationCriteria: (Array.isArray(raw?.evaluationCriteria) ? raw.evaluationCriteria : []).map((c) => text(c, 200)).filter(Boolean).slice(0, 8),
    });
  }

  const value = {
    title,
    slug: slugify(input.slug || title),
    description,
    category,
    durationMinutes,
    totalQuestions: topics.reduce((sum, t) => sum + t.questionCount, 0),
    difficulty,
    followUpLimit,
    timing,
    evaluationCriteria: (Array.isArray(input.evaluationCriteria) ? input.evaluationCriteria : []).map((c) => text(c, 200)).filter(Boolean).slice(0, 10),
    aiInstructions: text(input.aiInstructions, 1500),
    topics,
  };
  const errors = validateTemplateConfig(value);
  if (errors.length) return { ok: false, message: errors[0] };
  return { ok: true, value: { ...value, difficultyDistribution: difficultyDistribution(topics) } };
}

module.exports = { validateTemplateConfig, normalizeTemplateInput, difficultyDistribution, timeBudget, transitionMinutes, slugify };
