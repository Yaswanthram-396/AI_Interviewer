const express = require("express");
const { body } = require("express-validator");
const { createInterview } = require("../controllers/interview.controller");
const {
  getInterviews,
  generateInterviewQuestions,
  generateInterviewResults,
  createSession,
  validateSession,
} = require("../controllers/interview.controller");
const router = express.Router();

router.get("/interviews", getInterviews);
router.post("/create-interview", createInterview);
router.post("/interviews/generate-questions", generateInterviewQuestions);
router.post("/interviews/submit-answers", generateInterviewResults);
router.post("/create/session", createSession);
router.get("/validate/session/:sessionId", validateSession);
module.exports = router;
