/**
 * Builds a full CandidateReport from the questions that were asked and their scores, using the
 * offline knowledge base for wording. This is the *simulated* evaluation path: no model is called.
 * A backend-produced report goes through `fromBackendEvaluation` instead.
 */
import { knowledgeFor } from "@/features/simulation/knowledge";
import { DEFAULT_READINESS, readinessFor, weightedOverall, type ReadinessCriteria } from "./scoring";
import type {
  CandidateReport,
  CommunicationMetric,
  Improvement,
  Priority,
  QuestionEvaluation,
  ReportDifficulty,
  ReportSource,
  RoadmapItem,
  Strength,
  TopicScore,
} from "./types";

export interface AskedQuestion {
  topic: string;
  text: string;
  difficulty: ReportDifficulty;
  /** The candidate's answer, verbatim. */
  answer: string;
  /** 0-10 */
  score: number;
  kind?: "main" | "follow-up";
  /** Index into the topic's knowledge questions, used to find the matching feedback. */
  knowledgeIndex?: number;
}

export interface ReportInput {
  id: string;
  interviewId: string;
  interviewTitle: string;
  role: string;
  candidate: { name: string; email: string };
  completedAt: string;
  durationMinutes: number;
  source: ReportSource;
  topics: { name: string; weight: number }[];
  asked: AskedQuestion[];
  readiness?: ReadinessCriteria;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const join = (items: string[]) => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** A short, quotable fragment of an answer to use as evidence. */
function excerpt(answer: string, max = 150) {
  const first = answer.trim().split(/(?<=[.!?])\s+/)[0] ?? answer;
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first;
}

function priorityFor(score: number): Priority {
  return score < 60 ? "high" : score < 75 ? "medium" : "low";
}

function evaluateQuestion(asked: AskedQuestion, number: number): QuestionEvaluation {
  const knowledge = knowledgeFor(asked.topic).questions;
  const bank = knowledge[asked.knowledgeIndex ?? 0] ?? knowledge[0];
  const strong = asked.score >= 8;
  const evaluation = strong
    ? "A clear, accurate answer that covered the key ideas and the reasoning behind them."
    : asked.score >= 6
      ? "A correct but incomplete answer. The core idea was right and some important details were missing."
      : "The answer touched the topic but the main concepts were not yet clear.";
  return {
    id: `q${number}`,
    number,
    topic: asked.topic,
    difficulty: asked.difficulty,
    kind: asked.kind ?? "main",
    question: asked.text,
    answer: asked.answer,
    score: asked.score,
    evaluation,
    correct: strong ? bank.correct.concat(bank.missing.slice(0, 1).map((item) => `You covered: ${lowerFirst(item)}`)) : bank.correct,
    missing: strong ? [] : bank.missing,
    betterApproach: bank.betterApproach,
    interviewerFeedback: strong ? "Excellent answer. Keep structuring explanations this way." : bank.feedback,
  };
}

function topicScores(config: ReportInput["topics"], questions: QuestionEvaluation[]): TopicScore[] {
  return config.map(({ name, weight }) => {
    const mine = questions.filter((question) => question.topic === name);
    return {
      topic: name,
      weight,
      questionsAsked: mine.length,
      score: mine.length === 0 ? null : Math.round((mine.reduce((sum, question) => sum + question.score, 0) / mine.length) * 10),
    };
  });
}

function communication(overall: number, questions: QuestionEvaluation[]): { metrics: CommunicationMetric[]; note: string } {
  const answered = questions.length || 1;
  const avgWords = questions.reduce((sum, question) => sum + question.answer.split(/\s+/).length, 0) / answered;
  const strongShare = questions.filter((question) => question.score >= 8).length / answered;
  const metric = (key: string, label: string, score: number, note: string): CommunicationMetric => ({
    key,
    label,
    score: Math.round(clamp(score, 20, 98)),
    note,
  });
  return {
    metrics: [
      metric("clarity", "Answer clarity", overall + 4, "Ideas were stated plainly, and key terms were defined before being used."),
      metric("structure", "Explanation structure", overall + (strongShare > 0.5 ? 3 : -4), "Answers usually moved from the idea to a reason to an example."),
      metric("conciseness", "Conciseness", clamp(100 - Math.abs(avgWords - 38) * 1.2, 40, 95), `Answers averaged about ${Math.round(avgWords)} words, ${avgWords > 55 ? "which is on the long side" : "a comfortable length for spoken answers"}.`),
      metric("examples", "Use of practical examples", overall - 6 + strongShare * 10, "Examples were most convincing when tied to real project work."),
      metric("followups", "Handling follow-up questions", overall - 2, "Follow-up questions were answered directly and built on earlier answers."),
    ],
    note: "Confidence is deliberately not scored: it cannot be measured reliably from speech. Accents, pauses and minor grammar are not penalised.",
  };
}

export function generateReport(input: ReportInput): CandidateReport {
  const questions = input.asked.map((asked, index) => evaluateQuestion(asked, index + 1));
  const topics = topicScores(input.topics, questions);
  const overall = weightedOverall(topics);
  const assessed = topics.filter((topic): topic is TopicScore & { score: number } => topic.score !== null);
  const byScore = [...assessed].sort((a, b) => b.score - a.score);
  const strongTopics = byScore.filter((topic) => topic.score >= 70).slice(0, 4);
  const weakTopics = [...byScore].reverse().filter((topic) => topic.score < 80).slice(0, 3);

  const strengths: Strength[] = strongTopics.map((topic) => {
    const best = [...questions].filter((question) => question.topic === topic.topic).sort((a, b) => b.score - a.score)[0];
    const copy = knowledgeFor(topic.topic).strength;
    return { title: copy.title, topic: topic.topic, explanation: copy.explanation, question: best.question, evidence: excerpt(best.answer) };
  });
  const communicationBlock = communication(overall, questions);
  const clarity = communicationBlock.metrics[0];
  if (clarity.score >= 70) {
    const sample = [...questions].sort((a, b) => b.score - a.score)[0];
    strengths.push({
      title: "Structured communication",
      topic: "Communication",
      explanation: "Your answers were organised and easy to follow. You stated the idea first and then explained how it works.",
      question: sample?.question ?? "Across the interview",
      evidence: sample ? excerpt(sample.answer) : "Across the interview",
    });
  }

  const improvements: Improvement[] = weakTopics.map((topic) => {
    const copy = knowledgeFor(topic.topic).improvement;
    const missingFromAnswers = questions.filter((question) => question.topic === topic.topic).flatMap((question) => question.missing).slice(0, 2);
    return {
      area: topic.topic,
      current: topic.score,
      missing: missingFromAnswers.length ? `${copy.missing} Specifically: ${join(missingFromAnswers.map(lowerFirst))}.` : copy.missing,
      whyItMatters: copy.whyItMatters,
      actions: copy.actions,
      priority: priorityFor(topic.score),
    };
  });

  const roadmap: RoadmapItem[] = weakTopics.map((topic, index) => {
    const copy = knowledgeFor(topic.topic).roadmap;
    return {
      priority: index + 1,
      level: priorityFor(topic.score),
      topic: topic.topic,
      objective: copy.objective,
      steps: copy.steps,
      resources: copy.resources,
      estimatedHours: copy.hours,
    };
  });

  const strongest = byScore[0]?.topic ?? "your fundamentals";
  const gap = weakTopics[0]?.topic ?? "advanced depth";
  const readiness = readinessFor(overall, topics, input.readiness ?? DEFAULT_READINESS);
  const firstName = input.candidate.name.split(" ")[0];
  const covered = join(strongTopics.slice(0, 3).map((topic) => topic.topic));

  const summary = strongTopics.length
    ? `You demonstrated a good understanding of ${covered}. Your answers were generally structured and technically accurate. ${weakTopics.length ? `You could improve your explanation of ${join(weakTopics.slice(0, 2).map((topic) => topic.topic))}.` : "Keep practising with harder follow-ups."}`
    : `This interview showed you are building your foundations. Focus on ${gap} first and use the plan below to get ready for the next attempt.`;

  return {
    id: input.id,
    interviewId: input.interviewId,
    interviewTitle: input.interviewTitle,
    role: input.role,
    candidate: input.candidate,
    completedAt: input.completedAt,
    durationMinutes: input.durationMinutes,
    status: "completed",
    source: input.source,
    overall,
    summary,
    strengths,
    improvements,
    topics,
    questions,
    communication: communicationBlock,
    roadmap,
    finalAssessment: {
      narrative: [
        `${firstName}, you have a ${overall >= 75 ? "solid" : overall >= 60 ? "reasonable" : "developing"} foundation${strongTopics.length ? `, particularly in ${join(strongTopics.slice(0, 2).map((topic) => topic.topic))}` : ""}. ${strengths[0] ? lowerFirst(strengths[0].explanation).replace(/^you /, "Your answers show you ") : ""}`.trim(),
        weakTopics.length
          ? `Your main areas to develop are ${join(weakTopics.slice(0, 2).map((topic) => topic.topic))}. ${improvements[0]?.missing ?? ""}`
          : "There were no clear gaps in the topics assessed.",
        `With focused preparation on ${gap}, you can meaningfully improve your performance in technical interviews of this format.`,
      ],
      readiness,
      strongestSkill: strongest,
      biggestGap: gap,
      nextStep: roadmap[0] ? `Start with "${roadmap[0].objective}" (about ${roadmap[0].estimatedHours} hours).` : "Take another interview with harder topics to find your next gap.",
    },
  };
}
