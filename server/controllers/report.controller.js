const { canManageInterview, interviewScope, hasRole, ROLES } = require("../auth/policies");
const { buildReport, summarizeReport } = require("../reports/buildReport");

const NOT_FOUND = { success: false, message: "Report not found" };
const MAX_REPORTS = 200;

/**
 * Read-only report endpoints over the evaluations the realtime pipeline stores.
 * Managers see reports for interviews they may manage; a candidate sees only their own sessions.
 * Without enforced auth (`req.user` unset) the legacy open behaviour applies, as for interviews.
 */
function createReportController({ Interview, InterviewEvaluation, InterviewAnswer, InterviewSession }) {
  const fail = (res, error, label) => {
    console.error(`${label}:`, error.message);
    return res.status(500).json({ success: false, message: "Server Error" });
  };

  const list = async (req, res) => {
    try {
      let filter = { evaluationStatus: "COMPLETE" };
      let interviews;
      if (req.user && hasRole(req.user, ROLES.CANDIDATE)) {
        filter = { ...filter, userId: String(req.user.id) };
      } else if (req.user) {
        const scope = interviewScope(req.user);
        if (!scope) return res.status(403).json({ success: false, message: "Not allowed" });
        interviews = await Interview.find(scope).lean();
        filter = { ...filter, interviewId: { $in: interviews.map((i) => String(i._id)) } };
      }
      const evaluations = await InterviewEvaluation.find(filter).sort({ createdAt: -1 }).limit(MAX_REPORTS).lean();
      if (!interviews) {
        const ids = [...new Set(evaluations.map((e) => e.interviewId))];
        interviews = ids.length ? await Interview.find({ _id: { $in: ids } }).lean() : [];
      }
      const titles = new Map(interviews.map((i) => [String(i._id), i]));
      res.status(200).json({ success: true, reports: evaluations.map((evaluation) => summarizeReport({ interview: titles.get(String(evaluation.interviewId)), evaluation })) });
    } catch (error) {
      fail(res, error, "Error listing reports");
    }
  };

  const get = async (req, res) => {
    try {
      const sessionId = String(req.params.sessionId || "");
      if (!/^sess_[A-Za-z0-9-]{8,64}$/.test(sessionId)) return res.status(404).json(NOT_FOUND);
      const evaluation = await InterviewEvaluation.findOne({ sessionId }).lean();
      if (!evaluation || evaluation.evaluationStatus !== "COMPLETE") return res.status(404).json(NOT_FOUND);
      const interview = evaluation.interviewId ? await Interview.findById(evaluation.interviewId).lean() : null;
      if (req.user) {
        const allowed = hasRole(req.user, ROLES.CANDIDATE) ? String(evaluation.userId) === String(req.user.id) : canManageInterview(req.user, interview);
        if (!allowed) return res.status(404).json(NOT_FOUND); // same answer as "does not exist"
      }
      const [answers, session] = await Promise.all([InterviewAnswer.find({ sessionId }).sort({ createdAt: 1 }).limit(200).lean(), InterviewSession.findOne({ sessionId }).lean()]);
      res.status(200).json({ success: true, report: buildReport({ interview, session, evaluation, answers }) });
    } catch (error) {
      fail(res, error, "Error building report");
    }
  };

  return { list, get };
}

module.exports = { createReportController };
