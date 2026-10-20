export type InterviewStatus = "draft" | "active" | "completed" | "archived";
export type InterviewType = "technical" | "frontend" | "backend" | "fullstack" | "system-design" | "behavioral";
export type DifficultyLevel = "beginner" | "intermediate" | "advanced" | "adaptive";
export type TopicDifficulty = Exclude<DifficultyLevel, "adaptive">;
export type Personality = "professional" | "friendly" | "challenging" | "balanced";
export type AssignmentStatus = "invited" | "not_started" | "in_progress" | "completed";

export interface TopicConfig {
  id: string;
  name: string;
  /** Share of the final score, in percent. All topics must total 100. */
  weight: number;
  difficulty: TopicDifficulty;
  questions: number;
}

export interface BehaviorConfig {
  contextualFollowUps: boolean;
  adaptiveDifficulty: boolean;
  allowRepeat: boolean;
  allowSkip: boolean;
  clarifications: boolean;
  voice: boolean;
  interruptions: boolean;
  personality: Personality[];
}

export interface Assignment {
  id: string;
  name: string;
  email: string;
  candidateId?: string;
  status: AssignmentStatus;
  invitedAt: string;
  /** 0-100 while in progress. */
  progress?: number;
  completedAt?: string;
  reportId?: string;
}

/** Everything an admin configures; the shape the create form edits. */
export interface InterviewConfig {
  title: string;
  role: string;
  department: string;
  company: string;
  description: string;
  instructions: string;
  type: InterviewType;
  difficulty: DifficultyLevel;
  durationMinutes: number;
  mainQuestions: number;
  maxFollowUps: number;
  language: string;
  topics: TopicConfig[];
  behavior: BehaviorConfig;
}

export interface InterviewRecord extends InterviewConfig {
  id: string;
  /** Short public identifier shown to admins and candidates. */
  code: string;
  status: InterviewStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  assignments: Assignment[];
  /** Id of the matching interview in the SIRI backend, once it has been synced. */
  backendId?: string;
}

export const INTERVIEW_TYPES: readonly { value: InterviewType; label: string }[] = [
  { value: "technical", label: "Technical" },
  { value: "frontend", label: "Frontend" },
  { value: "backend", label: "Backend" },
  { value: "fullstack", label: "Full Stack" },
  { value: "system-design", label: "System Design" },
  { value: "behavioral", label: "Behavioral" },
];

export const DIFFICULTIES: readonly { value: DifficultyLevel; label: string; hint: string }[] = [
  { value: "beginner", label: "Beginner", hint: "Fundamentals and definitions" },
  { value: "intermediate", label: "Intermediate", hint: "Applied knowledge and trade-offs" },
  { value: "advanced", label: "Advanced", hint: "Depth, design and edge cases" },
  { value: "adaptive", label: "Adaptive", hint: "SIRI adjusts to the candidate's answers" },
];

export const PERSONALITIES: readonly { value: Personality; label: string; hint: string }[] = [
  { value: "professional", label: "Professional", hint: "Formal, concise and neutral" },
  { value: "friendly", label: "Friendly", hint: "Warm and encouraging" },
  { value: "challenging", label: "Challenging", hint: "Probing, asks for depth" },
  { value: "balanced", label: "Balanced", hint: "A mix of supportive and probing" },
];

export const LANGUAGES = ["English (US)", "English (UK)", "English (India)"] as const;

export const labelOf = <T extends string>(options: readonly { value: T; label: string }[], value: T) =>
  options.find((option) => option.value === value)?.label ?? value;

export const STATUS_LABEL: Record<InterviewStatus, string> = { draft: "Draft", active: "Active", completed: "Completed", archived: "Archived" };
export const ASSIGNMENT_LABEL: Record<AssignmentStatus, string> = {
  invited: "Invited",
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
};
