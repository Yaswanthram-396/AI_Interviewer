const express = require("express");
const { getAuth } = require("../auth");
const { createSessionController } = require("../controllers/session.controller");

function createSessionRoutes({ InterviewSession, Interview, auth }) {
  const router = express.Router();
  const c = createSessionController({ InterviewSession, Interview });
  router.get("/:sessionId/progress", auth.gate(), c.progress);
  return router;
}

module.exports = createSessionRoutes({ InterviewSession: require("../models/interviewSession.model"), Interview: require("../models/Interview"), auth: getAuth() });
module.exports.createSessionRoutes = createSessionRoutes;
