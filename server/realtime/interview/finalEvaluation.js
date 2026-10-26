/**
 * Deterministic final evaluation from persisted per-answer evaluations. No extra model call:
 * the numbers are reproducible and auditable from the stored answers.
 */
const SCORED_STATUS = "EVALUATED";
const MAX_ITEMS = 8;

function unique(values) {
  const seen = new Set();
  const out = [];
  for (const v of values) {
    const key = v.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(v);
    }
  }
  return out;
}

const mean = (nums) => (nums.length ? Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 10) / 10 : null);

/**
 * answers: [{ topic, status, skipped, evaluation: {score, strengths, missingConcepts, incorrectConcepts, ...} }]
 * Only answers whose own status is EVALUATED are scored. An answer the interviewer asked to clarify
 * (CLARIFICATION_REQUESTED) keeps its evaluation for audit but does not count: the clarified reply does.
 * PENDING, SUPERSEDED, SKIPPED and EVALUATION_FAILED answers never count and are never treated as zero.
 */
function buildFinalEvaluation(answers, settings = null) {
  const scored = answers.filter((a) => a.status === SCORED_STATUS && a.evaluation?.status === SCORED_STATUS && !a.skipped);
  const unscored = answers.length - scored.length;

  const byTopic = new Map();
  for (const a of scored) {
    const topic = a.topic || "General";
    if (!byTopic.has(topic)) byTopic.set(topic, []);
    byTopic.get(topic).push(a.evaluation.score);
  }
  const topicWiseScores = [...byTopic].map(([topic, scores]) => ({ topic, score: mean(scores), answers: scores.length }));

  const strengths = unique(scored.flatMap((a) => a.evaluation.strengths)).slice(0, MAX_ITEMS);
  const weaknesses = unique(scored.flatMap((a) => [...a.evaluation.missingConcepts, ...a.evaluation.incorrectConcepts])).slice(0, MAX_ITEMS);
  const recommendations = unique(scored.flatMap((a) => a.evaluation.suggestedFollowUpAreas)).slice(0, MAX_ITEMS);

  return {
    evaluationStatus: scored.length ? "COMPLETE" : "INSUFFICIENT_DATA",
    overallScore: weightedScore(topicWiseScores, settings) ?? mean(scored.map((a) => a.evaluation.score)),
    answeredCount: scored.length,
    unscoredCount: unscored, // skipped, or the evaluation call failed; never counted as zero
    topicWiseScores,
    strengths,
    weaknesses,
    recommendations,
  };
}

/** Mean of topic scores weighted by the interview's configured topic weights; null when no weights apply. */
function weightedScore(topicWiseScores, settings) {
  const weightOf = (name) => (settings?.topics || []).find((t) => t.name.toLowerCase() === String(name).toLowerCase())?.weight ?? 0;
  const weighted = topicWiseScores.filter((t) => weightOf(t.topic) > 0);
  const total = weighted.reduce((sum, t) => sum + weightOf(t.topic), 0);
  if (total === 0) return null;
  return Math.round((weighted.reduce((sum, t) => sum + t.score * weightOf(t.topic), 0) / total) * 10) / 10;
}

module.exports = { buildFinalEvaluation, weightedScore };
