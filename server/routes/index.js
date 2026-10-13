const express = require("express");
const { body } = require("express-validator");
const interviews = require("../routes/interview.routes");

const { getAuth } = require("../auth");

const router = express.Router();

router.use("/auth", getAuth().router);

router.use("/interviews", interviews);

module.exports = router;
