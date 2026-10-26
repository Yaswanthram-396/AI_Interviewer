/**
 * Pure interview rules. The model recommends an action; `decideAction` is where the backend
 * accepts, downgrades, or overrides it, so limits hold no matter what the model says.
 */
const { DIFFICULTY } = require("./analysis");

const ACTION = Object.freeze({
  ASK_FOLLOW_UP: "ASK_FOLLOW_UP",
  ASK_NEXT_QUESTION: "ASK_NEXT_QUESTION",
  ASK_CLARIFICATION: "ASK_CLARIFICATION",
  REPEAT_QUESTION: "REPEAT_QUESTION",
  SKIP_QUESTION: "SKIP_QUESTION",
  END_INTERVIEW: "END_INTERVIEW",
});

const normalizeQuestion = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Token-overlap similarity (Jaccard) in [0, 1]. Enough to catch rephrased repeats. */
function similarity(a, b) {
  const sa = new Set(normalizeQuestion(a).split(" ").filter((w) => w.length > 2));
  const sb = new Set(normalizeQuestion(b).split(" ").filter((w) => w.length > 2));
  if (!sa.size || !sb.size) return 0;
  let shared = 0;
  for (const w of sa) if (sb.has(w)) shared += 1;
  return shared / (sa.size + sb.size - shared);
}

function isDuplicateQuestion(text, askedTexts, threshold = 0.8) {
  const n = normalizeQuestion(text);
  return askedTexts.some((asked) => normalizeQuestion(asked) === n || similarity(asked, text) >= threshold);
}

/**
 * Difficulty moves one step at a time and only from sustained performance
 * (mean of the last `window` scores, at least `window` samples), never from a single answer.
 */
function nextDifficulty(current, recentScores, { window = 3, upAt = 8, downAt = 4 } = {}) {
  const scores = recentScores.slice(-window);
  if (scores.length < window) return current;
  const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  const index = DIFFICULTY.indexOf(current);
  if (index === -1) return current;
  if (mean >= upAt) return DIFFICULTY[Math.min(index + 1, DIFFICULTY.length - 1)];
  if (mean <= downAt) return DIFFICULTY[Math.max(index - 1, 0)];
  return current;
}

/**
 * state:  { followUpCount, clarificationCount, repeatCount, mainCount }
 * limits: { maxFollowUps, maxClarifications, maxRepeats, maxMainQuestions }
 * clock:  { timeUp, timeTight, topicOverBudget } the interview's time is spent / too short for the remaining
 *         questions / the current topic has used more than its allocation
 * Returns { action, overridden, reason } where `overridden` marks a change to the model's choice.
 */
function decideAction({ recommended, state, limits, clock = {} }) {
  let action = recommended;
  let reason = null;
  const override = (next, why) => {
    action = next;
    reason = why;
  };

  if (action === ACTION.ASK_FOLLOW_UP && state.followUpCount >= limits.maxFollowUps) {
    override(ACTION.ASK_NEXT_QUESTION, "follow_up_limit");
  }
  // Short on time (the interview's, or the topic's own allocation): main questions come first, so no follow-up chains.
  if (action === ACTION.ASK_FOLLOW_UP && (clock.timeTight || clock.topicOverBudget)) {
    override(ACTION.ASK_NEXT_QUESTION, "time_pressure");
  }
  if (action === ACTION.ASK_CLARIFICATION && state.clarificationCount >= limits.maxClarifications) {
    override(ACTION.ASK_NEXT_QUESTION, "clarification_limit");
  }
  if (action === ACTION.REPEAT_QUESTION && state.repeatCount >= limits.maxRepeats) {
    override(ACTION.ASK_NEXT_QUESTION, "repeat_limit");
  }
  if (action === ACTION.SKIP_QUESTION) action = ACTION.ASK_NEXT_QUESTION;

  const questionsExhausted = state.mainCount >= limits.maxMainQuestions;
  // The model cannot end the interview early (e.g. because the candidate's answer told it to).
  if (action === ACTION.END_INTERVIEW && !questionsExhausted && !clock.timeUp) {
    override(ACTION.ASK_NEXT_QUESTION, "early_end_rejected");
  }
  if (action === ACTION.ASK_NEXT_QUESTION && questionsExhausted) override(ACTION.END_INTERVIEW, "question_limit");
  if (clock.timeUp && action !== ACTION.END_INTERVIEW) override(ACTION.END_INTERVIEW, "time_up");

  return { action, overridden: reason !== null, reason };
}

module.exports = { ACTION, normalizeQuestion, similarity, isDuplicateQuestion, nextDifficulty, decideAction };
