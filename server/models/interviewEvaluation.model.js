const mongoose = require("mongoose");

/** Final, deterministic evaluation of one interview session, built from its stored answers. */
const InterviewEvaluationSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  interviewId: { type: String, index: true },
  userId: { type: String },
  userEmail: { type: String },
  userName: { type: String },
  evaluationStatus: { type: String, enum: ["COMPLETE", "INSUFFICIENT_DATA"], required: true },
  overallScore: { type: Number, min: 0, max: 10, default: null },
  answeredCount: { type: Number, default: 0 },
  unscoredCount: { type: Number, default: 0 },
  topicWiseScores: [{ _id: false, topic: String, score: Number, answers: Number }],
  strengths: [String],
  weaknesses: [String],
  recommendations: [String],
  completionReason: { type: String },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("InterviewEvaluation", InterviewEvaluationSchema);
