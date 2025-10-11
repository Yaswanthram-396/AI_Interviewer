const mongoose = require("mongoose");
const Interview = require("../models/Interview");

const createInterview = async (req, res) => {
  try {
    const { assessmentId } = req.params;
    const { title, description, difficulty, interviewDate, interviewTime } =
      req.body;
    if (!title || !interviewDate || !interviewTime) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }
    const newInterview = new Interview({
      // assessmentId: mongoose.Types.ObjectId(assessmentId),
      title,
      description,
      difficulty,
      interviewDate,
      interviewTime,
    });
    await newInterview.save();
    res.status(201).json({
      success: true,
      message: "Interview created successfully",
      interview: newInterview,
    });
  } catch (error) {
    console.error("Error creating interview:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
const getInterviews = async (req, res) => {
  try {
    const interviews = await Interview.find();
    res.status(200).json({ success: true, interviews });
  } catch (error) {
    console.error("Error fetching interviews:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
module.exports = {
  createInterview,
  getInterviews,
};
