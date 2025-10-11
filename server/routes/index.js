const express = require("express");
const { body } = require("express-validator");
const interviews = require("../routes/interview.routes");

const router = express.Router();

router.use("/interviews", interviews);

module.exports = router;
