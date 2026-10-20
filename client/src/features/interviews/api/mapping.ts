/**
 * Translation between the backend's interview document and the UI's InterviewRecord. Pure and
 * defensive: the backend may hold interviews created before settings existed, so every field has a
 * sensible fallback instead of assuming the new shape.
 */
import { blankInterviewConfig, defaultBehavior, newTopicId } from "../defaults";
import type { Assignment, AssignmentStatus, BehaviorConfig, DifficultyLevel, InterviewConfig, InterviewRecord, InterviewStatus, InterviewType, TopicConfig, TopicDifficulty } from "../types";

interface RawAssignment {
  _id: string;
  name?: string;
  email: string;
  externalId?: string;
  status?: AssignmentStatus;
  invitedAt?: string;
  completedAt?: string;
  sessionId?: string;
}

export interface RawInterview {
  _id: string;
  title: string;
  description?: string;
  difficulty?: string;
  timeLimit?: number;
  status?: InterviewStatus;
  code?: string;
  settings?: Partial<Omit<InterviewConfig, "title" | "description" | "durationMinutes" | "topics" | "behavior">> & {
    topics?: Partial<TopicConfig>[];
    behavior?: Partial<BehaviorConfig>;
  };
  assignments?: RawAssignment[];
  createdAt?: string;
  updatedAt?: string;
  createdDate?: string;
}

const BACKEND_DIFFICULTY = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced", adaptive: "Intermediate" } as const;

const asTopicDifficulty = (value: unknown): TopicDifficulty => (value === "beginner" || value === "advanced" ? value : "intermediate");

function mapAssignment(raw: RawAssignment): Assignment {
  return {
    id: String(raw._id),
    name: raw.name || raw.email.split("@")[0],
    email: raw.email,
    candidateId: raw.externalId,
    status: raw.status ?? "invited",
    invitedAt: raw.invitedAt ?? new Date(0).toISOString(),
    completedAt: raw.completedAt,
    // For a finished interview the report is addressed by its session.
    reportId: raw.status === "completed" ? raw.sessionId : undefined,
  };
}

export function fromBackend(raw: RawInterview): InterviewRecord {
  const base = blankInterviewConfig();
  const settings = raw.settings ?? {};
  const assignments = (raw.assignments ?? []).map(mapAssignment);
  const published = (raw.status ?? "active") !== "draft";
  const everyoneDone = assignments.length > 0 && assignments.every((assignment) => assignment.status === "completed");
  // The backend keeps published interviews "active"; "completed" is derived when everyone has finished.
  const status: InterviewStatus = raw.status === "active" || raw.status === undefined ? (everyoneDone ? "completed" : "active") : raw.status;
  const fallbackDifficulty = String(raw.difficulty ?? "Intermediate").toLowerCase() as DifficultyLevel;

  return {
    ...base,
    title: raw.title,
    description: raw.description ?? "",
    role: settings.role || raw.title,
    department: settings.department ?? "",
    company: settings.company ?? "",
    instructions: settings.instructions || base.instructions,
    type: (settings.type as InterviewType) ?? "technical",
    difficulty: (settings.difficulty as DifficultyLevel) ?? fallbackDifficulty,
    durationMinutes: raw.timeLimit ?? 15,
    mainQuestions: settings.mainQuestions ?? 5,
    maxFollowUps: settings.maxFollowUps ?? 2,
    language: settings.language ?? base.language,
    topics: (settings.topics ?? []).map((topic) => ({
      id: newTopicId(),
      name: topic.name ?? "",
      weight: topic.weight ?? 0,
      questions: topic.questions ?? 0,
      difficulty: asTopicDifficulty(topic.difficulty),
    })),
    behavior: { ...defaultBehavior(), ...settings.behavior, personality: settings.behavior?.personality?.length ? settings.behavior.personality : defaultBehavior().personality },
    id: String(raw._id),
    code: raw.code ?? String(raw._id).slice(-6).toUpperCase(),
    status,
    createdAt: raw.createdAt ?? raw.createdDate ?? new Date(0).toISOString(),
    updatedAt: raw.updatedAt ?? raw.createdAt ?? new Date(0).toISOString(),
    publishedAt: published ? (raw.createdAt ?? raw.createdDate) : undefined,
    assignments,
    backendId: String(raw._id), // the record *is* the backend interview
  };
}

/** The body for create/update. `settings` carries everything the backend does not model as a column. */
export function toBackendBody(config: InterviewConfig) {
  return {
    title: config.title.trim(),
    description: config.description,
    difficulty: BACKEND_DIFFICULTY[config.difficulty],
    timeLimit: config.durationMinutes,
    settings: {
      role: config.role,
      department: config.department,
      company: config.company,
      instructions: config.instructions,
      type: config.type,
      difficulty: config.difficulty,
      language: config.language,
      mainQuestions: config.mainQuestions,
      maxFollowUps: config.maxFollowUps,
      topics: config.topics.map(({ name, weight, questions, difficulty }) => ({ name, weight, questions, difficulty })),
      behavior: config.behavior,
    },
  };
}

export const toAssigneeBody = (assignment: Pick<Assignment, "name" | "email" | "candidateId">) => ({
  name: assignment.name,
  email: assignment.email,
  externalId: assignment.candidateId,
});

/** What changed between the stored assignments and the form's list: who to add and whom to remove. */
export function diffAssignments(existing: readonly Assignment[], next: readonly Assignment[]) {
  const existingIds = new Set(existing.map((assignment) => assignment.id));
  const nextIds = new Set(next.map((assignment) => assignment.id));
  return {
    add: next.filter((assignment) => !existingIds.has(assignment.id)),
    remove: existing.filter((assignment) => !nextIds.has(assignment.id)),
  };
}
