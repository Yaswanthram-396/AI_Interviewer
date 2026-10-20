import { blankInterviewConfig, makeTopic } from "./defaults";
import type { InterviewConfig } from "./types";

export interface InterviewTemplate {
  id: string;
  name: string;
  summary: string;
  build: () => InterviewConfig;
}

/** Starting points for the create page. Each returns a fresh config so edits never leak between uses. */
export const INTERVIEW_TEMPLATES: InterviewTemplate[] = [
  {
    id: "mern",
    name: "MERN Stack Developer",
    summary: "JavaScript, React, Node.js, Express and MongoDB for a full stack role.",
    build: () => ({
      ...blankInterviewConfig(),
      title: "MERN Stack Developer Technical Interview",
      role: "Full Stack Developer",
      description: "Evaluate the candidate's knowledge of JavaScript, React, Node.js, Express and MongoDB.",
      type: "fullstack",
      durationMinutes: 45,
      mainQuestions: 10,
      topics: [makeTopic("JavaScript", 30, 3), makeTopic("React", 25, 2), makeTopic("Node.js", 15, 2), makeTopic("Express.js", 15, 1), makeTopic("MongoDB", 10, 1), makeTopic("System Design", 5, 1)],
    }),
  },
  {
    id: "frontend",
    name: "Frontend Engineer",
    summary: "React, JavaScript and TypeScript with a focus on rendering and state.",
    build: () => ({
      ...blankInterviewConfig(),
      title: "Frontend Engineer React Assessment",
      role: "Frontend Engineer",
      description: "Assess component design, state management and rendering performance in React.",
      type: "frontend",
      durationMinutes: 30,
      mainQuestions: 6,
      topics: [makeTopic("React", 50, 3), makeTopic("JavaScript", 30, 2), makeTopic("TypeScript", 20, 1)],
    }),
  },
  {
    id: "backend",
    name: "Backend Engineer",
    summary: "Node.js, Express, REST design and authentication.",
    build: () => ({
      ...blankInterviewConfig(),
      title: "Backend Engineer Node.js and APIs",
      role: "Backend Engineer",
      description: "Probe Node.js runtime knowledge, Express middleware design, REST conventions and authentication.",
      type: "backend",
      difficulty: "advanced",
      durationMinutes: 40,
      mainQuestions: 8,
      maxFollowUps: 3,
      topics: [makeTopic("Node.js", 35, 3, "advanced"), makeTopic("Express.js", 25, 2), makeTopic("REST APIs", 20, 2), makeTopic("Authentication", 20, 1)],
    }),
  },
];

export const templateById = (id: string | null) => INTERVIEW_TEMPLATES.find((template) => template.id === id);
