/**
 * A read-only view of how far an interview has got, computed from the frozen session configuration and the
 * persisted engine state. Pure: the same inputs always give the same answer, and nothing here changes the interview.
 */
const round1 = (n) => Math.round(n * 10) / 10;

/** Topics of the session: the template snapshot when there is one, otherwise the interview's own settings. */
function topicsOf(details) {
  if (details?.template?.topics) {
    return details.template.topics.map((t) => ({ name: t.name, sequence: t.sequence, questionCount: t.questionCount, allocatedMinutes: t.allocatedMinutes, weightage: t.weightage }));
  }
  return (details?.settings?.topics || []).map((t, i) => ({ name: t.name, sequence: i + 1, questionCount: t.questions, allocatedMinutes: null, weightage: t.weight }));
}

/**
 * details: the session's interviewDetails; engineState: the persisted engine snapshot (null before the interview starts).
 * Returns counts for the whole interview and per topic, the current question, and the backend's clock.
 */
function computeProgress({ details, engineState, now = Date.now(), completedAt = null }) {
  const configured = topicsOf(details);
  const totalMainQuestions = details?.settings?.mainQuestions ?? details?.template?.totalQuestions ?? configured.reduce((sum, t) => sum + t.questionCount, 0);
  const state = engineState || null;
  const counts = state?.topicCounts || {};

  const topics = configured.map((t) => {
    const asked = counts[t.name] || 0;
    return {
      name: t.name,
      sequence: t.sequence,
      questionCount: t.questionCount,
      asked,
      remaining: Math.max(0, t.questionCount - asked),
      followUpsAsked: state?.topicFollowUps?.[t.name] || 0,
      allocatedMinutes: t.allocatedMinutes,
      spentMinutes: round1((state?.topicSpentMs?.[t.name] || 0) / 60_000),
      closedByTime: !!state?.closedTopics?.[t.name],
    };
  });

  const current = state?.currentQuestion || null;
  const currentTopic = current ? topics.find((t) => t.name === current.topic) ?? null : null;
  const mainAsked = state?.mainCount || 0;
  const durationMinutes = Number(details?.timeLimit) > 0 ? Number(details.timeLimit) : null;
  const endedAt = completedAt ? new Date(completedAt).getTime() : null;
  const elapsedMs = state ? Math.max(0, (endedAt ?? now) - state.startedAt) : 0;
  const status = !state ? "not_started" : state.completed || endedAt ? "completed" : "in_progress";

  return {
    status,
    template: details?.template ? { id: details.template.templateId, slug: details.template.slug, version: details.template.version, title: details.template.title } : null,
    mainQuestions: { total: totalMainQuestions, asked: mainAsked, remaining: Math.max(0, totalMainQuestions - mainAsked) },
    followUpsAsked: topics.reduce((sum, t) => sum + t.followUpsAsked, 0),
    currentTopic: currentTopic && { name: currentTopic.name, asked: currentTopic.asked, questionCount: currentTopic.questionCount, remaining: currentTopic.remaining },
    currentQuestion: current && { id: current.id, type: current.type, topic: current.topic, text: current.text },
    topics,
    time: {
      durationMinutes,
      elapsedMinutes: round1(elapsedMs / 60_000),
      remainingMinutes: durationMinutes === null ? null : round1(Math.max(0, durationMinutes - elapsedMs / 60_000)),
      startedAt: state ? new Date(state.startedAt).toISOString() : null,
    },
  };
}

module.exports = { computeProgress };
