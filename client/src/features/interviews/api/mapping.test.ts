import { describe, expect, it } from "vitest";
import { blankInterviewConfig } from "../defaults";
import { seedInterviews } from "../seed";
import { diffAssignments, fromBackend, toAssigneeBody, toBackendBody, type RawInterview } from "./mapping";

const raw = (over: Partial<RawInterview> = {}): RawInterview => ({
  _id: "a".repeat(24),
  title: "MERN Stack Interview",
  description: "d",
  difficulty: "Advanced",
  timeLimit: 40,
  status: "active",
  code: "SIRI-1A2B",
  settings: {
    role: "Full Stack Developer",
    difficulty: "adaptive",
    mainQuestions: 3,
    maxFollowUps: 1,
    topics: [{ name: "JavaScript", weight: 60, questions: 2, difficulty: "advanced" }, { name: "React", weight: 40, questions: 1 }],
    behavior: { personality: ["challenging"], allowSkip: false },
  },
  assignments: [{ _id: "s1", name: "Ana", email: "ana@x.com", status: "completed", sessionId: "sess_1", completedAt: "2026-11-01T10:00:00.000Z" }, { _id: "s2", email: "bo@x.com", status: "invited" }],
  createdAt: "2026-10-01T09:00:00.000Z",
  updatedAt: "2026-10-02T09:00:00.000Z",
  ...over,
});

describe("fromBackend", () => {
  it("maps settings, assignments and links the report to the session", () => {
    const record = fromBackend(raw());
    expect(record).toMatchObject({ id: "a".repeat(24), code: "SIRI-1A2B", title: "MERN Stack Interview", role: "Full Stack Developer", difficulty: "adaptive", durationMinutes: 40, mainQuestions: 3, maxFollowUps: 1, status: "active", backendId: "a".repeat(24) });
    expect(record.topics.map((t) => [t.name, t.weight, t.questions, t.difficulty])).toEqual([["JavaScript", 60, 2, "advanced"], ["React", 40, 1, "intermediate"]]);
    expect(record.behavior).toMatchObject({ personality: ["challenging"], allowSkip: false, allowRepeat: true });
    expect(record.assignments[0]).toMatchObject({ id: "s1", status: "completed", reportId: "sess_1" });
    expect(record.assignments[1]).toMatchObject({ id: "s2", name: "bo", status: "invited", reportId: undefined });
  });

  it("derives Completed when everyone has finished, and keeps draft and archived as they are", () => {
    const done = { assignments: [{ _id: "s1", email: "a@x.com", status: "completed" as const }] };
    expect(fromBackend(raw(done)).status).toBe("completed");
    expect(fromBackend(raw({ ...done, status: "archived" })).status).toBe("archived");
    expect(fromBackend(raw({ status: "draft" })).status).toBe("draft");
    expect(fromBackend(raw({ status: "draft" })).publishedAt).toBeUndefined();
    expect(fromBackend(raw({ assignments: [] })).status).toBe("active"); // nobody assigned is not "completed"
  });

  it("copes with an interview created before settings and status existed", () => {
    const record = fromBackend({ _id: "b".repeat(24), title: "Old Interview", difficulty: "Beginner", createdDate: "2026-01-01T00:00:00.000Z" });
    expect(record).toMatchObject({ status: "active", role: "Old Interview", difficulty: "beginner", durationMinutes: 15, topics: [], assignments: [] });
    expect(record.code).toMatch(/^[0-9A-F]{6}$/);
  });
});

describe("toBackendBody", () => {
  it("sends the backend's own columns plus everything else under settings", () => {
    const config = { ...blankInterviewConfig(), title: " MERN Stack Interview ", role: "Full Stack Developer", description: "d", difficulty: "adaptive" as const, durationMinutes: 45 };
    const body = toBackendBody(config);
    expect(body).toMatchObject({ title: "MERN Stack Interview", description: "d", difficulty: "Intermediate", timeLimit: 45 }); // adaptive starts at Intermediate
    expect(body.settings).toMatchObject({ role: "Full Stack Developer", difficulty: "adaptive", mainQuestions: 6, maxFollowUps: 2 });
    expect(body.settings.topics[0]).toEqual({ name: "JavaScript", weight: 50, questions: 3, difficulty: "intermediate" });
    expect(JSON.stringify(body)).not.toContain("topic_"); // client-only topic ids never leave the browser
  });

  it("round-trips through fromBackend", () => {
    const seeded = seedInterviews()[0];
    const body = toBackendBody(seeded);
    const back = fromBackend({ _id: "c".repeat(24), status: "active", ...body });
    expect(back).toMatchObject({ title: seeded.title, role: seeded.role, difficulty: seeded.difficulty, durationMinutes: seeded.durationMinutes, mainQuestions: seeded.mainQuestions });
    expect(back.topics.map((t) => [t.name, t.weight, t.questions])).toEqual(seeded.topics.map((t) => [t.name, t.weight, t.questions]));
  });
});

describe("diffAssignments", () => {
  const a = (id: string) => ({ id, name: id, email: `${id}@x.io`, status: "invited" as const, invitedAt: "" });
  it("finds who to add and whom to remove", () => {
    expect(diffAssignments([a("s1"), a("s2")], [a("s2"), a("asg_new")])).toEqual({ add: [a("asg_new")], remove: [a("s1")] });
    expect(diffAssignments([], [])).toEqual({ add: [], remove: [] });
  });
});

describe("toAssigneeBody", () => {
  it("maps the optional candidate id to externalId", () => {
    expect(toAssigneeBody({ name: "Ana", email: "ana@x.com", candidateId: "EMP-1" })).toEqual({ name: "Ana", email: "ana@x.com", externalId: "EMP-1" });
  });
});
