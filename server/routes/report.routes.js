const express = require("express");
const { getAuth } = require("../auth");
const { createReportController } = require("../controllers/report.controller");

/** Builds the report router; models and auth are injectable for tests. */
function createReportRoutes({ models, auth }) {
  const router = express.Router();
  const c = createReportController(models);
  router.get("/", auth.gate(), c.list);
  router.get("/:sessionId", auth.gate(), c.get);
  return router;
}

module.exports = createReportRoutes({
  models: {
    Interview: require("../models/Interview"),
    InterviewEvaluation: require("../models/interviewEvaluation.model"),
    InterviewAnswer: require("../models/interviewAnswer.model"),
    InterviewSession: require("../models/interviewSession.model"),
  },
  auth: getAuth(),
});
module.exports.createReportRoutes = createReportRoutes;
