/** Calls to the SIRI backend's interview endpoints. Errors surface as ApiError with the backend's message. */
import { authSession } from "@/features/auth/services/authSession.instance";
import type { Assignment, InterviewConfig, InterviewRecord, InterviewStatus } from "../types";
import { diffAssignments, fromBackend, toAssigneeBody, toBackendBody, type RawInterview } from "./mapping";

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });
const send = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : json(body)) });

export async function listInterviews(): Promise<InterviewRecord[]> {
  const { interviews } = await authSession.request<{ interviews: RawInterview[] }>("/api/interviews");
  return interviews.map(fromBackend);
}

export async function createInterview(config: InterviewConfig, assignments: Assignment[], status: Extract<InterviewStatus, "draft" | "active">): Promise<InterviewRecord> {
  const { interview } = await authSession.request<{ interview: RawInterview }>("/api/interviews/create-interview", send("POST", { ...toBackendBody(config), status, assignments: assignments.map(toAssigneeBody) }));
  return fromBackend(interview);
}

export async function patchInterview(id: string, config: Partial<InterviewConfig> & { title: string }, patch: { status?: InterviewStatus } = {}): Promise<void> {
  const body = { ...toBackendBody(config as InterviewConfig), ...patch };
  await authSession.request(`/api/interviews/${id}`, send("PUT", body));
}

export async function setInterviewStatus(id: string, status: Extract<InterviewStatus, "draft" | "active" | "archived">): Promise<void> {
  await authSession.request(`/api/interviews/${id}`, send("PUT", { status }));
}

export async function addAssignments(id: string, assignments: Assignment[]): Promise<void> {
  if (assignments.length === 0) return;
  await authSession.request(`/api/interviews/${id}/assignments`, send("POST", { assignments: assignments.map(toAssigneeBody) }));
}

export async function removeAssignment(id: string, assignmentId: string): Promise<void> {
  await authSession.request(`/api/interviews/${id}/assignments/${assignmentId}`, send("DELETE"));
}

/** Brings the stored assignments in line with the form's list (adds the new, removes the dropped). */
export async function syncAssignments(id: string, existing: readonly Assignment[], next: readonly Assignment[]): Promise<void> {
  const { add, remove } = diffAssignments(existing, next);
  await addAssignments(id, add);
  for (const assignment of remove) await removeAssignment(id, assignment.id);
}
