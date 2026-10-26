const { ObjectId } = require("mongoose").Types;
const { buildTemplateSnapshot, settingsFromSnapshot } = require("../interviews/templates/snapshot");
const { rankCandidates, toReference } = require("../interviews/templates/selection");

// Bank questions fetched per topic before ranking; a topic's bank is small, so this covers all of it.
const BANK_FETCH_LIMIT = 80;

/** Describes an Interview document as the details the interviewer prompt needs. */
function toInterviewDetails(interview) {
  const title = interview.title || "Software Engineer";
  return {
    title,
    description: interview.description || "No description available.",
    difficulty: title.toLowerCase().includes("senior") ? "Advanced" : interview.difficulty || "Beginner",
    timeLimit: interview.timeLimit ?? null, // minutes
    settings: interview.settings ?? null, // topics, question counts, behaviour (see interviews/settings.js)
  };
}

/**
 * Splits an answer record into a Mongo update. A PENDING write never downgrades the status of a
 * record that already has one, so replaying a turn cannot undo a finished evaluation.
 */
function toAnswerUpdate(record) {
  const { status, ...rest } = record;
  if (status === "PENDING") return { $set: rest, $setOnInsert: { status, createdAt: new Date() } };
  return { $set: { ...rest, status }, $setOnInsert: { createdAt: new Date() } };
}

/** MongoDB-backed persistence. All methods are async and safe to call without awaiting results. */
function createMongoStore({ InterviewSession, Interview, InterviewAnswer, InterviewEvaluation, InterviewTemplate, InterviewTopic, InterviewQuestionBank, random = Math.random }) {
  return {
    /**
     * Interview details for a new session. An interview created from a template reads the template's
     * *current* configuration here; the session then freezes it (see createSession), so later template
     * edits never reach an interview already in progress.
     */
    async getInterview(id) {
      if (!ObjectId.isValid(id)) return null;
      const doc = await Interview.findById(id).lean();
      if (!doc) return null;
      const details = toInterviewDetails(doc);
      if (!doc.templateId || !InterviewTemplate) return details;
      const template = await InterviewTemplate.findById(doc.templateId).lean();
      if (!template) return details; // the template is gone: fall back to the interview's own settings
      const topics = await InterviewTopic.find({ interviewTemplateId: template._id }).lean();
      const snapshot = buildTemplateSnapshot(template, topics);
      return { ...details, timeLimit: snapshot.durationMinutes, settings: settingsFromSnapshot(snapshot, doc.settings ?? {}), template: snapshot };
    },
    /** Reference questions for the next main question of a template topic, best fit first; never answer keys. */
    async pickBankQuestions({ templateId, topicId, difficulty, questionType, excludeIds = [], limit = 3 }) {
      if (!InterviewQuestionBank || !ObjectId.isValid(templateId) || !ObjectId.isValid(topicId)) return [];
      const exclude = excludeIds.filter((x) => ObjectId.isValid(x));
      const docs = await InterviewQuestionBank.find({ interviewTemplateId: templateId, topicId, isActive: true, ...(exclude.length && { _id: { $nin: exclude } }) })
        .select("questionText difficulty questionType expectedConcepts evaluationCriteria")
        .limit(BANK_FETCH_LIMIT)
        .lean();
      return rankCandidates(docs.map(toReference), { difficulty, questionType, limit, random });
    },
    async getInterviewAccess(id) {
      if (!ObjectId.isValid(id)) return null;
      const doc = await Interview.findById(id).select("ownerId candidateId status assignments").lean();
      return doc ? { ownerId: doc.ownerId, candidateId: doc.candidateId, status: doc.status, assignments: doc.assignments } : null;
    },
    async loadSession(sessionId) {
      return InterviewSession.findOne({ sessionId }).lean();
    },
    async createSession({ sessionId, interviewId, interviewDetails, expiresAt, userId, userEmail, userName }) {
      const template = interviewDetails?.template;
      await InterviewSession.create({ sessionId, interviewId, interviewDetails, userId, userEmail, userName, history: [], expiresAt, ...(template && { templateId: template.templateId, templateVersion: template.version }) });
    },
    /**
     * Updates the signed-in candidate's assignment on an interview (matched by account id, or by the
     * email it was assigned to, which also binds the account id). A completed assignment never moves back.
     */
    async markAssignment(interviewId, user, patch, { keepCompleted = false } = {}) {
      if (!ObjectId.isValid(interviewId) || !user?.id) return;
      const email = String(user.email || "").toLowerCase();
      const set = { "assignments.$[a].userId": String(user.id) };
      for (const [key, value] of Object.entries(patch)) set[`assignments.$[a].${key}`] = value;
      const mine = [{ userId: String(user.id) }, ...(email ? [{ email }] : [])];
      const notDone = keepCompleted ? { status: { $ne: "completed" } } : {};
      // The filter requires a matching assignment to exist: interviews created before assignments existed have
      // no `assignments` field at all, and an array update on a missing path is a MongoDB error.
      await Interview.updateOne(
        { _id: interviewId, assignments: { $elemMatch: { $or: mine, ...notDone } } },
        { $set: set },
        {
          arrayFilters: [
            { $and: [{ $or: mine.map((m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [`a.${k}`, v]))) }, ...(keepCompleted ? [{ "a.status": { $ne: "completed" } }] : [])] },
          ],
        }
      );
    },
    async appendEntries(sessionId, { entries, expiresAt }) {
      await InterviewSession.updateOne(
        { sessionId },
        { $set: { lastUpdated: new Date(), expiresAt }, $push: { history: { $each: entries } } }
      );
    },
    async saveEngineState(sessionId, { engineState, conversationState, completedAt }) {
      await InterviewSession.updateOne(
        { sessionId },
        { $set: { engineState, conversationState, lastUpdated: new Date(), ...(completedAt && { completedAt }) } }
      );
    },
    async saveAnswer(sessionId, interviewId, record) {
      await InterviewAnswer.updateOne({ sessionId, turnId: record.turnId }, { ...toAnswerUpdate({ ...record, interviewId }) }, { upsert: true });
    },
    /** Marks an unevaluated answer as replaced by a newer one. Never touches a record that was already evaluated. */
    async markAnswerSuperseded(sessionId, turnId, supersededBy) {
      await InterviewAnswer.updateOne({ sessionId, turnId, status: "PENDING" }, { $set: { status: "SUPERSEDED", supersededBy } });
    },
    async loadAnswers(sessionId) {
      return InterviewAnswer.find({ sessionId }).sort({ createdAt: 1 }).limit(200).lean();
    },
    async saveFinalEvaluation(sessionId, evaluation) {
      await InterviewEvaluation.updateOne({ sessionId }, { $set: evaluation }, { upsert: true });
    },
  };
}

/** In-memory store for tests. */
function createMemoryStore({ interviews = {}, access = {}, bankQuestions = [], random = Math.random } = {}) {
  const sessions = new Map();
  const answers = new Map(); // `${sessionId}:${turnId}` -> record
  const evaluations = new Map();
  const assignmentUpdates = []; // recorded so tests can assert on them
  return {
    sessions,
    assignmentUpdates,
    answers,
    evaluations,
    async getInterview(id) {
      return interviews[id] || null;
    },
    async getInterviewAccess(id) {
      return access[id] || null;
    },
    /** bankQuestions: [{ id, topicId, text, questionType, difficulty, expectedConcepts, evaluationCriteria }] */
    async pickBankQuestions({ topicId, difficulty, questionType, excludeIds = [], limit = 3 }) {
      const pool = bankQuestions.filter((q) => String(q.topicId) === String(topicId) && !excludeIds.includes(q.id));
      return rankCandidates(pool, { difficulty, questionType, limit, random });
    },
    async loadSession(sessionId) {
      const s = sessions.get(sessionId);
      return s ? structuredClone(s) : null;
    },
    async createSession(s) {
      sessions.set(s.sessionId, { userId: null, ...s, history: [] });
    },
    async markAssignment(interviewId, user, patch, options) {
      assignmentUpdates.push({ interviewId, user, patch, options });
    },
    async appendEntries(sessionId, { entries, expiresAt }) {
      const s = sessions.get(sessionId);
      if (!s) return;
      s.history.push(...entries);
      s.expiresAt = expiresAt;
    },
    async saveEngineState(sessionId, { engineState, conversationState, completedAt }) {
      const s = sessions.get(sessionId);
      if (!s) return;
      Object.assign(s, { engineState: structuredClone(engineState), conversationState, ...(completedAt && { completedAt }) });
    },
    async saveAnswer(sessionId, interviewId, record) {
      const key = `${sessionId}:${record.turnId}`;
      const existing = answers.get(key);
      if (!existing) return void answers.set(key, { sessionId, interviewId, createdAt: new Date(), ...structuredClone(record) });
      const { status, ...rest } = structuredClone(record);
      Object.assign(existing, rest);
      if (status !== "PENDING") existing.status = status;
    },
    async markAnswerSuperseded(sessionId, turnId, supersededBy) {
      const record = answers.get(`${sessionId}:${turnId}`);
      if (record?.status === "PENDING") Object.assign(record, { status: "SUPERSEDED", supersededBy });
    },
    async loadAnswers(sessionId) {
      return [...answers.values()].filter((a) => a.sessionId === sessionId);
    },
    async saveFinalEvaluation(sessionId, evaluation) {
      evaluations.set(sessionId, { sessionId, ...structuredClone(evaluation) });
    },
  };
}

module.exports = { createMongoStore, createMemoryStore, toInterviewDetails, toAnswerUpdate };
