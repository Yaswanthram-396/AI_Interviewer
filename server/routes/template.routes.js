const express = require("express");
const { getAuth } = require("../auth");
const { ROLES } = require("../auth/policies");
const { createTemplateService } = require("../interviews/templates/service");
const { createTemplateController } = require("../controllers/template.controller");

/**
 * Interview template routes. A template becomes a runnable interview through the existing
 * POST /api/interviews/create-interview ({ templateId }); sessions run over the existing WebSocket.
 */
function createTemplateRoutes({ models, auth }) {
  const router = express.Router();
  const { gate } = auth;
  const c = createTemplateController({ service: createTemplateService(models) });

  router.get("/", gate(), c.list);
  router.post("/", gate(ROLES.ADMIN), c.create);
  router.get("/:ref", gate(), c.get);
  router.put("/:ref", gate(ROLES.ADMIN), c.update);
  router.get("/:ref/topics", gate(), c.topics);
  // The bank carries the evaluator's answer key: managers only.
  router.get("/:ref/topics/:topicId/questions", gate(ROLES.RECRUITER, ROLES.ADMIN), c.questions);
  return router;
}

module.exports = createTemplateRoutes({
  models: {
    InterviewTemplate: require("../models/interviewTemplate.model"),
    InterviewTopic: require("../models/interviewTopic.model"),
    InterviewQuestionBank: require("../models/interviewQuestionBank.model"),
  },
  auth: getAuth(),
});
module.exports.createTemplateRoutes = createTemplateRoutes;
