/** Realistic demo data: interviews, assignments and the sample reports behind completed ones. */
import { generateReport } from "@/features/reports/generateReport";
import type { CandidateReport } from "@/features/reports/types";
import { askedFromScores } from "@/features/simulation/askedFromScores";
import { blankInterviewConfig, defaultBehavior } from "./defaults";
import type { Assignment, InterviewRecord, TopicConfig } from "./types";

const topic = (id: string, name: string, weight: number, questions: number, difficulty: TopicConfig["difficulty"] = "intermediate"): TopicConfig => ({
  id,
  name,
  weight,
  questions,
  difficulty,
});

const assign = (
  id: string,
  name: string,
  email: string,
  status: Assignment["status"],
  invitedAt: string,
  extra: Partial<Assignment> = {},
): Assignment => ({ id, name, email, status, invitedAt, ...extra });

export const DEMO_CANDIDATE_EMAIL = "arjun.mehta@example.com";

interface ReportSeed {
  id: string;
  interviewId: string;
  candidate: { name: string; email: string };
  completedAt: string;
  durationMinutes: number;
  scores: Record<string, number[]>;
}

const base = (): InterviewRecord["behavior"] => defaultBehavior();

export function seedInterviews(): InterviewRecord[] {
  const config = blankInterviewConfig();
  return [
    {
      ...config,
      id: "int_mern_01",
      code: "SIRI-4F2A",
      title: "MERN Stack Developer Technical Interview",
      role: "Full Stack Developer",
      department: "Engineering",
      company: "Northwind Labs",
      description: "Evaluate the candidate's knowledge of JavaScript, React, Node.js, Express and MongoDB.",
      type: "fullstack",
      difficulty: "adaptive",
      durationMinutes: 45,
      mainQuestions: 12,
      maxFollowUps: 2,
      topics: [
        topic("t1", "JavaScript", 30, 3, "intermediate"),
        topic("t2", "React", 25, 2, "intermediate"),
        topic("t3", "Node.js", 15, 2, "intermediate"),
        topic("t4", "Express.js", 15, 1, "intermediate"),
        topic("t5", "MongoDB", 10, 2, "advanced"),
        topic("t6", "System Design", 5, 2, "advanced"),
      ],
      behavior: base(),
      status: "active",
      createdAt: "2026-10-27T09:12:00.000Z",
      updatedAt: "2026-11-09T11:30:00.000Z",
      publishedAt: "2026-10-27T09:40:00.000Z",
      assignments: [
        assign("a1", "Arjun Mehta", DEMO_CANDIDATE_EMAIL, "completed", "2026-10-28T08:00:00.000Z", { completedAt: "2026-11-02T10:42:00.000Z", reportId: "rep_arjun_mern" }),
        assign("a2", "Sana Iqbal", "sana.iqbal@example.com", "completed", "2026-10-28T08:00:00.000Z", { completedAt: "2026-11-04T14:05:00.000Z", reportId: "rep_sana_mern" }),
        assign("a3", "Rohan Verma", "rohan.verma@example.com", "in_progress", "2026-11-05T08:00:00.000Z", { progress: 58 }),
        assign("a4", "Meera Nair", "meera.nair@example.com", "not_started", "2026-11-10T08:00:00.000Z"),
        assign("a5", "Daniel Brooks", "daniel.brooks@example.com", "invited", "2026-11-12T08:00:00.000Z"),
      ],
    },
    {
      ...config,
      id: "int_react_02",
      code: "SIRI-9C71",
      title: "Frontend Engineer React Assessment",
      role: "Frontend Engineer",
      department: "Product Engineering",
      company: "Northwind Labs",
      description: "Assess component design, state management and rendering performance in React.",
      type: "frontend",
      difficulty: "intermediate",
      durationMinutes: 30,
      mainQuestions: 6,
      maxFollowUps: 2,
      topics: [topic("t1", "React", 50, 3), topic("t2", "JavaScript", 30, 2), topic("t3", "TypeScript", 20, 1)],
      behavior: { ...base(), personality: ["friendly", "balanced"] },
      status: "active",
      createdAt: "2026-11-03T10:00:00.000Z",
      updatedAt: "2026-11-03T10:30:00.000Z",
      publishedAt: "2026-11-03T10:30:00.000Z",
      assignments: [
        assign("b1", "Arjun Mehta", DEMO_CANDIDATE_EMAIL, "not_started", "2026-11-12T09:30:00.000Z"),
        assign("b2", "Lena Fischer", "lena.fischer@example.com", "completed", "2026-11-04T09:00:00.000Z", { completedAt: "2026-11-08T16:20:00.000Z", reportId: "rep_lena_react" }),
        assign("b3", "Omar Haddad", "omar.haddad@example.com", "invited", "2026-11-13T09:00:00.000Z"),
      ],
    },
    {
      ...config,
      id: "int_node_03",
      code: "SIRI-2B58",
      title: "Backend Engineer Node.js and APIs",
      role: "Backend Engineer",
      department: "Platform",
      company: "Northwind Labs",
      description: "Probe Node.js runtime knowledge, Express middleware design, REST conventions and authentication.",
      type: "backend",
      difficulty: "advanced",
      durationMinutes: 40,
      mainQuestions: 8,
      maxFollowUps: 3,
      topics: [topic("t1", "Node.js", 35, 3, "advanced"), topic("t2", "Express.js", 25, 2), topic("t3", "REST APIs", 20, 2), topic("t4", "Authentication", 20, 1)],
      behavior: { ...base(), personality: ["professional", "challenging"] },
      status: "active",
      createdAt: "2026-11-06T08:00:00.000Z",
      updatedAt: "2026-11-06T08:20:00.000Z",
      publishedAt: "2026-11-06T08:20:00.000Z",
      assignments: [
        assign("c1", "Arjun Mehta", DEMO_CANDIDATE_EMAIL, "in_progress", "2026-11-11T08:00:00.000Z", { progress: 50 }),
        assign("c2", "Karan Shah", "karan.shah@example.com", "completed", "2026-11-07T08:00:00.000Z", { completedAt: "2026-11-10T12:15:00.000Z", reportId: "rep_karan_node" }),
      ],
    },
    {
      ...config,
      id: "int_sysd_04",
      code: "SIRI-71D0",
      title: "System Design Fundamentals",
      role: "Senior Software Engineer",
      department: "Engineering",
      company: "Northwind Labs",
      description: "A conversational system design interview covering scalability, caching and data trade-offs.",
      type: "system-design",
      difficulty: "advanced",
      durationMinutes: 60,
      mainQuestions: 4,
      maxFollowUps: 4,
      topics: [topic("t1", "System Design", 70, 3, "advanced"), topic("t2", "REST APIs", 30, 1)],
      behavior: { ...base(), personality: ["challenging"] },
      status: "draft",
      createdAt: "2026-11-14T15:00:00.000Z",
      updatedAt: "2026-11-14T15:20:00.000Z",
      assignments: [],
    },
    {
      ...config,
      id: "int_junior_05",
      code: "SIRI-C3E9",
      title: "Junior Developer Screening",
      role: "Junior Developer",
      department: "Engineering",
      company: "Northwind Labs",
      description: "A short screening round on JavaScript fundamentals and basic web concepts.",
      type: "technical",
      difficulty: "beginner",
      durationMinutes: 20,
      mainQuestions: 5,
      maxFollowUps: 1,
      topics: [topic("t1", "JavaScript", 70, 3, "beginner"), topic("t2", "REST APIs", 30, 2, "beginner")],
      behavior: { ...base(), personality: ["friendly"] },
      status: "completed",
      createdAt: "2026-09-20T09:00:00.000Z",
      updatedAt: "2026-10-12T17:00:00.000Z",
      publishedAt: "2026-09-20T09:30:00.000Z",
      assignments: [
        assign("d1", "Mia Chen", "mia.chen@example.com", "completed", "2026-09-22T09:00:00.000Z", { completedAt: "2026-09-26T10:00:00.000Z", reportId: "rep_mia_junior" }),
        assign("d2", "Noah Williams", "noah.williams@example.com", "completed", "2026-09-22T09:00:00.000Z", { completedAt: "2026-09-29T13:30:00.000Z", reportId: "rep_noah_junior" }),
        assign("d3", "Isha Kapoor", "isha.kapoor@example.com", "completed", "2026-09-22T09:00:00.000Z", { completedAt: "2026-10-03T11:10:00.000Z", reportId: "rep_isha_junior" }),
      ],
    },
    {
      ...config,
      id: "int_legacy_06",
      code: "SIRI-A84B",
      title: "Full Stack Hiring Round (2025)",
      role: "Full Stack Developer",
      department: "Engineering",
      company: "Northwind Labs",
      description: "Last year's hiring round, kept for reference.",
      type: "fullstack",
      difficulty: "intermediate",
      durationMinutes: 35,
      mainQuestions: 8,
      maxFollowUps: 2,
      topics: [topic("t1", "JavaScript", 50, 4), topic("t2", "Node.js", 50, 4)],
      behavior: base(),
      status: "archived",
      createdAt: "2026-02-10T09:00:00.000Z",
      updatedAt: "2026-08-01T09:00:00.000Z",
      publishedAt: "2026-02-10T09:30:00.000Z",
      assignments: [],
    },
  ];
}

const REPORT_SEEDS: ReportSeed[] = [
  {
    id: "rep_arjun_mern",
    interviewId: "int_mern_01",
    candidate: { name: "Arjun Mehta", email: DEMO_CANDIDATE_EMAIL },
    completedAt: "2026-11-02T10:42:00.000Z",
    durationMinutes: 41,
    scores: { JavaScript: [9, 9, 9], React: [9, 8], "Node.js": [8, 7], "Express.js": [8], MongoDB: [7, 6], "System Design": [6, 5] },
  },
  {
    id: "rep_sana_mern",
    interviewId: "int_mern_01",
    candidate: { name: "Sana Iqbal", email: "sana.iqbal@example.com" },
    completedAt: "2026-11-04T14:05:00.000Z",
    durationMinutes: 44,
    scores: { JavaScript: [10, 9, 9], React: [10, 9], "Node.js": [9, 9], "Express.js": [9], MongoDB: [9, 8], "System Design": [8, 8] },
  },
  {
    id: "rep_lena_react",
    interviewId: "int_react_02",
    candidate: { name: "Lena Fischer", email: "lena.fischer@example.com" },
    completedAt: "2026-11-08T16:20:00.000Z",
    durationMinutes: 28,
    scores: { React: [8, 8, 7], JavaScript: [7, 7], TypeScript: [6] },
  },
  {
    id: "rep_karan_node",
    interviewId: "int_node_03",
    candidate: { name: "Karan Shah", email: "karan.shah@example.com" },
    completedAt: "2026-11-10T12:15:00.000Z",
    durationMinutes: 39,
    scores: { "Node.js": [6, 5, 6], "Express.js": [6, 5], "REST APIs": [5, 5], Authentication: [4] },
  },
  {
    id: "rep_mia_junior",
    interviewId: "int_junior_05",
    candidate: { name: "Mia Chen", email: "mia.chen@example.com" },
    completedAt: "2026-09-26T10:00:00.000Z",
    durationMinutes: 18,
    scores: { JavaScript: [8, 7, 8], "REST APIs": [7, 7] },
  },
  {
    id: "rep_noah_junior",
    interviewId: "int_junior_05",
    candidate: { name: "Noah Williams", email: "noah.williams@example.com" },
    completedAt: "2026-09-29T13:30:00.000Z",
    durationMinutes: 19,
    scores: { JavaScript: [6, 5, 5], "REST APIs": [5, 4] },
  },
  {
    id: "rep_isha_junior",
    interviewId: "int_junior_05",
    candidate: { name: "Isha Kapoor", email: "isha.kapoor@example.com" },
    completedAt: "2026-10-03T11:10:00.000Z",
    durationMinutes: 20,
    scores: { JavaScript: [9, 8, 9], "REST APIs": [8, 8] },
  },
];

export function seedReports(interviews: InterviewRecord[] = seedInterviews()): CandidateReport[] {
  return REPORT_SEEDS.map((seed) => {
    const interview = interviews.find((item) => item.id === seed.interviewId);
    if (!interview) throw new Error(`Seed report ${seed.id} references an unknown interview`);
    return generateReport({
      id: seed.id,
      interviewId: interview.id,
      interviewTitle: interview.title,
      role: interview.role,
      candidate: seed.candidate,
      completedAt: seed.completedAt,
      durationMinutes: seed.durationMinutes,
      source: "demo",
      topics: interview.topics.map(({ name, weight }) => ({ name, weight })),
      asked: askedFromScores(seed.scores),
    });
  });
}
