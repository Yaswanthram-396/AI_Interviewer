const { canManageInterview, hasRole, ROLES } = require("../auth/policies");
const { computeProgress } = require("../interviews/progress");

const NOT_FOUND = { success: false, message: "Session not found" };

/** Live progress of an interview session, read from the backend's persisted state (never from a client timer). */
function createSessionController({ InterviewSession, Interview }) {
  const progress = async (req, res) => {
    try {
      const sessionId = String(req.params.sessionId || "");
      if (!/^sess_[A-Za-z0-9-]{8,64}$/.test(sessionId)) return res.status(404).json(NOT_FOUND);
      const session = await InterviewSession.findOne({ sessionId }).lean();
      if (!session) return res.status(404).json(NOT_FOUND);
      if (req.user) {
        let allowed;
        if (hasRole(req.user, ROLES.CANDIDATE)) allowed = String(session.userId) === String(req.user.id);
        else allowed = canManageInterview(req.user, session.interviewId ? await Interview.findById(session.interviewId).lean() : null);
        if (!allowed) return res.status(404).json(NOT_FOUND); // same answer as "does not exist"
      }
      const result = computeProgress({ details: session.interviewDetails, engineState: session.engineState, completedAt: session.completedAt });
      res.status(200).json({ success: true, sessionId, progress: result });
    } catch (error) {
      console.error("Error reading session progress:", error.message);
      res.status(500).json({ success: false, message: "Server Error" });
    }
  };
  return { progress };
}

module.exports = { createSessionController };
