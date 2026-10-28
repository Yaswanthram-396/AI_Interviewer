const { ObjectId } = require("mongoose").Types;

/** Describes an Interview document as the details the interviewer prompt needs. */
function toInterviewDetails(interview) {
  const title = interview.title || "Software Engineer";
  return {
    title,
    description: interview.description || "No description available.",
    difficulty: title.toLowerCase().includes("senior") ? "Advanced" : interview.difficulty || "Beginner",
  };
}

/** MongoDB-backed persistence. All methods are async and safe to call without awaiting results. */
function createMongoStore({ InterviewSession, Interview }) {
  return {
    async getInterview(id) {
      if (!ObjectId.isValid(id)) return null;
      const doc = await Interview.findById(id).lean();
      return doc ? toInterviewDetails(doc) : null;
    },
    async loadSession(sessionId) {
      return InterviewSession.findOne({ sessionId }).lean();
    },
    async createSession({ sessionId, interviewId, interviewDetails, expiresAt }) {
      await InterviewSession.create({ sessionId, interviewId, interviewDetails, history: [], expiresAt });
    },
    async appendEntries(sessionId, { entries, expiresAt }) {
      await InterviewSession.updateOne(
        { sessionId },
        { $set: { lastUpdated: new Date(), expiresAt }, $push: { history: { $each: entries } } }
      );
    },
  };
}

/** In-memory store for tests. */
function createMemoryStore({ interviews = {} } = {}) {
  const sessions = new Map();
  return {
    sessions,
    async getInterview(id) {
      return interviews[id] || null;
    },
    async loadSession(sessionId) {
      const s = sessions.get(sessionId);
      return s ? structuredClone(s) : null;
    },
    async createSession(s) {
      sessions.set(s.sessionId, { ...s, history: [] });
    },
    async appendEntries(sessionId, { entries, expiresAt }) {
      const s = sessions.get(sessionId);
      if (!s) return;
      s.history.push(...entries);
      s.expiresAt = expiresAt;
    },
  };
}

module.exports = { createMongoStore, createMemoryStore, toInterviewDetails };
