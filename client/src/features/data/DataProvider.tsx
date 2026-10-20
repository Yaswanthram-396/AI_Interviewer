"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createInterview, addAssignments, listInterviews, patchInterview, setInterviewStatus, syncAssignments } from "@/features/interviews/api/interviewApi";
import { interviewCommands as demoInterviewCommands, interviewStore } from "@/features/interviews/interviewStore";
import { assignedTo, liveCandidateInterviews, type AssignedInterview } from "@/features/interviews/candidateView";
import type { Assignment, InterviewConfig, InterviewRecord } from "@/features/interviews/types";
import { fetchReport, listReportSummaries } from "@/features/reports/api/reportApi";
import { reportCommands, reportStore } from "@/features/reports/reportStore";
import type { CandidateReport, ReportSummary } from "@/features/reports/types";
import { useSession } from "@/features/session/useSession";
import { useSyncExternalStore } from "react";

export type DataMode = "demo" | "live";
export type LoadStatus = "loading" | "ready" | "error";

/** Everything pages can do to interviews. Async because the live implementation talks to the API. */
export interface InterviewCommands {
  saveDraft(config: InterviewConfig, assignments: Assignment[], existingId?: string): Promise<InterviewRecord>;
  publish(config: InterviewConfig, assignments: Assignment[], existingId?: string): Promise<InterviewRecord>;
  duplicate(id: string): Promise<InterviewRecord | null>;
  archive(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  addAssignments(interviewId: string, assignments: Assignment[]): Promise<void>;
  /** Demo only: the live backend tracks assignment progress itself. */
  patchAssignment(interviewId: string, assignmentId: string, patch: Partial<Assignment>): void;
  /** Demo only: keeps a report produced by a simulated interview. */
  recordSimulatedReport(report: CandidateReport): void;
}

interface DataValue {
  mode: DataMode;
  interviews: InterviewRecord[];
  interviewsStatus: LoadStatus;
  interviewsError: string | null;
  reports: ReportSummary[];
  reportsStatus: LoadStatus;
  refresh(): Promise<InterviewRecord[]>;
  commands: InterviewCommands;
  loadReport(id: string, options?: { retries?: number }): Promise<CandidateReport | null>;
}

const DataContext = createContext<DataValue | null>(null);

const message = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong.");
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One place that decides where data comes from. A real (API) session reads and writes the SIRI
 * backend; a demo session uses the sample data kept in the browser. Pages never branch on this.
 */
export function DataProvider({ children }: { children: ReactNode }) {
  const { state } = useSession();
  const userKey = state.status === "authenticated" ? `${state.user.source}:${state.user.id}` : null;
  const mode: DataMode = state.status === "authenticated" && state.user.source === "live" ? "live" : "demo";

  // ---- demo (browser) data
  const demoInterviews = useSyncExternalStore(interviewStore.subscribe, interviewStore.getSnapshot, interviewStore.getServerSnapshot);
  const demoReports = useSyncExternalStore(reportStore.subscribe, reportStore.getSnapshot, reportStore.getServerSnapshot);

  // ---- live (API) data
  const [live, setLive] = useState<{ interviews: InterviewRecord[]; reports: ReportSummary[]; status: LoadStatus; reportsStatus: LoadStatus; error: string | null }>({
    interviews: [],
    reports: [],
    status: "loading",
    reportsStatus: "loading",
    error: null,
  });
  const generation = useRef(0); // ignores responses that arrive after the user changed

  const refresh = useCallback(async (): Promise<InterviewRecord[]> => {
    if (mode !== "live") return interviewStore.getSnapshot();
    const mine = generation.current;
    try {
      const interviews = await listInterviews();
      if (mine === generation.current) setLive((current) => ({ ...current, interviews, status: "ready", error: null }));
      return interviews;
    } catch (error) {
      if (mine === generation.current) setLive((current) => ({ ...current, status: "error", error: message(error) }));
      return [];
    }
  }, [mode]);

  useEffect(() => {
    generation.current += 1;
    const mine = generation.current;
    if (mode !== "live" || !userKey) return;
    setLive({ interviews: [], reports: [], status: "loading", reportsStatus: "loading", error: null });
    void refresh();
    listReportSummaries()
      .then((reports) => mine === generation.current && setLive((current) => ({ ...current, reports, reportsStatus: "ready" })))
      .catch(() => mine === generation.current && setLive((current) => ({ ...current, reportsStatus: "error" })));
  }, [mode, userKey, refresh]);

  const liveCommands = useMemo<InterviewCommands>(() => {
    const find = (id: string) => live.interviews.find((record) => record.id === id);
    const reload = async (id: string) => (await refresh()).find((record) => record.id === id) ?? null;
    return {
      async saveDraft(config, assignments, existingId) {
        if (!existingId) {
          const created = await createInterview(config, assignments, "draft");
          await refresh();
          return created;
        }
        await patchInterview(existingId, config);
        await syncAssignments(existingId, find(existingId)?.assignments ?? [], assignments);
        return (await reload(existingId)) as InterviewRecord;
      },
      async publish(config, assignments, existingId) {
        if (!existingId) {
          const created = await createInterview(config, assignments, "active");
          await refresh();
          return created;
        }
        await patchInterview(existingId, config, { status: "active" });
        await syncAssignments(existingId, find(existingId)?.assignments ?? [], assignments);
        return (await reload(existingId)) as InterviewRecord;
      },
      async duplicate(id) {
        const source = find(id);
        if (!source) return null;
        const copy = await createInterview({ ...source, title: `${source.title} (copy)`.slice(0, 100) }, [], "draft");
        await refresh();
        return copy;
      },
      async archive(id) {
        await setInterviewStatus(id, "archived");
        await refresh();
      },
      async restore(id) {
        await setInterviewStatus(id, "active");
        await refresh();
      },
      async addAssignments(interviewId, assignments) {
        await addAssignments(interviewId, assignments);
        await refresh();
      },
      patchAssignment: () => undefined,
      recordSimulatedReport: () => undefined,
    };
  }, [live.interviews, refresh]);

  const demoCommands = useMemo<InterviewCommands>(
    () => ({
      async saveDraft(config, assignments, existingId) {
        return demoInterviewCommands.saveDraft(config, assignments, existingId);
      },
      async publish(config, assignments, existingId) {
        return demoInterviewCommands.publish(config, assignments, existingId);
      },
      async duplicate(id) {
        return demoInterviewCommands.duplicate(id);
      },
      async archive(id) {
        demoInterviewCommands.archive(id);
      },
      async restore(id) {
        demoInterviewCommands.restore(id);
      },
      async addAssignments(interviewId, assignments) {
        for (const assignment of assignments) demoInterviewCommands.addAssignment(interviewId, assignment);
      },
      patchAssignment: demoInterviewCommands.patchAssignment,
      recordSimulatedReport: reportCommands.upsert,
    }),
    [],
  );

  const loadReport = useCallback(
    async (id: string, options: { retries?: number } = {}): Promise<CandidateReport | null> => {
      if (mode === "demo") return reportStore.getSnapshot().find((report) => report.id === id) ?? null;
      // A report is written moments after an interview ends, so a fresh one may need a few tries.
      for (let attempt = 0; ; attempt += 1) {
        const report = await fetchReport(id);
        if (report || attempt >= (options.retries ?? 0)) return report;
        await wait(1500);
      }
    },
    [mode],
  );

  const value = useMemo<DataValue>(
    () =>
      mode === "live"
        ? { mode, interviews: live.interviews, interviewsStatus: live.status, interviewsError: live.error, reports: live.reports, reportsStatus: live.reportsStatus, refresh, commands: liveCommands, loadReport }
        : { mode, interviews: demoInterviews, interviewsStatus: "ready", interviewsError: null, reports: demoReports, reportsStatus: "ready", refresh, commands: demoCommands, loadReport },
    [mode, live, demoInterviews, demoReports, refresh, liveCommands, demoCommands, loadReport],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataValue {
  const value = useContext(DataContext);
  if (!value) throw new Error("useData must be used inside <DataProvider>");
  return value;
}

export const useInterviews = () => useData().interviews;
export const useInterview = (id: string | undefined) => useData().interviews.find((record) => record.id === id);
export const useReports = () => useData().reports;
export const useInterviewCommands = () => useData().commands;

/** Load state of the report list, so a failing API is visible instead of looking like "no reports". */
export function useReportsStatus() {
  const { reportsStatus, mode } = useData();
  return { status: reportsStatus, mode };
}

/** Loading/error state for list pages, so a slow or failing API is visible instead of looking empty. */
export function useInterviewsStatus() {
  const { interviewsStatus, interviewsError, refresh, mode } = useData();
  return { status: interviewsStatus, error: interviewsError, refresh, mode };
}

export type ReportDetail = { status: "loading" } | { status: "ready"; report: CandidateReport } | { status: "missing" } | { status: "error"; message: string };

/** One full report. `awaitFresh` retries for a few seconds because a just-finished interview's report is written asynchronously. */
export function useReportDetail(id: string | undefined, options: { awaitFresh?: boolean } = {}): ReportDetail {
  const { loadReport } = useData();
  const [detail, setDetail] = useState<ReportDetail>({ status: "loading" });
  const retries = options.awaitFresh ? 6 : 0;

  useEffect(() => {
    let cancelled = false;
    setDetail({ status: "loading" });
    if (!id) return;
    loadReport(id, { retries })
      .then((report) => !cancelled && setDetail(report ? { status: "ready", report } : { status: "missing" }))
      .catch((error) => !cancelled && setDetail({ status: "error", message: message(error) }));
    return () => {
      cancelled = true;
    };
  }, [id, loadReport, retries]);

  return detail;
}

/**
 * The interviews the signed-in candidate can see, with their own assignment attached.
 * A real session trusts the backend's scoping (it already returns only what that user may see);
 * the demo session filters its sample data by assignment.
 */
export function useCandidateInterviews() {
  const { state } = useSession();
  const { mode, interviews, reports, interviewsStatus, interviewsError, refresh } = useData();
  const email = state.user?.email;
  const name = state.user?.name;
  const items = useMemo<AssignedInterview[]>(() => {
    if (!email || !name) return [];
    return mode === "live" ? liveCandidateInterviews(interviews, { name, email }, reports) : assignedTo(interviews, email);
  }, [mode, interviews, reports, email, name]);
  const find = useCallback((id: string) => items.find((item) => item.interview.id === id), [items]);
  return { items, find, status: interviewsStatus, error: interviewsError, refresh, mode };
}
