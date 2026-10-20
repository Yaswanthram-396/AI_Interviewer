import { authSession } from "@/features/auth/services/authSession.instance";
import { ApiError } from "@/features/auth/services/authSession";
import type { CandidateReport, ReportSummary } from "../types";

export async function listReportSummaries(): Promise<ReportSummary[]> {
  const { reports } = await authSession.request<{ reports: (Omit<ReportSummary, "source"> & { completedAt: string | null })[] }>("/api/reports");
  return reports.map((report) => ({ ...report, completedAt: report.completedAt ?? new Date(0).toISOString(), source: "backend" as const }));
}

/** The full report, or null when there is none (404: unknown id, not yours, or too little was scored). */
export async function fetchReport(id: string): Promise<CandidateReport | null> {
  try {
    const { report } = await authSession.request<{ report: CandidateReport }>(`/api/reports/${encodeURIComponent(id)}`);
    return report;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
