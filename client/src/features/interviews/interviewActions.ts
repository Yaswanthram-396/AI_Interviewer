/** Pure transformations on interview records. The store applies them; tests exercise them directly. */
import type { Assignment, InterviewConfig, InterviewRecord } from "./types";

const CODE_ALPHABET = "0123456789ABCDEF";

export function newInterviewCode(random: () => number = Math.random): string {
  return `SIRI-${Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(random() * 16)]).join("")}`;
}

export const newId = (prefix: string, random: () => number = Math.random) => `${prefix}_${Math.floor(random() * 0xffffffff).toString(36)}${Date.now().toString(36)}`;

export function newAssignment(input: { name: string; email: string; candidateId?: string }, now: Date = new Date()): Assignment {
  return {
    id: newId("asg"),
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    candidateId: input.candidateId?.trim() || undefined,
    status: "invited",
    invitedAt: now.toISOString(),
  };
}

export function createRecord(config: InterviewConfig, assignments: Assignment[], status: InterviewRecord["status"], now: Date = new Date()): InterviewRecord {
  const iso = now.toISOString();
  return {
    ...config,
    id: newId("int"),
    code: newInterviewCode(),
    status,
    createdAt: iso,
    updatedAt: iso,
    publishedAt: status === "active" ? iso : undefined,
    assignments,
  };
}

/** Applies edits to an existing record. Publishing a draft sets `publishedAt` once. */
export function updateRecord(record: InterviewRecord, config: InterviewConfig, assignments: Assignment[], status: InterviewRecord["status"], now: Date = new Date()): InterviewRecord {
  const iso = now.toISOString();
  return {
    ...record,
    ...config,
    assignments,
    status,
    updatedAt: iso,
    publishedAt: record.publishedAt ?? (status === "active" ? iso : undefined),
  };
}

/** A copy is always a fresh draft with no assignments and no backend link. */
export function duplicateRecord(record: InterviewRecord, now: Date = new Date()): InterviewRecord {
  const { id: _id, code: _code, backendId: _backendId, ...rest } = record;
  void _id;
  void _code;
  void _backendId;
  const iso = now.toISOString();
  return {
    ...rest,
    id: newId("int"),
    code: newInterviewCode(),
    title: `${record.title} (copy)`,
    status: "draft",
    createdAt: iso,
    updatedAt: iso,
    publishedAt: undefined,
    assignments: [],
    topics: record.topics.map((topic) => ({ ...topic, id: newId("topic") })),
  };
}

export function setStatus(record: InterviewRecord, status: InterviewRecord["status"], now: Date = new Date()): InterviewRecord {
  return { ...record, status, updatedAt: now.toISOString() };
}

export function patchAssignment(record: InterviewRecord, assignmentId: string, patch: Partial<Assignment>, now: Date = new Date()): InterviewRecord {
  return {
    ...record,
    updatedAt: now.toISOString(),
    assignments: record.assignments.map((assignment) => (assignment.id === assignmentId ? { ...assignment, ...patch } : assignment)),
  };
}

/** True once every assignment has finished (and there is at least one). */
export const allCompleted = (record: InterviewRecord) => record.assignments.length > 0 && record.assignments.every((assignment) => assignment.status === "completed");

export function summarize(records: readonly InterviewRecord[]) {
  const people = new Set(records.flatMap((record) => record.assignments.map((assignment) => assignment.email.toLowerCase())));
  return {
    total: records.filter((record) => record.status !== "archived").length,
    active: records.filter((record) => record.status === "active").length,
    completed: records.filter((record) => record.status === "completed").length,
    candidates: people.size,
  };
}
