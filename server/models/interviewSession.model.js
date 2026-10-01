const mongoose = require("mongoose");

const InterviewSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  history: [
    {
      role: {
        type: String,
        enum: ["system", "user", "assistant"],
        required: true,
      },
      content: { type: String, required: true },
      turnId: { type: String },
      at: { type: Date, default: Date.now },
    },
  ],
  interviewId: { type: String }, // Optional
  interviewDetails: {
    title: String,
    description: String,
    difficulty: String,
  },
  created: { type: Date, default: Date.now },
  lastUpdated: { type: Date, default: Date.now },
  expiresAt: { type: Date },
});

InterviewSessionSchema.index({ expiresAt: 1 });

module.exports = mongoose.model("InterviewSession", InterviewSessionSchema);
