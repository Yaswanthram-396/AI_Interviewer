/**
 * Builds the candidate report from what the backend actually stored: the final evaluation and the
 * per-answer evaluations. Everything here is derived deterministically from those records.
 *
 * What the backend does NOT produce is left out rather than invented: there is no communication
 * assessment, no "better approach" text, no study resources or time estimates. The payload lists
 * them under `notAssessed` so the UI can say so plainly.
 */
const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const firstSentence = (text) => clip(String(text || "").trim().split(/(?<=[.!?])\s+/)[0] || "", 160);
const unique = (items) => [...new Set(items.filter(Boolean))];
const mean = (nums) => (nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : null);
const priorityFor = (score) => (score < 50 ? "high" : score < 70 ? "medium" : "low");
const join = (items) => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

function buildReport({ interview, session, evaluation, answers }) {
  const settings = interview?.settings || null;
  const scored = answers
    .filter((a) => a.status === "EVALUATED" && !a.skipped && a.questionType !== "WARMUP" && a.evaluation?.status === "EVALUATED")
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  const questions = scored.map((a, index) => ({
    id: a.turnId,
    number: index + 1,
    topic: a.topic || "General",
    difficulty: String(a.difficulty || "INTERMEDIATE").toLowerCase(),
    kind: a.questionType === "FOLLOW_UP" ? "follow-up" : "main",
    question: a.questionText || "",
    answer: a.transcript || "",
    score: a.evaluation.score,
    evaluation: a.evaluation.reasoningSummary || "",
    correct: a.evaluation.strengths || [],
    missing: [...(a.evaluation.missingConcepts || []), ...(a.evaluation.incorrectConcepts || [])],
    betterApproach: null,
    interviewerFeedback: a.evaluation.reasoningSummary || "",
  }));

  // Topic scores come from the answers (0-10 -> 0-100); configured topics that were never asked are listed as not covered.
  const byTopic = new Map();
  for (const q of questions) byTopic.set(q.topic, [...(byTopic.get(q.topic) || []), q.score]);
  const configured = Array.isArray(settings?.topics) ? settings.topics : [];
  const weightOf = (name) => configured.find((t) => t.name.toLowerCase() === name.toLowerCase())?.weight ?? 0;
  const topics = [...byTopic].map(([topic, scores]) => ({ topic, score: Math.round(mean(scores) * 10), weight: weightOf(topic), questionsAsked: scores.length }));
  for (const t of configured) {
    if (!topics.some((x) => x.topic.toLowerCase() === t.name.toLowerCase())) topics.push({ topic: t.name, score: null, weight: t.weight, questionsAsked: 0 });
  }
  // Already weighted by the configured topic weights when the interview was finalised.
  const overall = Math.round((evaluation.overallScore ?? 0) * 10);

  const assessed = topics.filter((t) => t.score !== null);
  const strongTopics = [...assessed].filter((t) => t.score >= 70).sort((a, b) => b.score - a.score).slice(0, 4);
  const weakTopics = [...assessed].filter((t) => t.score < 70).sort((a, b) => a.score - b.score).slice(0, 3);

  const strengths = strongTopics.map((t) => {
    const best = questions.filter((q) => q.topic === t.topic).sort((a, b) => b.score - a.score)[0];
    return {
      title: `Solid ${t.topic} answers`,
      topic: t.topic,
      explanation: best.correct.length ? `You covered: ${join(best.correct.map((c) => c.toLowerCase()))}.` : best.evaluation,
      question: best.question,
      evidence: firstSentence(best.answer),
    };
  });

  const improvements = weakTopics.map((t) => {
    const mine = questions.filter((q) => q.topic === t.topic);
    const missing = unique(mine.flatMap((q) => q.missing)).slice(0, 4);
    const followUps = unique(scored.filter((a) => (a.topic || "General") === t.topic).flatMap((a) => a.evaluation.suggestedFollowUpAreas || [])).slice(0, 4);
    return {
      area: t.topic,
      current: t.score,
      missing: missing.length ? `Concepts that were missing or incorrect: ${join(missing)}.` : "The answers were incomplete.",
      whyItMatters: null,
      actions: followUps.length ? followUps.map((f) => `Review ${f}`) : missing.map((m) => `Study ${m}`),
      priority: priorityFor(t.score),
    };
  });

  const roadmap = improvements.map((item, index) => ({
    priority: index + 1,
    level: item.priority,
    topic: item.area,
    objective: `Strengthen your ${item.area} answers`,
    steps: item.actions,
    resources: [],
    estimatedHours: null,
  }));

  const best = [...assessed].sort((a, b) => b.score - a.score)[0];
  const worst = weakTopics[0] ?? [...assessed].sort((a, b) => a.score - b.score)[0];
  const completedAt = evaluation.createdAt ? new Date(evaluation.createdAt).toISOString() : new Date().toISOString();
  const started = session?.created ? new Date(session.created) : null;

  return {
    id: evaluation.sessionId,
    interviewId: evaluation.interviewId,
    interviewTitle: interview?.title || "Interview",
    role: settings?.role || interview?.title || "",
    candidate: { name: evaluation.userName || session?.userName || "Candidate", email: evaluation.userEmail || session?.userEmail || "" },
    completedAt,
    durationMinutes: started ? Math.max(1, Math.round((new Date(completedAt) - started) / 60000)) : 0,
    status: "completed",
    source: "backend",
    overall,
    summary: assessed.length
      ? `You answered ${questions.length} scored ${questions.length === 1 ? "question" : "questions"} across ${assessed.length} ${assessed.length === 1 ? "topic" : "topics"}. ${best ? `Your strongest area was ${best.topic} (${best.score}/100).` : ""}${weakTopics.length ? ` The biggest opportunity is ${join(weakTopics.slice(0, 2).map((t) => t.topic))}.` : ""}`.trim()
      : "There were not enough scored answers to summarise this interview.",
    strengths,
    improvements,
    topics,
    questions,
    communication: null,
    roadmap,
    finalAssessment: {
      narrative: [
        assessed.length ? `Overall score ${overall}/100 from ${questions.length} scored ${questions.length === 1 ? "answer" : "answers"}.` : "No scored answers were recorded.",
        weakTopics.length ? `Focus next on ${join(weakTopics.slice(0, 2).map((t) => t.topic))}, starting with the concepts listed under each area.` : "There were no clear gaps in the topics assessed.",
      ],
      readiness: null, // classified in the UI from the admin-configured criteria
      strongestSkill: best?.topic ?? "—",
      biggestGap: worst?.topic ?? "—",
      nextStep: roadmap[0] ? `Work through the plan for ${roadmap[0].topic}.` : "Try an interview with harder topics.",
    },
    notAssessed: ["communication", "betterApproach", "learningResources", "studyTime"],
  };
}

/** The row shown in report lists. */
function summarizeReport({ interview, evaluation }) {
  return {
    id: evaluation.sessionId,
    interviewId: evaluation.interviewId,
    interviewTitle: interview?.title || "Interview",
    candidate: { name: evaluation.userName || "Candidate", email: evaluation.userEmail || "" },
    completedAt: evaluation.createdAt ? new Date(evaluation.createdAt).toISOString() : null,
    overall: Math.round((evaluation.overallScore ?? 0) * 10),
  };
}

module.exports = { buildReport, summarizeReport };
