/**
 * Validation and normalisation of the per-interview settings an admin configures. Everything here
 * is untrusted input: unknown keys are dropped, strings are bounded, numbers are range-checked.
 */
const TYPES = ["technical", "frontend", "backend", "fullstack", "system-design", "behavioral"];
const DIFFICULTIES = ["beginner", "intermediate", "advanced"];
const PERSONALITIES = ["professional", "friendly", "challenging", "balanced"];
const BEHAVIOR_FLAGS = ["contextualFollowUps", "adaptiveDifficulty", "clarifications", "allowRepeat", "allowSkip", "voice", "interruptions"];
const MAX_TOPICS = 30;
const MAX_MAIN_QUESTIONS = 60;

const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const int = (value, min, max) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/**
 * Returns { ok: true, value } or { ok: false, message }. When `publishing`, topic weights must
 * total exactly 100 and question counts must match the main question count.
 */
function normalizeSettings(input, { publishing = false } = {}) {
  if (input === undefined || input === null) return { ok: true, value: undefined };
  if (typeof input !== "object" || Array.isArray(input)) return { ok: false, message: "settings must be an object" };

  const mainQuestions = int(input.mainQuestions ?? 6, 1, MAX_MAIN_QUESTIONS);
  const maxFollowUps = int(input.maxFollowUps ?? 2, 0, 5);
  if (mainQuestions === null) return { ok: false, message: `mainQuestions must be between 1 and ${MAX_MAIN_QUESTIONS}` };
  if (maxFollowUps === null) return { ok: false, message: "maxFollowUps must be between 0 and 5" };

  const rawTopics = Array.isArray(input.topics) ? input.topics.slice(0, MAX_TOPICS) : [];
  const topics = [];
  for (const topic of rawTopics) {
    const name = text(topic?.name, 60);
    const weight = int(topic?.weight, 0, 100);
    const questions = int(topic?.questions ?? 1, 0, 10);
    if (!name || weight === null || questions === null) return { ok: false, message: "each topic needs a name, a weight 0-100 and 0-10 questions" };
    if (topics.some((t) => t.name.toLowerCase() === name.toLowerCase())) return { ok: false, message: `duplicate topic: ${name}` };
    topics.push({ name, weight, questions, difficulty: DIFFICULTIES.includes(topic?.difficulty) ? topic.difficulty : "intermediate" });
  }
  if (publishing) {
    if (topics.length === 0) return { ok: false, message: "at least one topic is required" };
    const total = topics.reduce((sum, t) => sum + t.weight, 0);
    if (total !== 100) return { ok: false, message: `topic weights must total 100 (currently ${total})` };
    const questionTotal = topics.reduce((sum, t) => sum + t.questions, 0);
    if (questionTotal !== mainQuestions) return { ok: false, message: `topics add up to ${questionTotal} questions but mainQuestions is ${mainQuestions}` };
  }

  const behavior = {};
  for (const flag of BEHAVIOR_FLAGS) behavior[flag] = input.behavior?.[flag] === undefined ? flag !== "interruptions" : input.behavior[flag] === true;
  const personality = (Array.isArray(input.behavior?.personality) ? input.behavior.personality : ["professional", "friendly"]).filter((p, i, all) => PERSONALITIES.includes(p) && all.indexOf(p) === i);
  if (personality.length === 0) return { ok: false, message: "at least one personality is required" };

  return {
    ok: true,
    value: {
      role: text(input.role, 100),
      department: text(input.department, 100),
      company: text(input.company, 100),
      instructions: text(input.instructions, 1500),
      type: TYPES.includes(input.type) ? input.type : "technical",
      difficulty: [...DIFFICULTIES, "adaptive"].includes(input.difficulty) ? input.difficulty : "adaptive",
      language: text(input.language, 40) || "English (US)",
      mainQuestions,
      maxFollowUps,
      topics,
      behavior: { ...behavior, personality },
    },
  };
}

/** Normalises candidates to be assigned: unique, lowercase emails; names default to the email prefix. */
function normalizeAssignees(input, existing = []) {
  if (input === undefined) return { ok: true, value: [] };
  if (!Array.isArray(input) || input.length > 200) return { ok: false, message: "assignments must be a list of at most 200 candidates" };
  const seen = new Set(existing.map((a) => String(a.email).toLowerCase()));
  const out = [];
  for (const item of input) {
    const email = text(item?.email, 200).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: `invalid email: ${email || "(empty)"}` };
    if (seen.has(email)) continue; // already assigned: adding twice is a no-op, not an error
    seen.add(email);
    out.push({ email, name: text(item?.name, 120) || email.split("@")[0], externalId: text(item?.externalId, 60) || undefined });
  }
  return { ok: true, value: out };
}

const randomCode = (random = Math.random) => `SIRI-${Array.from({ length: 4 }, () => "0123456789ABCDEF"[Math.floor(random() * 16)]).join("")}`;

module.exports = { normalizeSettings, normalizeAssignees, randomCode, TYPES, DIFFICULTIES, PERSONALITIES };
