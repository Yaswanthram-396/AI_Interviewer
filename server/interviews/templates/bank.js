/**
 * Shape and quality rules for a question bank, shared by the seeder and its tests.
 * A bank file maps a topic slug to an array of questions:
 *   { type, difficulty, text, concepts[], criteria[], points[], tags[] }
 */
const crypto = require("crypto");
const { DIFFICULTIES } = require("./constants");
const { isDuplicateQuestion, normalizeQuestion } = require("../../realtime/interview/policy");

const MAX_TEXT = 420;
const minBankSize = (topic) => topic.minBank ?? Math.max(6, topic.questionCount * 4);

/** Stable identity of a question within a topic: lets the seeder upsert without duplicating. */
const contentHash = (topicSlug, text) => crypto.createHash("sha1").update(`${topicSlug}:${normalizeQuestion(text)}`).digest("hex");

const isList = (value, min, max) => Array.isArray(value) && value.length >= min && value.length <= max && value.every((item) => typeof item === "string" && item.trim());

/** Returns a list of human-readable problems (empty when the bank is valid for the template). */
function validateBank(template, bank) {
  const errors = [];
  const slugs = new Set(template.topics.map((t) => t.slug));
  for (const key of Object.keys(bank)) if (!slugs.has(key)) errors.push(`unknown topic slug "${key}"`);
  for (const topic of template.topics) {
    const questions = bank[topic.slug];
    const where = `${template.slug}/${topic.slug}`;
    if (!Array.isArray(questions)) {
      errors.push(`${where}: missing`);
      continue;
    }
    if (questions.length < minBankSize(topic)) errors.push(`${where}: ${questions.length} questions, need at least ${minBankSize(topic)}`);
    const seen = [];
    questions.forEach((q, i) => {
      const at = `${where}#${i + 1}`;
      if (!topic.questionTypes.includes(q?.type)) errors.push(`${at}: type "${q?.type}" is not allowed for the topic (${topic.questionTypes.join(", ")})`);
      if (!DIFFICULTIES.includes(q?.difficulty)) errors.push(`${at}: invalid difficulty`);
      if (typeof q?.text !== "string" || q.text.trim().length < 20 || q.text.length > MAX_TEXT) errors.push(`${at}: text must be 20-${MAX_TEXT} characters`);
      if (!isList(q?.concepts, 2, 5)) errors.push(`${at}: concepts needs 2-5 strings`);
      if (!isList(q?.criteria, 2, 4)) errors.push(`${at}: criteria needs 2-4 strings`);
      if (!isList(q?.points, 2, 5)) errors.push(`${at}: points needs 2-5 strings`);
      if (!isList(q?.tags, 1, 4)) errors.push(`${at}: tags needs 1-4 strings`);
      if (typeof q?.text === "string") {
        if (isDuplicateQuestion(q.text, seen, 0.7)) errors.push(`${at}: duplicates another question in the topic`);
        seen.push(q.text);
      }
    });
    for (const type of topic.questionTypes) if (!questions.some((q) => q?.type === type)) errors.push(`${where}: no ${type} question`);
    if (new Set(questions.map((q) => q?.difficulty)).size < 2) errors.push(`${where}: needs at least two difficulty levels`);
    if (!questions.some((q) => q?.difficulty === topic.difficulty)) errors.push(`${where}: needs questions at the topic difficulty ${topic.difficulty}`);
  }
  return errors;
}

module.exports = { validateBank, contentHash, minBankSize, MAX_TEXT };
