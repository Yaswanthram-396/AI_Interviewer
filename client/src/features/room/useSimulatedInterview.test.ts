import { describe, expect, it } from "vitest";
import { seedInterviews } from "@/features/interviews/seed";
import { generateReport } from "@/features/reports/generateReport";
import { buildQuestionPlan, pickAnswer, seedOf } from "./useSimulatedInterview";

describe("buildQuestionPlan", () => {
  it("asks each topic the number of questions the admin configured, in topic order", () => {
    const interview = seedInterviews()[0];
    const plan = buildQuestionPlan(interview.topics);
    expect(plan).toHaveLength(interview.topics.reduce((sum, topic) => sum + topic.questions, 0));
    expect(plan.map((item) => item.topic)).toEqual(interview.topics.flatMap((topic) => Array(topic.questions).fill(topic.name)));
  });

  it("still produces a question for a topic the knowledge base does not know", () => {
    const plan = buildQuestionPlan([{ id: "x", name: "Kubernetes", weight: 100, difficulty: "intermediate", questions: 2 }]);
    expect(plan).toHaveLength(2);
    expect(plan[0].text).toContain("Kubernetes");
  });
});

describe("simulated answers", () => {
  it("are deterministic for the same candidate and interview", () => {
    expect(seedOf("int_mern_01:a@b.c:0")).toBe(seedOf("int_mern_01:a@b.c:0"));
    expect(seedOf("a")).not.toBe(seedOf("b"));
  });

  it("score high for strong answers and mid for partial ones", () => {
    const [item] = buildQuestionPlan(seedInterviews()[0].topics);
    const scores = Array.from({ length: 40 }, (_, seed) => pickAnswer(item, seed));
    expect(scores.filter((answer) => answer.score >= 8).every((answer) => answer.text === item.strongAnswer)).toBe(true);
    expect(scores.filter((answer) => answer.score < 8).every((answer) => answer.text === item.partialAnswer && answer.score >= 5)).toBe(true);
    expect(scores.some((answer) => answer.score >= 8) && scores.some((answer) => answer.score < 8)).toBe(true);
  });
});

describe("a simulated interview's report", () => {
  it("is labelled simulated and covers only the topics that were asked", () => {
    const interview = seedInterviews()[0];
    const plan = buildQuestionPlan(interview.topics).slice(0, 4); // candidate ended early
    const report = generateReport({
      id: "rep_sim_test",
      interviewId: interview.id,
      interviewTitle: interview.title,
      role: interview.role,
      candidate: { name: "Arjun Mehta", email: "arjun@example.com" },
      completedAt: "2026-11-16T10:00:00.000Z",
      durationMinutes: 3,
      source: "simulated",
      topics: interview.topics.map(({ name, weight }) => ({ name, weight })),
      asked: plan.map((item, index) => ({ topic: item.topic, text: item.text, difficulty: item.difficulty, answer: item.strongAnswer, score: 8, knowledgeIndex: item.knowledgeIndex ?? index })),
    });
    expect(report.source).toBe("simulated");
    expect(report.topics.some((topic) => topic.score === null)).toBe(true); // uncovered topics are not scored
    expect(report.overall).toBe(80);
    expect(report.questions).toHaveLength(4);
  });
});
