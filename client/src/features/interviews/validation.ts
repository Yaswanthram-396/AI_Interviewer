import type { Assignment, InterviewConfig, TopicConfig } from "./types";

export type FieldErrors = Partial<Record<string, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidEmail = (value: string) => EMAIL.test(value.trim());

export const topicWeightTotal = (topics: readonly TopicConfig[]) => topics.reduce((sum, topic) => sum + (Number.isFinite(topic.weight) ? topic.weight : 0), 0);

export const topicQuestionTotal = (topics: readonly TopicConfig[]) => topics.reduce((sum, topic) => sum + (Number.isFinite(topic.questions) ? topic.questions : 0), 0);

/** Spreads 100% across topics as evenly as whole numbers allow (the first topics get the remainder). */
export function evenWeights(count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(100 / count);
  const remainder = 100 - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

/**
 * Validates what is needed to *publish*. A draft can be saved with anything, so these rules only
 * run on publish (and to show inline hints while editing).
 */
export function validateForPublish(config: InterviewConfig, assignments: readonly Pick<Assignment, "email">[] = []): FieldErrors {
  const errors: FieldErrors = {};
  if (config.title.trim().length < 5) errors.title = "Give the interview a title of at least 5 characters.";
  if (!config.role.trim()) errors.role = "Enter the job role being interviewed for.";
  if (!config.description.trim()) errors.description = "Add a short description so candidates know what to expect.";
  if (!Number.isFinite(config.durationMinutes) || config.durationMinutes < 5 || config.durationMinutes > 120) {
    errors.durationMinutes = "Duration must be between 5 and 120 minutes.";
  }
  if (!Number.isInteger(config.mainQuestions) || config.mainQuestions < 1 || config.mainQuestions > 20) {
    errors.mainQuestions = "Choose between 1 and 20 main questions.";
  }
  if (!Number.isInteger(config.maxFollowUps) || config.maxFollowUps < 0 || config.maxFollowUps > 5) {
    errors.maxFollowUps = "Follow-ups per question must be between 0 and 5.";
  }
  if (!errors.mainQuestions && config.topics.length > 0 && topicQuestionTotal(config.topics) !== config.mainQuestions) {
    errors.mainQuestions = `Topics add up to ${topicQuestionTotal(config.topics)} questions but main questions is ${config.mainQuestions}.`;
  }
  if (config.topics.length === 0) {
    errors.topics = "Add at least one topic to assess.";
  } else if (topicWeightTotal(config.topics) !== 100) {
    errors.topics = `Topic weightage must add up to 100% (currently ${topicWeightTotal(config.topics)}%).`;
  } else if (config.topics.some((topic) => !topic.name.trim())) {
    errors.topics = "Every topic needs a name.";
  }
  if (config.behavior.personality.length === 0) errors.personality = "Select at least one interviewer personality.";
  const seen = new Set<string>();
  for (const { email } of assignments) {
    const key = email.trim().toLowerCase();
    if (seen.has(key)) {
      errors.candidates = `${email} is assigned more than once.`;
      break;
    }
    seen.add(key);
  }
  return errors;
}

export function validateCandidate(input: { name: string; email: string }, existing: readonly Pick<Assignment, "email">[]): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.name.trim()) errors.name = "Enter the candidate's name.";
  if (!isValidEmail(input.email)) errors.email = "Enter a valid email address.";
  else if (existing.some((candidate) => candidate.email.trim().toLowerCase() === input.email.trim().toLowerCase())) {
    errors.email = "This candidate is already assigned.";
  }
  return errors;
}
