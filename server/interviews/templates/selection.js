/**
 * Pure helpers for planning the next main question of a template interview.
 * The backend decides the topic, type, difficulty and which reference questions to offer;
 * the model only phrases (or replaces) the question inside that plan.
 */
const { DIFFICULTIES } = require("./constants");

/** The Nth main question of a topic (0-based) uses the topic's question types in rotation. */
function pickQuestionType(questionTypes, ordinalInTopic) {
  if (!questionTypes?.length) return "CONCEPTUAL";
  return questionTypes[ordinalInTopic % questionTypes.length];
}

/**
 * The topic's configured difficulty, moved at most one step by sustained performance
 * (`current` is the engine's adaptive difficulty, `base` where it started). Without adaptation it is the configured difficulty.
 */
function plannedDifficulty(topicDifficulty, { current, base, adaptive = true }) {
  const topicIndex = DIFFICULTIES.indexOf(topicDifficulty);
  if (topicIndex === -1) return "INTERMEDIATE";
  if (!adaptive) return topicDifficulty;
  const offset = Math.max(-1, Math.min(1, DIFFICULTIES.indexOf(current) - DIFFICULTIES.indexOf(base)));
  const shifted = DIFFICULTIES.indexOf(current) === -1 || DIFFICULTIES.indexOf(base) === -1 ? 0 : offset;
  return DIFFICULTIES[Math.max(0, Math.min(DIFFICULTIES.length - 1, topicIndex + shifted))];
}

function shuffled(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Orders bank questions by how well they fit the plan, shuffling inside each tier so different candidates
 * get different questions: same type and difficulty, then same type, then anything else in the topic.
 */
function rankCandidates(questions, { difficulty, questionType, limit = 3, random = Math.random }) {
  const distance = (q) => Math.abs(DIFFICULTIES.indexOf(q.difficulty) - DIFFICULTIES.indexOf(difficulty));
  const tiers = [
    questions.filter((q) => q.questionType === questionType && q.difficulty === difficulty),
    questions.filter((q) => q.questionType === questionType && q.difficulty !== difficulty).sort((a, b) => distance(a) - distance(b)),
    questions.filter((q) => q.questionType !== questionType && q.difficulty === difficulty),
    questions.filter((q) => q.questionType !== questionType && q.difficulty !== difficulty),
  ];
  return tiers.flatMap((tier, i) => (i === 1 ? shuffledByDistance(tier, distance, random) : shuffled(tier, random))).slice(0, limit);
}

/** Keeps nearer difficulties first while shuffling questions of equal distance. */
function shuffledByDistance(sorted, distance, random) {
  const groups = new Map();
  for (const q of sorted) groups.set(distance(q), [...(groups.get(distance(q)) || []), q]);
  return [...groups.keys()].sort((a, b) => a - b).flatMap((d) => shuffled(groups.get(d), random));
}

/** What the model and the engine need to know about a bank question (never the answer points). */
const toReference = (doc) => ({
  id: String(doc._id),
  text: doc.questionText,
  questionType: doc.questionType,
  difficulty: doc.difficulty,
  expectedConcepts: doc.expectedConcepts || [],
  evaluationCriteria: doc.evaluationCriteria || [],
});

module.exports = { pickQuestionType, plannedDifficulty, rankCandidates, toReference };
