const express = require("express");
const { getAuth } = require("../auth");
const { ROLES } = require("../auth/policies");
const { createInterviewController } = require("../controllers/interview.controller");

/** Builds the interview router; dependencies are injectable for tests. */
function createInterviewRoutes({ Interview, auth, templates = null }) {
  const router = express.Router();
  const { gate } = auth;
  const c = createInterviewController({ Interview, authService: auth.service, templates });

  // gate() is enforced only when AUTH_ENFORCED=true; handlers scope by req.user when present.
  router.get("/", gate(), c.getInterviews);
  router.post("/create-interview", gate(ROLES.RECRUITER, ROLES.ADMIN), c.createInterview);
  router.post("/:id/assign", gate(ROLES.RECRUITER, ROLES.ADMIN), c.assignCandidate);
  router.post("/:id/assignments", gate(ROLES.RECRUITER, ROLES.ADMIN), c.addAssignments);
  router.delete("/:id/assignments/:assignmentId", gate(ROLES.RECRUITER, ROLES.ADMIN), c.removeAssignment);
  router.put("/:id", gate(ROLES.RECRUITER, ROLES.ADMIN), c.updateInterview);
  router.get("/:id", gate(), c.getInterview);
  return router;
}

const { createTemplateService } = require("../interviews/templates/service");

module.exports = createInterviewRoutes({
  Interview: require("../models/Interview"),
  auth: getAuth(),
  templates: createTemplateService({
    InterviewTemplate: require("../models/interviewTemplate.model"),
    InterviewTopic: require("../models/interviewTopic.model"),
    InterviewQuestionBank: require("../models/interviewQuestionBank.model"),
  }),
});
module.exports.createInterviewRoutes = createInterviewRoutes;
