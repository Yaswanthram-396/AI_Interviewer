"use client";

import { useSyncExternalStore } from "react";
import { createPersistentStore } from "@/lib/persistentStore";
import { createRecord, duplicateRecord, patchAssignment, setStatus, updateRecord } from "./interviewActions";
import { seedInterviews } from "./seed";
import type { Assignment, InterviewConfig, InterviewRecord } from "./types";

const isRecordList = (value: unknown): value is InterviewRecord[] =>
  Array.isArray(value) && value.every((item) => typeof item === "object" && item !== null && "id" in item && "topics" in item && "assignments" in item);

/** Where interviews live in this prototype. A real API client can replace this file's persistence. */
export const interviewStore = createPersistentStore<InterviewRecord[]>("siri.interviews.v1", seedInterviews, isRecordList);

export const interviewCommands = {
  /** Saves (or updates) a draft and returns it. */
  saveDraft(config: InterviewConfig, assignments: Assignment[], existingId?: string): InterviewRecord {
    return write(config, assignments, "draft", existingId);
  },
  /** Publishes (creating or updating) and returns the record. */
  publish(config: InterviewConfig, assignments: Assignment[], existingId?: string): InterviewRecord {
    return write(config, assignments, "active", existingId);
  },
  duplicate(id: string): InterviewRecord | null {
    const source = interviewStore.getSnapshot().find((record) => record.id === id);
    if (!source) return null;
    const copy = duplicateRecord(source);
    interviewStore.set((all) => [copy, ...all]);
    return copy;
  },
  archive(id: string) {
    interviewStore.set((all) => all.map((record) => (record.id === id ? setStatus(record, "archived") : record)));
  },
  restore(id: string) {
    interviewStore.set((all) => all.map((record) => (record.id === id ? setStatus(record, record.publishedAt ? "active" : "draft") : record)));
  },
  patchAssignment(interviewId: string, assignmentId: string, patch: Partial<Assignment>) {
    interviewStore.set((all) => all.map((record) => (record.id === interviewId ? patchAssignment(record, assignmentId, patch) : record)));
  },
  addAssignment(interviewId: string, assignment: Assignment) {
    interviewStore.set((all) => all.map((record) => (record.id === interviewId ? { ...record, updatedAt: new Date().toISOString(), assignments: [...record.assignments, assignment] } : record)));
  },
  removeAssignment(interviewId: string, assignmentId: string) {
    interviewStore.set((all) => all.map((record) => (record.id === interviewId ? { ...record, updatedAt: new Date().toISOString(), assignments: record.assignments.filter((a) => a.id !== assignmentId) } : record)));
  },
  linkBackend(id: string, backendId: string) {
    interviewStore.set((all) => all.map((record) => (record.id === id ? { ...record, backendId } : record)));
  },
};

function write(config: InterviewConfig, assignments: Assignment[], status: InterviewRecord["status"], existingId?: string): InterviewRecord {
  let saved!: InterviewRecord;
  interviewStore.set((all) => {
    const existing = existingId ? all.find((record) => record.id === existingId) : undefined;
    if (existing) {
      saved = updateRecord(existing, config, assignments, status);
      return all.map((record) => (record.id === existing.id ? saved : record));
    }
    saved = createRecord(config, assignments, status);
    return [saved, ...all];
  });
  return saved;
}

export function useInterviews(): InterviewRecord[] {
  return useSyncExternalStore(interviewStore.subscribe, interviewStore.getSnapshot, interviewStore.getServerSnapshot);
}

export function useInterview(id: string | undefined): InterviewRecord | undefined {
  return useInterviews().find((record) => record.id === id);
}
