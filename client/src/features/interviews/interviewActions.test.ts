import { describe, expect, it } from "vitest";
import { blankInterviewConfig } from "./defaults";
import { allCompleted, createRecord, duplicateRecord, newAssignment, newInterviewCode, patchAssignment, setStatus, summarize, updateRecord } from "./interviewActions";
import { seedInterviews, seedReports } from "./seed";
import { topicWeightTotal } from "./validation";

const NOW = new Date("2026-11-16T10:00:00.000Z");

describe("records", () => {
  it("creates a published record with a code and publish time", () => {
    const record = createRecord(blankInterviewConfig(), [], "active", NOW);
    expect(record.code).toMatch(/^SIRI-[0-9A-F]{4}$/);
    expect(record.publishedAt).toBe(NOW.toISOString());
    expect(createRecord(blankInterviewConfig(), [], "draft", NOW).publishedAt).toBeUndefined();
  });

  it("keeps the first publish time when edited again", () => {
    const draft = createRecord(blankInterviewConfig(), [], "draft", NOW);
    const published = updateRecord(draft, draft, [], "active", NOW);
    const later = updateRecord(published, published, [], "active", new Date("2026-12-01T00:00:00.000Z"));
    expect(later.publishedAt).toBe(NOW.toISOString());
  });

  it("duplicates as a fresh, unassigned, unlinked draft", () => {
    const original = { ...seedInterviews()[0], backendId: "abc123" };
    const copy = duplicateRecord(original, NOW);
    expect(copy.status).toBe("draft");
    expect(copy.assignments).toEqual([]);
    expect(copy.backendId).toBeUndefined();
    expect(copy.id).not.toBe(original.id);
    expect(copy.title).toBe(`${original.title} (copy)`);
    expect(copy.topics.map((t) => t.id)).not.toEqual(original.topics.map((t) => t.id));
    expect(topicWeightTotal(copy.topics)).toBe(100);
  });

  it("archives without touching anything else", () => {
    const original = seedInterviews()[0];
    expect(setStatus(original, "archived", NOW)).toMatchObject({ status: "archived", title: original.title, assignments: original.assignments });
  });
});

describe("assignments", () => {
  it("normalises emails and starts as invited", () => {
    expect(newAssignment({ name: " Sam ", email: " Sam@Example.com ", candidateId: " " }, NOW)).toMatchObject({
      name: "Sam",
      email: "sam@example.com",
      status: "invited",
      candidateId: undefined,
    });
  });

  it("patches only the matching assignment", () => {
    const record = seedInterviews()[0];
    const next = patchAssignment(record, "a4", { status: "in_progress", progress: 10 });
    expect(next.assignments.find((a) => a.id === "a4")).toMatchObject({ status: "in_progress", progress: 10 });
    expect(next.assignments.find((a) => a.id === "a1")).toEqual(record.assignments.find((a) => a.id === "a1"));
  });

  it("knows when everyone has completed", () => {
    const junior = seedInterviews().find((r) => r.id === "int_junior_05")!;
    expect(allCompleted(junior)).toBe(true);
    expect(allCompleted(seedInterviews()[0])).toBe(false);
    expect(allCompleted({ ...junior, assignments: [] })).toBe(false);
  });
});

describe("summarize", () => {
  it("counts distinct candidates and excludes archived interviews from the total", () => {
    const stats = summarize(seedInterviews());
    expect(stats).toMatchObject({ total: 5, active: 3, completed: 1 });
    expect(stats.candidates).toBe(11); // Arjun appears in three interviews but is one person
  });
});

describe("newInterviewCode", () => {
  it("is deterministic for a given random source", () => {
    expect(newInterviewCode(() => 0)).toBe("SIRI-0000");
    expect(newInterviewCode(() => 0.999)).toBe("SIRI-FFFF");
  });
});

describe("seed data", () => {
  it("has a report for every completed assignment, and topic weights always total 100", () => {
    const interviews = seedInterviews();
    const reports = seedReports(interviews);
    const reportIds = new Set(reports.map((report) => report.id));
    for (const interview of interviews) {
      expect(topicWeightTotal(interview.topics)).toBe(100);
      for (const assignment of interview.assignments.filter((a) => a.status === "completed")) {
        expect(reportIds.has(assignment.reportId ?? "")).toBe(true);
      }
    }
  });

  it("produces a coherent flagship report", () => {
    const report = seedReports().find((r) => r.id === "rep_arjun_mern")!;
    expect(report.overall).toBeGreaterThanOrEqual(78);
    expect(report.overall).toBeLessThanOrEqual(84);
    expect(report.source).toBe("demo");
    expect(report.topics.find((t) => t.topic === "JavaScript")?.score).toBe(90);
    expect(report.strengths.length).toBeGreaterThanOrEqual(3);
    expect(report.improvements[0].area).toBe("System Design"); // the weakest assessed topic leads
    expect(report.roadmap.map((item) => item.priority)).toEqual([1, 2, 3]);
    expect(report.questions).toHaveLength(12);
  });
});
