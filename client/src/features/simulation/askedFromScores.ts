import type { AskedQuestion } from "@/features/reports/generateReport";
import { knowledgeFor } from "./knowledge";

/** The question plan for one topic: which knowledge questions are asked, in order. */
export function plannedQuestions(topic: string, count: number) {
  const bank = knowledgeFor(topic).questions;
  return Array.from({ length: count }, (_, index) => ({ topic, knowledgeIndex: index % bank.length, ...bank[index % bank.length] }));
}

/** Builds the asked-question list from explicit per-topic scores (0-10), e.g. { JavaScript: [9, 9] }. */
export function askedFromScores(scores: Record<string, number[]>): AskedQuestion[] {
  const asked: AskedQuestion[] = [];
  for (const [topic, topicScores] of Object.entries(scores)) {
    const bank = knowledgeFor(topic).questions;
    topicScores.forEach((score, index) => {
      const knowledgeIndex = index % bank.length;
      const question = bank[knowledgeIndex];
      asked.push({
        topic,
        text: question.text,
        difficulty: question.difficulty,
        answer: score >= 8 ? question.strongAnswer : question.partialAnswer,
        score,
        knowledgeIndex,
      });
    });
  }
  return asked;
}
