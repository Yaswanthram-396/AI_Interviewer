"use client";

import { useSyncExternalStore } from "react";
import { createPersistentStore } from "@/lib/persistentStore";
import { seedReports } from "@/features/interviews/seed";
import { DEFAULT_READINESS, DEFAULT_THRESHOLDS, type PerformanceThresholds, type ReadinessCriteria } from "./scoring";
import type { CandidateReport } from "./types";

const isReportList = (value: unknown): value is CandidateReport[] =>
  Array.isArray(value) && value.every((item) => typeof item === "object" && item !== null && "overall" in item && "questions" in item);

export const reportStore = createPersistentStore<CandidateReport[]>("siri.reports.v1", () => seedReports(), isReportList);

export const reportCommands = {
  /** Adds (or replaces) a report, e.g. one generated after a simulated interview. */
  upsert(report: CandidateReport) {
    reportStore.set((all) => [report, ...all.filter((item) => item.id !== report.id)]);
  },
};

export function useReports(): CandidateReport[] {
  return useSyncExternalStore(reportStore.subscribe, reportStore.getSnapshot, reportStore.getServerSnapshot);
}

export function useReport(id: string | undefined): CandidateReport | undefined {
  return useReports().find((report) => report.id === id);
}

// ---- admin-configurable scoring --------------------------------------------

export interface ScoringSettings {
  thresholds: PerformanceThresholds;
  readiness: ReadinessCriteria;
}

const isSettings = (value: unknown): value is ScoringSettings => typeof value === "object" && value !== null && "thresholds" in value && "readiness" in value;

export const scoringStore = createPersistentStore<ScoringSettings>("siri.scoring.v1", () => ({ thresholds: DEFAULT_THRESHOLDS, readiness: DEFAULT_READINESS }), isSettings);

export function useScoringSettings(): ScoringSettings {
  return useSyncExternalStore(scoringStore.subscribe, scoringStore.getSnapshot, scoringStore.getServerSnapshot);
}
