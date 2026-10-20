/**
 * Turning a stored template into the objects the rest of the system uses. All functions are pure.
 *
 * - `buildTemplateSnapshot` is what a session freezes when a candidate starts: everything the interview
 *   engine needs, with no database references left to resolve and no question-bank content (bank questions
 *   are looked up per topic by id while the interview runs).
 * - `settingsFromSnapshot` expresses the same limits in the shape of an interview's `settings`, so the
 *   existing engine limits, topic weighting and report code work unchanged.
 */
const { slugify } = require("./validate");

const ID = (value) => String(value);
const CATEGORY_TO_INTERVIEW_TYPE = { javascript: "technical", frontend: "frontend", fullstack: "fullstack", database: "backend" };
const toTitleCase = (upper) => upper.charAt(0) + upper.slice(1).toLowerCase();

/** `topics` are InterviewTopic documents; they are ordered by `sequence` here, whatever order they were loaded in. */
function buildTemplateSnapshot(template, topics) {
  const ordered = [...topics].sort((a, b) => a.sequence - b.sequence);
  return {
    templateId: ID(template._id),
    slug: template.slug,
    version: template.version ?? 1,
    title: template.title,
    description: template.description,
    category: template.category,
    difficulty: template.difficulty,
    durationMinutes: template.durationMinutes,
    totalQuestions: template.totalQuestions,
    followUpLimit: template.followUpLimit,
    timing: { ...template.timing },
    evaluationCriteria: [...(template.evaluationCriteria || [])],
    aiInstructions: template.aiInstructions || "",
    topics: ordered.map((t) => ({
      id: ID(t._id),
      name: t.topicName,
      slug: t.slug,
      description: t.description,
      questionCount: t.questionCount,
      allocatedMinutes: t.allocatedMinutes,
      difficulty: t.difficulty,
      weightage: t.weightage,
      sequence: t.sequence,
      questionTypes: [...t.questionTypes],
      evaluationCriteria: [...(t.evaluationCriteria || [])],
    })),
  };
}

/** The limits of a snapshot in the `settings` shape (names, weights, question counts, follow-ups). */
function settingsFromSnapshot(snapshot, base = {}) {
  return {
    ...base,
    mainQuestions: snapshot.totalQuestions,
    maxFollowUps: snapshot.followUpLimit,
    topics: snapshot.topics.map((t) => ({ name: t.name, weight: t.weightage, questions: t.questionCount, difficulty: t.difficulty.toLowerCase() })),
  };
}

/** Settings for a new Interview created from a template (passed through `normalizeSettings` by the caller). */
function interviewSettingsFromSnapshot(snapshot) {
  return {
    ...settingsFromSnapshot(snapshot),
    role: snapshot.title.slice(0, 100),
    type: CATEGORY_TO_INTERVIEW_TYPE[snapshot.category] || "technical",
    difficulty: "adaptive",
  };
}

const interviewDifficulty = (snapshot) => toTitleCase(snapshot.difficulty);

module.exports = { buildTemplateSnapshot, settingsFromSnapshot, interviewSettingsFromSnapshot, interviewDifficulty, slugify };
