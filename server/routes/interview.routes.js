const express = require("express");
const { body } = require("express-validator");
const { createInterview } = require("../controllers/interview.controller");
const { getInterviews } = require("../controllers/interview.controller");
const router = express.Router();

router.get("/", getInterviews);
router.post("/create-interview", createInterview);
module.exports = router;
