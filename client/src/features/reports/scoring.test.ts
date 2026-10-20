import { describe, expect, it } from "vitest";
import { DEFAULT_READINESS, DEFAULT_THRESHOLDS, performanceLevel, readinessFor, scoreTone, validateThresholds, weightedOverall } from "./scoring";
import type { TopicScore } from "./types";

const topic = (score: number | null, weight = 20): TopicScore => ({ topic: "t", score, weight, questionsAsked: score === null ? 0 : 2 });

describe("performanceLevel", () => {
  it("uses the documented bands with inclusive lower bounds", () => {
    expect(performanceLevel(100)).toBe("excellent");
    expect(performanceLevel(90)).toBe("excellent");
    expect(performanceLevel(89)).toBe("strong");
    expect(performanceLevel(75)).toBe("strong");
    expect(performanceLevel(74)).toBe("good");
    expect(performanceLevel(60)).toBe("good");
    expect(performanceLevel(59)).toBe("needs-improvement");
    expect(performanceLevel(40)).toBe("needs-improvement");
    expect(performanceLevel(39)).toBe("poor");
  });

  it("honours custom thresholds", () => {
    expect(performanceLevel(80, { excellent: 95, strong: 85, good: 70, needsImprovement: 50 })).toBe("good");
  });
});

describe("validateThresholds", () => {
  it("accepts the defaults and rejects unordered or out-of-range values", () => {
    expect(validateThresholds(DEFAULT_THRESHOLDS)).toBeNull();
    expect(validateThresholds({ excellent: 70, strong: 75, good: 60, needsImprovement: 40 })).toMatch(/decrease/);
    expect(validateThresholds({ excellent: 101, strong: 75, good: 60, needsImprovement: 40 })).toMatch(/between 1 and 100/);
    expect(validateThresholds({ excellent: Number.NaN, strong: 75, good: 60, needsImprovement: 40 })).not.toBeNull();
  });
});

describe("readinessFor", () => {
  it("is ready only when the overall score and every assessed topic clear their bars", () => {
    expect(readinessFor(82, [topic(90), topic(65)], DEFAULT_READINESS)).toBe("interview-ready");
    expect(readinessFor(82, [topic(90), topic(45)], DEFAULT_READINESS)).toBe("almost-ready"); // one weak topic caps it
    expect(readinessFor(62, [topic(70)], DEFAULT_READINESS)).toBe("almost-ready");
    expect(readinessFor(40, [topic(40)], DEFAULT_READINESS)).toBe("needs-practice");
  });

  it("ignores topics that were not covered", () => {
    expect(readinessFor(80, [topic(80), topic(null)], DEFAULT_READINESS)).toBe("interview-ready");
  });

  it("follows edited criteria", () => {
    expect(readinessFor(80, [topic(80)], { readyAt: 85, almostAt: 70, minTopicScore: 50 })).toBe("almost-ready");
  });
});

describe("weightedOverall", () => {
  it("weights assessed topics and leaves uncovered ones out", () => {
    expect(weightedOverall([topic(100, 50), topic(50, 50)])).toBe(75);
    expect(weightedOverall([topic(100, 20), topic(null, 80)])).toBe(100);
    expect(weightedOverall([topic(null)])).toBe(0);
  });
});

describe("scoreTone", () => {
  it("maps score to a visual tone", () => {
    expect([scoreTone(85), scoreTone(60), scoreTone(30)]).toEqual(["brand", "accent", "muted"]);
  });
});
