import { describe, expect, it } from "vitest";
import { blankInterviewConfig } from "./defaults";
import { evenWeights, topicWeightTotal, validateCandidate, validateForPublish } from "./validation";

const valid = () => ({
  ...blankInterviewConfig(),
  title: "MERN Stack Developer Interview",
  role: "Full Stack Developer",
  description: "Evaluates JavaScript, React and Node.js.",
});

describe("evenWeights", () => {
  it("always totals 100 and spreads the remainder", () => {
    for (const n of [1, 2, 3, 6, 7, 8]) expect(evenWeights(n).reduce((a, b) => a + b, 0)).toBe(100);
    expect(evenWeights(3)).toEqual([34, 33, 33]);
    expect(evenWeights(0)).toEqual([]);
  });
});

describe("validateForPublish", () => {
  it("accepts a complete configuration", () => {
    expect(validateForPublish(valid())).toEqual({});
  });

  it("requires topic weightage to total exactly 100", () => {
    const config = valid();
    config.topics = [
      { id: "a", name: "JavaScript", weight: 60, difficulty: "intermediate", questions: 2 },
      { id: "b", name: "React", weight: 30, difficulty: "intermediate", questions: 2 },
    ];
    expect(validateForPublish(config).topics).toMatch(/100% \(currently 90%\)/);
    config.topics[1].weight = 40;
    expect(validateForPublish(config).topics).toBeUndefined();
  });

  it("flags missing basics and out-of-range numbers", () => {
    const config = { ...valid(), title: "x", role: " ", description: "", durationMinutes: 3, mainQuestions: 0, maxFollowUps: 9 };
    expect(Object.keys(validateForPublish(config)).sort()).toEqual(["description", "durationMinutes", "mainQuestions", "maxFollowUps", "role", "title"]);
  });

  it("requires topic question counts to add up to the main question count", () => {
    const config = valid();
    config.mainQuestions = 9;
    expect(validateForPublish(config).mainQuestions).toMatch(/Topics add up to 6 questions but main questions is 9/);
    config.mainQuestions = 6;
    expect(validateForPublish(config).mainQuestions).toBeUndefined();
  });

  it("needs at least one topic and one personality", () => {
    const config = valid();
    config.topics = [];
    config.behavior.personality = [];
    const errors = validateForPublish(config);
    expect(errors.topics).toBeDefined();
    expect(errors.personality).toBeDefined();
  });

  it("rejects the same candidate assigned twice, ignoring case", () => {
    expect(validateForPublish(valid(), [{ email: "A@x.io" }, { email: "a@X.io" }]).candidates).toMatch(/more than once/);
  });
});

describe("validateCandidate", () => {
  it("validates name, email shape and duplicates", () => {
    expect(validateCandidate({ name: "", email: "nope" }, [])).toEqual({ name: expect.any(String), email: expect.any(String) });
    expect(validateCandidate({ name: "Sam", email: "sam@x.io" }, [{ email: "SAM@x.io" }]).email).toMatch(/already assigned/);
    expect(validateCandidate({ name: "Sam", email: "sam@x.io" }, [])).toEqual({});
  });
});

describe("topicWeightTotal", () => {
  it("ignores non-finite weights instead of producing NaN", () => {
    expect(topicWeightTotal([{ id: "a", name: "A", weight: Number.NaN, difficulty: "beginner", questions: 1 }])).toBe(0);
  });
});
