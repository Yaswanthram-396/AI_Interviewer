const express = require("express");
const { body } = require("express-validator");
const interviews = require("../routes/interview.routes");
const reports = require("../routes/report.routes");

const { getAuth } = require("../auth");

const router = express.Router();

router.use("/auth", getAuth().router);

router.use("/interviews", interviews);
router.use("/reports", reports);
router.use("/interview-templates", require("../routes/template.routes"));
router.use("/interview-sessions", require("../routes/session.routes"));

module.exports = router;
