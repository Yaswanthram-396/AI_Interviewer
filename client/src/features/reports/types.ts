/**
 * The candidate report, as the UI consumes it. Every report says where it came from:
 *  - "demo":      hand-written sample data shipped with the product
 *  - "simulated": generated in the browser from a simulated interview (no AI model involved)
 *  - "backend":   assembled from evaluations the SIRI backend actually produced
 * The UI shows this plainly so a simulated evaluation is never mistaken for a real one.
 */
export type ReportSource = "demo" | "simulated" | "backend";
export type Priority = "high" | "medium" | "low";
export type ReadinessLevel = "interview-ready" | "almost-ready" | "needs-practice";
export type ReportDifficulty = "beginner" | "intermediate" | "advanced";

export interface QuestionEvaluation {
  id: string;
  number: number;
  topic: string;
  difficulty: ReportDifficulty;
  kind: "main" | "follow-up";
  question: string;
  answer: string;
  /** 0-10 */
  score: number;
  evaluation: string;
  correct: string[];
  missing: string[];
  /** Null when the backend does not generate one (only sample and simulated reports have it). */
  betterApproach: string | null;
  interviewerFeedback: string;
}

export interface Strength {
  title: string;
  topic: string;
  explanation: string;
  /** The question the strength was observed in. */
  question: string;
  /** A short quote from the candidate's own answer. */
  evidence: string;
}

export interface Improvement {
  area: string;
  /** 0-100 current performance in this area. */
  current: number;
  missing: string;
  whyItMatters: string | null;
  actions: string[];
  priority: Priority;
}

export interface TopicScore {
  topic: string;
  /** 0-100, or null when the topic was not covered in this interview. */
  score: number | null;
  weight: number;
  questionsAsked: number;
}

export interface CommunicationMetric {
  key: string;
  label: string;
  /** 0-100 */
  score: number;
  note: string;
}

export interface RoadmapItem {
  priority: number;
  level: Priority;
  topic: string;
  objective: string;
  steps: string[];
  resources: string[];
  estimatedHours: number | null;
}

export interface FinalAssessment {
  narrative: string[];
  /** Classified in the UI from the configured criteria when null. */
  readiness: ReadinessLevel | null;
  strongestSkill: string;
  biggestGap: string;
  nextStep: string;
}

export interface CandidateReport {
  id: string;
  interviewId: string;
  interviewTitle: string;
  role: string;
  candidate: { name: string; email: string };
  completedAt: string;
  durationMinutes: number;
  status: "completed";
  source: ReportSource;
  /** 0-100 */
  overall: number;
  summary: string;
  strengths: Strength[];
  improvements: Improvement[];
  topics: TopicScore[];
  questions: QuestionEvaluation[];
  /** Null when communication was not assessed (the backend does not assess it yet). */
  communication: { metrics: CommunicationMetric[]; note: string } | null;
  roadmap: RoadmapItem[];
  finalAssessment: FinalAssessment;
  /** Sections this report does not contain because the source did not produce them. */
  notAssessed?: string[];
}

/** The row shown in report lists. */
export type ReportSummary = Pick<CandidateReport, "id" | "interviewId" | "interviewTitle" | "candidate" | "completedAt" | "overall" | "source">;

export const SOURCE_LABEL: Record<ReportSource, { label: string; description: string }> = {
  demo: { label: "Sample report", description: "Illustrative sample data, not a real candidate." },
  simulated: {
    label: "Simulated evaluation",
    description: "Generated in the browser from a simulated interview. No AI model scored this.",
  },
  backend: { label: "SIRI evaluation", description: "Scored by the SIRI backend from the recorded interview." },
};
