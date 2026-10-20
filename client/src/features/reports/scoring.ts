import type { ReadinessLevel, TopicScore } from "./types";

export type PerformanceLevel = "excellent" | "strong" | "good" | "needs-improvement" | "poor";

/** Lower bound (inclusive) of each level. Anything below `needsImprovement` is "poor". */
export interface PerformanceThresholds {
  excellent: number;
  strong: number;
  good: number;
  needsImprovement: number;
}

export const DEFAULT_THRESHOLDS: PerformanceThresholds = { excellent: 90, strong: 75, good: 60, needsImprovement: 40 };

/**
 * Readiness is a function of explicit, editable criteria. It describes preparation for this
 * interview format; it is not a hiring prediction.
 */
export interface ReadinessCriteria {
  /** Overall score needed for "Interview Ready". */
  readyAt: number;
  /** Overall score needed for "Almost Ready". */
  almostAt: number;
  /** An assessed topic below this score caps readiness at "Almost Ready". */
  minTopicScore: number;
}

export const DEFAULT_READINESS: ReadinessCriteria = { readyAt: 75, almostAt: 60, minTopicScore: 50 };

export const LEVEL_LABEL: Record<PerformanceLevel, string> = {
  excellent: "Excellent Performance",
  strong: "Strong Performance",
  good: "Good Performance",
  "needs-improvement": "Needs Improvement",
  poor: "Poor Performance",
};

export const READINESS_LABEL: Record<ReadinessLevel, string> = {
  "interview-ready": "Interview Ready",
  "almost-ready": "Almost Ready",
  "needs-practice": "Needs More Practice",
};

export function performanceLevel(score: number, thresholds: PerformanceThresholds = DEFAULT_THRESHOLDS): PerformanceLevel {
  if (score >= thresholds.excellent) return "excellent";
  if (score >= thresholds.strong) return "strong";
  if (score >= thresholds.good) return "good";
  if (score >= thresholds.needsImprovement) return "needs-improvement";
  return "poor";
}

/** Thresholds must be strictly descending and within 1..100 to be meaningful. */
export function validateThresholds(t: PerformanceThresholds): string | null {
  const ordered = [t.excellent, t.strong, t.good, t.needsImprovement];
  if (ordered.some((value) => !Number.isFinite(value) || value < 1 || value > 100)) return "Every threshold must be between 1 and 100.";
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index] >= ordered[index - 1]) return "Thresholds must decrease from Excellent down to Needs Improvement.";
  }
  return null;
}

export function readinessFor(overall: number, topics: readonly TopicScore[], criteria: ReadinessCriteria = DEFAULT_READINESS): ReadinessLevel {
  const weakTopic = topics.some((topic) => topic.score !== null && topic.score < criteria.minTopicScore);
  if (overall >= criteria.readyAt && !weakTopic) return "interview-ready";
  if (overall >= criteria.almostAt) return "almost-ready";
  return "needs-practice";
}

/** Weighted mean over topics that were actually assessed; uncovered topics neither help nor hurt. */
export function weightedOverall(topics: readonly TopicScore[]): number {
  const assessed = topics.filter((topic) => topic.score !== null && topic.weight > 0);
  const totalWeight = assessed.reduce((sum, topic) => sum + topic.weight, 0);
  if (totalWeight === 0) return 0;
  return Math.round(assessed.reduce((sum, topic) => sum + (topic.score as number) * topic.weight, 0) / totalWeight);
}

/** Tone used for score visuals: green when strong, amber when it needs work, neutral otherwise. */
export const scoreTone = (score: number): "brand" | "accent" | "muted" => (score >= 70 ? "brand" : score >= 50 ? "accent" : "muted");
