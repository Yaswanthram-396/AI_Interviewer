import type { BehaviorConfig, InterviewConfig, TopicConfig } from "./types";

export const defaultBehavior = (): BehaviorConfig => ({
  contextualFollowUps: true,
  adaptiveDifficulty: true,
  allowRepeat: true,
  allowSkip: true,
  clarifications: true,
  voice: true,
  interruptions: false,
  personality: ["professional", "friendly"],
});

export const newTopicId = () => `topic_${Math.random().toString(36).slice(2, 9)}`;

export const makeTopic = (name: string, weight: number, questions = 1, difficulty: TopicConfig["difficulty"] = "intermediate"): TopicConfig => ({
  id: newTopicId(),
  name,
  weight,
  difficulty,
  questions,
});

export const blankInterviewConfig = (): InterviewConfig => ({
  title: "",
  role: "",
  department: "Engineering",
  company: "",
  description: "",
  instructions:
    "Find a quiet place and use headphones if you can. SIRI will ask one question at a time; answer out loud and take your time. You can ask SIRI to repeat a question.",
  type: "technical",
  difficulty: "adaptive",
  durationMinutes: 30,
  mainQuestions: 6,
  maxFollowUps: 2,
  language: "English (US)",
  topics: [makeTopic("JavaScript", 50, 3), makeTopic("React", 50, 3)],
  behavior: defaultBehavior(),
});

/** Quick-add suggestions for the topic input (the MERN set from the product brief first). */
export const TOPIC_SUGGESTIONS = [
  "JavaScript",
  "React",
  "Node.js",
  "Express.js",
  "MongoDB",
  "REST APIs",
  "Authentication",
  "System Design",
  "TypeScript",
  "SQL",
  "Testing",
  "Data Structures",
] as const;
